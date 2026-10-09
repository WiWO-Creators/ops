import { mensajeDeLectura, mensajeDeRespuesta } from '@/datos/cliente'
import { claveDeIdempotencia, conLimite, esTiempoAgotado, TIEMPO_ESCRITURA_MS, TIEMPO_LECTURA_MS, TIEMPO_SUBIDA_MS } from '@/datos/red'
import { registrarEscritura } from '@/datos/pendientes'
import { avisarCambioDeRecurso, avisarCambioDeTareas } from '@/datos/refresco-lista'
import { segundosParaReintentar } from '@/dominio/ticket-vista'

/**
 * Escrituras desde el navegador, siempre por el BFF.
 *
 * El motor de tabla ya sabe leer; lo que falta es una unica forma de escribir que no lance por codigo
 * de estado. El error del contrato es un valor, y el dialogo que lo provoco tiene que poder mostrarlo
 * sin desmontarse.
 */

/**
 * Resultado de una escritura.
 *
 * `estado`, `codigo`, `detalles` y `reintentarEnSegundos` son opcionales para que todo quien ya lee
 * `ok`, `datos` y `mensaje` siga igual: los agrega quien necesita distinguir un 409 de otro, o saber
 * cuanto esperar despues de un 429. Sin respuesta de la API (sin red) no hay `estado`.
 *
 * `cancelada` distingue un abort deliberado (`AbortSignal`) de una caida de red real: sin ella quien
 * cancela una subida a mitad de camino veria "no se pudo contactar al servidor" como si hubiera
 * fallado, en vez de que se respete la cancelacion.
 *
 * `incierta` marca una escritura que salio pero de la que no llego respuesta (tiempo agotado o red
 * caida): el servidor pudo haberla aplicado. Quien la recibe no debe presentarla como "no se guardo".
 */
export type Resultado<T> =
  | { ok: true, datos: T, estado?: number, meta?: { omitidos?: number[] } & Record<string, unknown> }
  | {
    ok: false
    mensaje: string
    estado?: number
    codigo?: string
    detalles?: Record<string, unknown>
    reintentarEnSegundos?: number | null
    cancelada?: boolean
    incierta?: boolean
  }

/** Opciones de una escritura; sin ellas se comporta como siempre. */
export interface OpcionesDeEscritura {
  /** Señal para cancelar la peticion. */
  senal?: AbortSignal
  /** Clave de idempotencia; un reintento de la misma intencion reutiliza la que recibio la primera vez. */
  idempotencia?: string
  /** Version (ETag) que se espera encontrar en el servidor; si cambio, la API responde 409. */
  siCoincide?: string
}

/** Mensaje de una escritura de la que no llego respuesta. */
const MENSAJE_INCIERTA = 'La respuesta tardó demasiado o se perdió la conexión, y no sabemos si el cambio se guardó. Revisa antes de repetirlo.'

/**
 * Lee del cuerpo de error el codigo y los detalles, y la espera de un 429.
 *
 * Trabaja sobre un clon: el cuerpo original lo consume `mensajeDeRespuesta`, que es quien arma la
 * frase y avisa el incidente. Un cuerpo que no es el envelope no tiene codigo, y no es un error.
 *
 * @param respuesta la respuesta fallida (se clona, no se consume)
 * @returns lo que se pudo leer
 */
async function codigoDeError (respuesta: Response): Promise<{ codigo?: string, detalles?: Record<string, unknown>, reintentarEnSegundos: number | null }> {
  const cabecera = respuesta.headers.get('retry-after')

  try {
    const cuerpo = await respuesta.clone().json() as { error?: { code?: unknown, details?: unknown } }
    const codigo = typeof cuerpo.error?.code === 'string' ? cuerpo.error.code : undefined
    const detalles = cuerpo.error?.details !== null && typeof cuerpo.error?.details === 'object'
      ? cuerpo.error.details as Record<string, unknown>
      : undefined

    return { codigo, detalles, reintentarEnSegundos: segundosParaReintentar(detalles, cabecera) }
  } catch {
    return { reintentarEnSegundos: segundosParaReintentar(undefined, cabecera) }
  }
}

/**
 * El cuerpo de una escritura tal como lo espera `fetch`.
 *
 * Un `FormData` viaja sin `content-type`: lo completa el navegador con el boundary, y forzarlo lo
 * perderia. Todo lo demas viaja como JSON.
 *
 * @param cuerpo lo que se quiere mandar; `undefined` no lleva cuerpo
 * @returns las opciones de `fetch` que corresponden
 */
function opcionesDeCuerpo (cuerpo: unknown): RequestInit {
  if (cuerpo === undefined) return {}
  if (typeof FormData !== 'undefined' && cuerpo instanceof FormData) return { body: cuerpo }

  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
}

/**
 * Normaliza el cuarto argumento de {@link escribirEnBff}: durante la migracion acepta la señal sola.
 *
 * @param valor una `AbortSignal`, unas opciones o nada
 * @returns las opciones completas
 */
function opcionesDe (valor: AbortSignal | OpcionesDeEscritura | undefined): OpcionesDeEscritura {
  if (valor === undefined) return {}

  return 'aborted' in valor ? { senal: valor } : valor
}

