/**
 * Piezas puras del proxy BFF: que cabeceras de la API llegan al navegador y como se interpreta el
 * cuerpo que este manda. Viven aparte de `route.ts` para poder probarse sin levantar Next.
 */

/**
 * Cabeceras que el BFF copia de la API, ademas del `content-type`.
 *
 * `cache-control` porque un `no-cache, no-transform` que se pierde deja la respuesta a merced de
 * cualquier cache intermedia. `x-accel-buffering` porque es la unica forma de decirle a Nginx que
 * no acumule un `text/event-stream`: sin ella el proxy junta la respuesta entera y la entrega de
 * una sola vez, asi que el streaming desaparece **sin dar ningun error** — el front recibe todo el
 * texto junto al final y parece un backend lento.
 *
 * `content-disposition` y `x-content-type-options` son las que hacen que un adjunto se descargue en
 * vez de abrirse en el origen de la app: sin ellas un archivo subido por un cliente podria ejecutar
 * script con la sesion de quien lo abre.
 *
 * `content-length` NO esta aca: se copia aparte y solo en las descargas sin `content-encoding`,
 * porque cuando Node descomprime el cuerpo el largo original ya no lo describe y romperia la
 * respuesta.
 */
export const CABECERAS_REENVIADAS = [
  'cache-control',
  'x-accel-buffering',
  'content-disposition',
  'x-content-type-options'
] as const

/** Valor de `x-content-type-options` que se fuerza en toda descarga, la mande o no la API. */
const NOSNIFF = 'nosniff'

/** `content-security-policy` de toda descarga: aunque algo la abra en una pestaña, no ejecuta script. */
const CSP_DESCARGA = 'sandbox'

/** Disposicion por defecto de una descarga: nunca se muestra en el origen de la app. */
const DISPOSICION_ADJUNTO = 'attachment'

/** Primer segmento de las rutas de descarga de adjuntos. */
const PREFIJO_DESCARGAS = 'files'

/** `true` si la ruta del BFF sirve archivos subidos por personas (adjuntos). */
export function esRutaDeDescarga (segmentos: readonly string[]): boolean {
  return segmentos[0] === PREFIJO_DESCARGAS
}

/**
 * La `content-disposition` que se le entrega al navegador en una descarga.
 *
 * Un archivo subido por un cliente nunca puede abrirse «en linea» en el origen de la app: ahi
 * ejecutaria script con la sesion de quien lo abre. Si la API no la manda, o manda `inline`, se
 * fuerza `attachment` (conservando el nombre de archivo si venia); si ya es `attachment`, pasa igual.
 *
 * @param valor la cabecera de la API, o `null` si no vino
 * @returns la cabecera a enviar
 */
export function disposicionDeDescarga (valor: string | null): string {
  if (valor === null || valor.trim() === '') return DISPOSICION_ADJUNTO
  if (/^\s*attachment\b/i.test(valor)) return valor
  if (/^\s*inline\b/i.test(valor)) return valor.replace(/^\s*inline/i, DISPOSICION_ADJUNTO)

  return DISPOSICION_ADJUNTO
}

/**
 * Arma las cabeceras de la respuesta del BFF a partir de las de la API.
 *
 * @param respuesta la respuesta de la API v1
 * @param descarga `true` si la ruta pedida es una descarga de adjuntos: fuerza `attachment`,
 *        `nosniff` y CSP `sandbox`, y reenvia `content-length` cuando el cuerpo viaja sin recodificar
 * @returns el `content-type` mas las cabeceras de la lista que la API haya emitido
 */
export function cabecerasDeSalida (respuesta: Response, descarga = false): Headers {
  const salida = new Headers({
    'content-type': respuesta.headers.get('content-type') ?? 'application/json'
  })

  for (const nombre of CABECERAS_REENVIADAS) {
    const valor = respuesta.headers.get(nombre)

    if (valor !== null) salida.set(nombre, valor)
  }

  if (!descarga) return salida

  salida.set('x-content-type-options', NOSNIFF)
  salida.set('content-security-policy', CSP_DESCARGA)
  salida.set('content-disposition', disposicionDeDescarga(respuesta.headers.get('content-disposition')))

  const largo = respuesta.headers.get('content-length')

  if (largo !== null && !respuesta.headers.has('content-encoding')) salida.set('content-length', largo)

  return salida
}

/** Resultado de leer el cuerpo de una peticion: `legible: false` cuando venia roto. */
export type CuerpoLeido =
  | { legible: true, cuerpo: unknown }
  | { legible: false }

/**
 * Interpreta el texto de un cuerpo JSON.
 *
 * @param texto el cuerpo crudo de la peticion
 * @returns `legible: true` con `cuerpo` indefinido si no habia cuerpo, o con el JSON parseado;
 *          `legible: false` si traia texto que no es JSON valido
 */
export function interpretarCuerpoJson (texto: string): CuerpoLeido {
  if (texto === '') return { legible: true, cuerpo: undefined }

  try {
    return { legible: true, cuerpo: JSON.parse(texto) as unknown }
  } catch {
    return { legible: false }
  }
}
