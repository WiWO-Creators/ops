import { mensajeDeRespuesta } from '@/datos/cliente'

/**
 * Escrituras desde el navegador, siempre por el BFF.
 *
 * El motor de tabla ya sabe leer; lo que falta es una unica forma de escribir que no lance por codigo
 * de estado. El error del contrato es un valor, y el dialogo que lo provoco tiene que poder mostrarlo
 * sin desmontarse.
 */

export type Resultado<T> = { ok: true, datos: T } | { ok: false, mensaje: string }

/**
 * Manda una escritura al BFF y devuelve el resultado como valor, nunca como excepcion.
 *
 * @param ruta Ruta sin la base del BFF ni barra inicial. Ej: `projects/12/actions/copy`.
 * @param metodo Verbo HTTP de la operacion.
 * @param cuerpo Cuerpo JSON, si lo hay. `DELETE` normalmente no lleva.
 * @returns `datos` con el `data` del envelope, o el mensaje de error ya legible.
 */
export async function escribirEnBff<T> (
  ruta: string,
  metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  cuerpo?: unknown
): Promise<Resultado<T>> {
  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${ruta}`, {
      method: metodo,
      ...(cuerpo === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    })
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }

  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeRespuesta(respuesta) }

  // 204 no trae cuerpo: un `json()` sobre una respuesta vacia lanza.
  if (respuesta.status === 204) return { ok: true, datos: undefined as T }

  try {
    const sobre = await respuesta.json() as { data: T }

    return { ok: true, datos: sobre.data }
  } catch {
    return { ok: true, datos: undefined as T }
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
    respuesta = await fetch(`/api/bff/${ruta}`, { method: 'POST', body: cuerpo })
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }

  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeRespuesta(respuesta) }

  try {
    const sobre = await respuesta.json() as { data: T }

    return { ok: true, datos: sobre.data }
  } catch {
    return { ok: true, datos: undefined as T }
  }
}
