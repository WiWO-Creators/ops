import { escribirEnBff, type Resultado } from '@/componentes/datos/mutaciones'
import { rutaDeCarpeta } from '@/componentes/archivos/red-drive'
import type { ArchivoDriveSubido } from '@/datos/recursos'

/**
 * Subida resumable directa navegador → Google Drive, para los archivos que el multipart legado ya no
 * acepta (ver `UMBRAL_SUBIDA_DIRECTA_BYTES` en `dominio/drive-explorador.ts`).
 *
 * El BFF y PHP solo intervienen para abrir la sesión (`POST /drive/{folder_id}/upload-sessions`) y
 * para confirmarla (`POST /drive/{folder_id}/files/{file_id}/confirmar`) una vez que Google ya tiene
 * el archivo entero. Los trozos van por `fetch` directo a la `sessionUrl` que devuelve Google: nunca
 * pasan por Next ni por PHP, así que un video de 2 GB no pega contra el límite de memoria de un
 * proceso PHP-FPM.
 *
 * El reintento no manda el archivo de nuevo desde cero: antes de reanudar, `estadoDeSesion` pregunta
 * a Google con un `PUT` vacío y `Content-Range: bytes * /total` cuánto tiene ya, y el siguiente trozo
 * arranca justo después. Si Google ya tenía el archivo completo —o si un intento anterior llegó a
 * confirmar el último trozo pero se cortó camino a `confirmar`—, el reintento salta derecho a
 * confirmar con el `driveFileId` que ya se conoce, sin volver a abrir sesión ni a mandar un solo byte.
 */

/** Trozos de 8 MB: ni tan chico que multiplique los viajes, ni tan grande que una caída de red tire mucho al piso. */
const TAMANO_TROZO_BYTES = 8 * 1024 * 1024

/** La sesión resumable que abre `POST /drive/{folder_id}/upload-sessions`. */
export interface SesionSubidaDirecta {
  sessionUrl: string
  expiraEn: string
}

/** Errores de red o de Google que no dependen de credenciales: reintentar tiene sentido. */
const REINTENTABLE_HTTP = new Set([408, 429, 500, 502, 503, 504])

/**
 * Abre la sesión resumable en Drive para un archivo, vía el BFF.
 *
 * @param folderId la carpeta de destino
 * @param archivo el `File` a subir (solo se leen su nombre, tipo y tamaño)
 * @param senal para cancelar la apertura si la persona cancela la subida mientras se abre
 */
export async function abrirSesionDirecta (folderId: string, archivo: File, senal?: AbortSignal): Promise<Resultado<SesionSubidaDirecta>> {
  return await escribirEnBff<SesionSubidaDirecta>(`${rutaDeCarpeta(folderId)}/upload-sessions`, 'POST', {
    name: archivo.name,
    mimeType: archivo.type.trim() !== '' ? archivo.type : 'application/octet-stream',
    size: archivo.size
  }, senal)
}

/** El siguiente byte a mandar según el `Range` que Google confirmó, o `null` si no vino cabecera. */
function bytesDesdeRango (rango: string | null): number | null {
  const fin = rango === null ? null : Number(/-(\d+)$/.exec(rango)?.[1])

  return fin === null || Number.isNaN(fin) ? null : fin + 1
}

/** El id del archivo que Google devuelve en el `200`/`201` final, o `null` si el cuerpo no lo traía. */
async function idDeArchivoSubido (respuesta: Response): Promise<string | null> {
  try {
    const cuerpo = await respuesta.json() as { id?: unknown }

    return typeof cuerpo.id === 'string' && cuerpo.id !== '' ? cuerpo.id : null
  } catch {
    return null
  }
}

/** Lo que Google sabe de una sesión resumable ya abierta, al preguntarle con un `PUT` vacío. */
type EstadoSesionGoogle =
  | { vencida: true }
  | { vencida: false, completa: true, driveFileId: string }
  | { vencida: false, completa: false, bytesConfirmados: number }

/**
 * Pregunta a Google cuánto tiene confirmado de una sesión, para reanudar un reintento sin perder lo
 * ya subido.
 *
 * Un `PUT` vacío con `Content-Range: bytes * /total` no sube nada: Google contesta `308` con el rango
 * que ya recibió, `404`/`410` si la sesión venció (24 h) y hay que abrir una nueva, o `200`/`201` con
 * el archivo ya creado —pasa cuando el corte de red ocurrió justo después de que Google terminara de
 * recibir el último byte, antes de que la confirmación llegara al navegador.
 *
 * @throws lo que lance `fetch` (por ejemplo un abort): no lo convierte en "sesión vencida", porque
 *   quien llama necesita distinguir una cancelación de una sesión que de verdad ya no existe.
 */