/**
 * Manda una escritura al BFF y devuelve el resultado como valor, nunca como excepcion.
 *
 * @param ruta Ruta sin la base del BFF ni barra inicial. Ej: `projects/12/actions/copy`.
 * @param metodo Verbo HTTP de la operacion.
 * @param cuerpo Cuerpo JSON, o un `FormData` para multipart. `DELETE` normalmente no lleva.
 * @param senalOOpciones Una señal para cancelar la peticion (por ejemplo, una subida a Drive que la
 *        persona cancelo), o las {@link OpcionesDeEscritura} completas.
 * @returns `datos` con el `data` del envelope, o el mensaje de error ya legible.
 */
export async function escribirEnBff<T> (
  ruta: string,
  metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  cuerpo?: unknown,
  senalOOpciones?: AbortSignal | OpcionesDeEscritura
): Promise<Resultado<T>> {
  const { senal, idempotencia, siCoincide } = opcionesDe(senalOOpciones)
  const esSubida = typeof FormData !== 'undefined' && cuerpo instanceof FormData
  const base = opcionesDeCuerpo(cuerpo)
  const cabeceras = new Headers(base.headers)
  cabeceras.set('Idempotency-Key', idempotencia ?? claveDeIdempotencia())
  if (siCoincide !== undefined) cabeceras.set('If-Match', siCoincide)

  const cerrar = registrarEscritura(ruta)
  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${ruta}`, {
      ...base,
      method: metodo,
      headers: cabeceras,
      signal: conLimite(senal, esSubida ? TIEMPO_SUBIDA_MS : TIEMPO_ESCRITURA_MS)
    })
  } catch {
    if (senal?.aborted === true) {
      cerrar('error')

      return { ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.', cancelada: true }
    }

    // Salio y no volvio nada: sea por tiempo agotado o por red caida, el servidor pudo aplicarla.
    cerrar('incierta')

    return { ok: false, mensaje: MENSAJE_INCIERTA, incierta: true }
  }

  if (!respuesta.ok) {
    cerrar('error')
    const error = await codigoDeError(respuesta)

    return { ok: false, mensaje: await mensajeDeRespuesta(respuesta), estado: respuesta.status, ...error }
  }

  cerrar('ok')
  avisarCambioDeTareas(ruta)
  avisarCambioDeRecurso(ruta)

  // 204 no trae cuerpo: un `json()` sobre una respuesta vacia lanza.
  if (respuesta.status === 204) return { ok: true, datos: undefined as T, estado: 204 }

  try {
    const sobre = await respuesta.json() as { data: T, meta?: { omitidos?: number[] } }

    return { ok: true, datos: sobre.data, estado: respuesta.status, meta: sobre.meta }
  } catch {
    return { ok: true, datos: undefined as T, estado: respuesta.status }
  }
}

/**
 * Lee una ruta del BFF con el mismo contrato de `escribirEnBff`: el error es un valor, no una
 * excepcion.
 *
 * No reemplaza a `useRecurso`, que es lo que usa una pantalla para cargarse: ese revalida al volver
 * a la pestaña y distingue la sesion cerrada. Esto es para una lectura puntual disparada por un
 * clic —pedir el acta en otro idioma, por ejemplo— donde no hay ciclo de vida que seguir y lo unico
 * que se necesita es el dato o el motivo por el que no vino.
 *
 * @param ruta Ruta sin la base del BFF ni barra inicial. Ej: `projects/12/actas/5/traducciones/en`.
 */
export async function leerDelBff<T> (ruta: string): Promise<Resultado<T>> {
  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${ruta}`, { signal: conLimite(undefined, TIEMPO_LECTURA_MS) })
  } catch (fallo) {
    return {
      ok: false,
      mensaje: esTiempoAgotado(fallo)
        ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
        : 'No se pudo contactar al servidor. Revisa tu conexión.'
    }
  }

  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeLectura(respuesta) }

  try {
    const sobre = await respuesta.json() as { data: T }

    return { ok: true, datos: sobre.data }
  } catch {
    return { ok: false, mensaje: 'El servidor respondió algo que no se pudo leer.' }
  }
}

/**
 * Sube un archivo al BFF sin fijar el `content-type`: el navegador agrega el boundary multipart.
 *
 * @param campo Nombre del campo multipart que espera el endpoint (`image`, `file`, etc).
 */
export async function subirArchivoEnBff<T> (ruta: string, archivo: File, campo: string): Promise<Resultado<T>> {
  const cuerpo = new FormData()
  cuerpo.append(campo, archivo)

  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${ruta}`, { method: 'POST', body: cuerpo, signal: conLimite(undefined, TIEMPO_SUBIDA_MS) })
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }

  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeRespuesta(respuesta) }

  try {
    const sobre: unknown = await respuesta.json()

    if (sobre !== null && typeof sobre === 'object' && 'data' in sobre && sobre.data != null) {
      return { ok: true, datos: sobre.data as T }
    }
  } catch {
    // Un proxy puede devolver HTML con estado 200; eso no confirma que el archivo se haya guardado.
  }

  return { ok: false, mensaje: 'El servidor no confirmó que el archivo se haya guardado. Inténtalo nuevamente.' }
}
