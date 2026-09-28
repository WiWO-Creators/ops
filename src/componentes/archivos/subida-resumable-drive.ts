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
 * El reintento no manda el archivo de nuevo desde cero: antes de reanudar, `bytesConfirmados`
 * pregunta a Google con un `PUT` vacío y `Content-Range: bytes * /total` cuánto tiene ya, y el
 * siguiente trozo arranca justo después. Es lo que evita que reintentar un video de 800 MB con media
 * subida vuelva a mandar los primeros 400.
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
 */
export async function abrirSesionDirecta (folderId: string, archivo: File): Promise<Resultado<SesionSubidaDirecta>> {
  return await escribirEnBff<SesionSubidaDirecta>(`${rutaDeCarpeta(folderId)}/upload-sessions`, 'POST', {
    name: archivo.name,
    mimeType: archivo.type.trim() !== '' ? archivo.type : 'application/octet-stream',
    size: archivo.size
  })
}

/**
 * Cuánto tiene Google confirmado de una sesión, para reanudar un reintento.
 *
 * Un `PUT` vacío con `Content-Range: bytes * /total` no sube nada: Google contesta `308` con el
 * rango que ya recibió, o `404`/`410` si la sesión venció (24 h) y hay que abrir una nueva.
 *
 * @returns los bytes confirmados, o `null` si la sesión ya no existe
 */
async function bytesConfirmados (sessionUrl: string, total: number, senal: AbortSignal): Promise<number | null> {
  const respuesta = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` },
    signal: senal
  })

  if (respuesta.status === 404 || respuesta.status === 410) return null
  if (respuesta.status === 308) {
    const rango = respuesta.headers.get('Range')
    const fin = rango === null ? null : Number(/-(\d+)$/.exec(rango)?.[1])
    return fin === null || Number.isNaN(fin) ? 0 : fin + 1
  }
  // 200/201: Google ya tenía el archivo completo (pasó justo cuando se cortó la conexión).
  return total
}

/** El resultado de mandar todos los trozos: el id de Google, o el motivo del fallo. */
export type ResultadoTrozos =
  | { ok: true, driveFileId: string }
  | { ok: false, mensaje: string, cancelada?: boolean, reintentable: boolean }

/**
 * Manda el archivo en trozos a una sesión ya abierta, empezando en `desde` (0 en la primera vez, lo
 * que devolvió `bytesConfirmados` en un reintento).
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
      inicio = fin
      onProgreso(inicio)
      continue
    }

    if (respuesta.status === 200 || respuesta.status === 201) {
      try {
        const cuerpo = await respuesta.json() as { id?: unknown }
        if (typeof cuerpo.id === 'string' && cuerpo.id !== '') {
          onProgreso(archivo.size)
          return { ok: true, driveFileId: cuerpo.id }
        }
      } catch {
        // sigue abajo: Google confirmó el archivo pero no se pudo leer el id.
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
 */
export async function confirmarSubidaDirecta (folderId: string, driveFileId: string): Promise<Resultado<ArchivoDriveSubido>> {
  return await escribirEnBff<ArchivoDriveSubido>(
    `${rutaDeCarpeta(folderId)}/files/${encodeURIComponent(driveFileId)}/confirmar`,
    'POST',
    {}
  )
}

/** Una sesión resumable en curso, para poder reanudarla si el intento se corta. */
export interface SesionEnCurso {
  sessionUrl: string
}

/**
 * Sube un archivo grande directo a Google Drive: abre la sesión (o reanuda una previa), manda los
 * trozos con avance por bytes, y confirma en la API.
 *
 * @param sesionPrevia si viene de un reintento, la sesión que ya se había abierto: se reanuda desde
 *   donde Google confirme, en vez de abrir una sesión nueva y mandar todo de cero.
 * @param onProgreso recibe `(bytesEnviados, total)` después de cada trozo confirmado
 * @param onSesionAbierta se llama apenas se abre o reanuda la sesión, para que quien reintente después
 *   sepa a qué sesión volver
 */
export async function subirDirectoAGoogle (
  folderId: string,
  archivo: File,
  onProgreso: (bytesEnviados: number, total: number) => void,
  senal: AbortSignal,
  sesionPrevia: SesionEnCurso | undefined,
  onSesionAbierta: (sesion: SesionEnCurso) => void
): Promise<Resultado<ArchivoDriveSubido> & { cancelada?: boolean, reintentable?: boolean }> {
  let sessionUrl = sesionPrevia?.sessionUrl
  let desde = 0

  if (sessionUrl !== undefined) {
    const confirmados = await bytesConfirmados(sessionUrl, archivo.size, senal).catch(() => null)
    if (confirmados === null) {
      sessionUrl = undefined
    } else {
      desde = confirmados
      onProgreso(desde, archivo.size)
    }
  }

  if (sessionUrl === undefined) {
    const sesion = await abrirSesionDirecta(folderId, archivo)
    if (!sesion.ok) return { ok: false, mensaje: sesion.mensaje, estado: sesion.estado, reintentable: sesion.estado === undefined || sesion.estado >= 500 }
    sessionUrl = sesion.datos.sessionUrl
    onSesionAbierta({ sessionUrl })
  } else {
    onSesionAbierta({ sessionUrl })
  }

  const trozos = await mandarTrozos(sessionUrl, archivo, desde, (bytesEnviados) => { onProgreso(bytesEnviados, archivo.size) }, senal)
  if (!trozos.ok) return { ok: false, mensaje: trozos.mensaje, cancelada: trozos.cancelada, reintentable: trozos.reintentable }

  const confirmacion = await confirmarSubidaDirecta(folderId, trozos.driveFileId)
  if (!confirmacion.ok) return { ok: false, mensaje: confirmacion.mensaje, estado: confirmacion.estado, reintentable: true }

  return { ok: true, datos: confirmacion.datos, estado: confirmacion.estado }
}