async function estadoDeSesion (sessionUrl: string, total: number, senal: AbortSignal): Promise<EstadoSesionGoogle> {
  const respuesta = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` },
    signal: senal
  })

  if (respuesta.status === 404 || respuesta.status === 410) return { vencida: true }

  if (respuesta.status === 308) {
    return { vencida: false, completa: false, bytesConfirmados: bytesDesdeRango(respuesta.headers.get('Range')) ?? 0 }
  }

  const driveFileId = await idDeArchivoSubido(respuesta)

  return driveFileId === null
    ? { vencida: false, completa: false, bytesConfirmados: total }
    : { vencida: false, completa: true, driveFileId }
}

/** El resultado de mandar todos los trozos: el id de Google, o el motivo del fallo. */
export type ResultadoTrozos =
  | { ok: true, driveFileId: string }
  | { ok: false, mensaje: string, cancelada?: boolean, reintentable: boolean }

/**
 * Manda el archivo en trozos a una sesión ya abierta, empezando en `desde` (0 en la primera vez, lo
 * que devolvió `estadoDeSesion` en un reintento).
 *
 * @param onProgreso recibe los bytes ya confirmados por Google después de cada trozo
 */
async function mandarTrozos (
  sessionUrl: string,
  archivo: File,
  desde: number,
  onProgreso: (bytesEnviados: number) => void,
  senal: AbortSignal
): Promise<ResultadoTrozos> {
  let inicio = desde

  while (inicio < archivo.size) {
    const fin = Math.min(inicio + TAMANO_TROZO_BYTES, archivo.size)
    const trozo = archivo.slice(inicio, fin)

    let respuesta: Response
    try {
      respuesta = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${inicio}-${fin - 1}/${archivo.size}` },
        body: trozo,
        signal: senal
      })
    } catch {
      if (senal.aborted) return { ok: false, mensaje: 'Subida cancelada.', cancelada: true, reintentable: false }
      return { ok: false, mensaje: 'No se pudo contactar a Google Drive. Revisa tu conexión.', reintentable: true }
    }

    if (respuesta.status === 308) {
      // El siguiente trozo arranca donde Google dice que confirmó, no donde el cliente cree haber
      // llegado: ante una duda entre las dos fuentes, la que manda es la que va a recibir el próximo
      // `PUT`.
      inicio = bytesDesdeRango(respuesta.headers.get('Range')) ?? fin
      onProgreso(inicio)
      continue
    }

    if (respuesta.status === 200 || respuesta.status === 201) {
      const driveFileId = await idDeArchivoSubido(respuesta)
      if (driveFileId !== null) {
        onProgreso(archivo.size)
        return { ok: true, driveFileId }
      }
      return { ok: false, mensaje: 'Google Drive no informó el archivo creado. Inténtalo de nuevo.', reintentable: true }
    }

    if (respuesta.status === 404 || respuesta.status === 410) {
      return { ok: false, mensaje: 'La sesión de subida venció. Inténtalo de nuevo.', reintentable: true }
    }

    return {
      ok: false,
      mensaje: `Google Drive rechazó el archivo (código ${respuesta.status}).`,
      reintentable: REINTENTABLE_HTTP.has(respuesta.status)
    }
  }

  // El archivo ya estaba completo (reintento que arrancó justo en el último byte).
  return { ok: false, mensaje: 'No se pudo confirmar la subida.', reintentable: true }
}

/**
 * Confirma en la API que el archivo ya quedó en Drive, vía el BFF.
 *
 * @param folderId la carpeta de destino
 * @param driveFileId el id que devolvió Google al terminar los trozos
 * @param senal para cancelar la confirmación si la persona cancela justo en este paso
 */
export async function confirmarSubidaDirecta (folderId: string, driveFileId: string, senal?: AbortSignal): Promise<Resultado<ArchivoDriveSubido>> {
  return await escribirEnBff<ArchivoDriveSubido>(
    `${rutaDeCarpeta(folderId)}/files/${encodeURIComponent(driveFileId)}/confirmar`,
    'POST',
    {},
    senal
  )
}

/**
 * Una sesión resumable en curso, para poder reanudarla si el intento se corta.
 *
 * `driveFileId` solo se llena una vez que Google confirmó el archivo entero: mientras esté presente,
 * un reintento no vuelve a abrir sesión ni a mandar trozos, solo reintenta `confirmar`.
 */
export interface SesionEnCurso {
  sessionUrl: string
  driveFileId?: string
}

type ResultadoSubidaDirecta = Resultado<ArchivoDriveSubido> & { cancelada?: boolean, reintentable?: boolean }

