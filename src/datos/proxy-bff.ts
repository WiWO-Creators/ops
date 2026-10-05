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

/** Primer segmento de las rutas de descarga de adjuntos. */
const PREFIJO_DESCARGAS = 'files'

/** `true` si la ruta del BFF sirve archivos subidos por personas (adjuntos). */
export function esRutaDeDescarga (segmentos: readonly string[]): boolean {
  return segmentos[0] === PREFIJO_DESCARGAS
}

/**
 * Arma las cabeceras de la respuesta del BFF a partir de las de la API.
 *
 * @param respuesta la respuesta de la API v1
 * @param descarga `true` si la ruta pedida es una descarga de adjuntos: fuerza `nosniff` y reenvia
 *        `content-length` cuando el cuerpo viaja sin recodificar
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