/** La respuesta uniforme para cualquier punto donde la subida se corta por cancelación. */
const CANCELADA: ResultadoSubidaDirecta = { ok: false, mensaje: 'Subida cancelada.', cancelada: true, reintentable: false }

/** Confirma en la API y devuelve el resultado final, ya con la forma que espera quien llamó a `subirDirectoAGoogle`. */
async function confirmarYResponder (folderId: string, driveFileId: string, senal: AbortSignal): Promise<ResultadoSubidaDirecta> {
  const confirmacion = await confirmarSubidaDirecta(folderId, driveFileId, senal)

  if (!confirmacion.ok) {
    if (confirmacion.cancelada === true) return CANCELADA
    return { ok: false, mensaje: confirmacion.mensaje, estado: confirmacion.estado, reintentable: true }
  }

  return { ok: true, datos: confirmacion.datos, estado: confirmacion.estado }
}

/**
 * Sube un archivo grande directo a Google Drive: abre la sesión (o reanuda una previa), manda los
 * trozos con avance por bytes, y confirma en la API.
 *
 * @param sesionPrevia si viene de un reintento, la sesión que ya se había abierto: se reanuda desde
 *   donde Google confirme, en vez de abrir una sesión nueva y mandar todo de cero. Si ya trae
 *   `driveFileId`, el archivo ya estaba en Drive y lo único que falta es reintentar `confirmar`.
 * @param onProgreso recibe `(bytesEnviados, total)` después de cada trozo confirmado
 * @param onSesionAbierta se llama apenas se abre o reanuda la sesión, y de nuevo apenas Google
 *   confirma el archivo completo, para que quien reintente después sepa a qué sesión volver o, mejor
 *   aún, que ya no hace falta volver a subir nada.
 */
export async function subirDirectoAGoogle (
  folderId: string,
  archivo: File,
  onProgreso: (bytesEnviados: number, total: number) => void,
  senal: AbortSignal,
  sesionPrevia: SesionEnCurso | undefined,
  onSesionAbierta: (sesion: SesionEnCurso) => void
): Promise<ResultadoSubidaDirecta> {
  // El intento anterior llegó a que Google confirmara el archivo pero se cortó antes de avisarle a la
  // API: no hay nada que subir de nuevo, solo reintentar la confirmación.
  if (sesionPrevia?.driveFileId !== undefined) {
    if (senal.aborted) return CANCELADA
    return await confirmarYResponder(folderId, sesionPrevia.driveFileId, senal)
  }

  let sessionUrl = sesionPrevia?.sessionUrl
  let desde = 0

  if (sessionUrl !== undefined) {
    let estado: EstadoSesionGoogle | null = null
    try {
      estado = await estadoDeSesion(sessionUrl, archivo.size, senal)
    } catch {
      // Un abort no es una sesión vencida: tratarlo como tal terminaría abriendo una sesión nueva por
      // una cancelación que ya estaba en curso.
      if (senal.aborted) return CANCELADA
    }

    if (estado === null || estado.vencida) {
      sessionUrl = undefined
    } else if (estado.completa) {
      onSesionAbierta({ sessionUrl, driveFileId: estado.driveFileId })
      if (senal.aborted) return CANCELADA
      return await confirmarYResponder(folderId, estado.driveFileId, senal)
    } else {
      desde = estado.bytesConfirmados
      onProgreso(desde, archivo.size)
    }
  }

  if (senal.aborted) return CANCELADA

  if (sessionUrl === undefined) {
    const sesion = await abrirSesionDirecta(folderId, archivo, senal)
    if (!sesion.ok) {
      if (sesion.cancelada === true || senal.aborted) return CANCELADA
      return { ok: false, mensaje: sesion.mensaje, estado: sesion.estado, reintentable: sesion.estado === undefined || sesion.estado >= 500 }
    }
    sessionUrl = sesion.datos.sessionUrl
    onSesionAbierta({ sessionUrl })
  } else {
    onSesionAbierta({ sessionUrl })
  }

  const trozos = await mandarTrozos(sessionUrl, archivo, desde, (bytesEnviados) => { onProgreso(bytesEnviados, archivo.size) }, senal)
  if (!trozos.ok) return { ok: false, mensaje: trozos.mensaje, cancelada: trozos.cancelada, reintentable: trozos.reintentable }

  // Guardarlo ya, antes de intentar confirmar: si `confirmar` falla, el próximo reintento entra por
  // la rama de arriba y no vuelve a tocar Google.
  onSesionAbierta({ sessionUrl, driveFileId: trozos.driveFileId })

  if (senal.aborted) return CANCELADA

  return await confirmarYResponder(folderId, trozos.driveFileId, senal)
}
