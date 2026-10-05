import { rutaCompartida } from './rutas.ts'
import type { Sesion, Sujeto } from './sobre-sesion.ts'

/**
 * Piezas del proxy BFF: de que sujeto es una peticion, que cabeceras de la API llegan al navegador,
 * como se interpreta el cuerpo que este manda y como se reintenta una llamada con el token vencido.
 * Viven aparte de `route.ts` para poder probarse sin levantar Next: lo que toca cookies o la API
 * entra por parametro.
 */

/**
 * Decide de que sujeto es una peticion al BFF, y con eso que cookie leer y contra que lista blanca
 * validar.
 *
 * El prefijo `portal` es siempre del contacto: un contacto no puede pedir `clients` ni un staff pedir
 * `portal`. La descarga de adjuntos (`files`) es la excepcion: vive fuera de `/portal` y sirve a los
 * dos, asi que el prefijo no alcanza y hay que mirar que sesion existe. Se prueba primero la del
 * panel, igual que hace la API, para que alguien del equipo con las dos sesiones abiertas siga
 * descargando como staff.
 *
 * **Limite conocido (S4):** con las dos sesiones abiertas —un staff en «Ver como cliente»— la descarga
 * del portal sale con los permisos del staff, no con los del contacto que se esta mirando. No hay
 * fuga entre personas (la API sigue autorizando por token y es la misma persona con las dos cookies),
 * pero esa vista no es fiel a lo que el cliente podria bajar. Distinguirlo exigiria otra senal
 * (Referer o un parametro firmado); mientras tanto queda documentado y probado.
 *
 * @param ruta los segmentos de la ruta pedida
 * @param haySesionDelPanel dice si existe la sesion del staff; solo se consulta en rutas compartidas
 * @returns el sujeto de la peticion
 */
export async function elegirSujeto (ruta: string[], haySesionDelPanel: () => Promise<boolean>): Promise<Sujeto> {
  if (ruta[0] === 'portal') return 'contacto'
  if (rutaCompartida(ruta) && !await haySesionDelPanel()) return 'contacto'

  return 'staff'
}

/** Lo que `llamarConRefresco` necesita de afuera: la llamada, el refresco y la cookie. */
export interface DependenciasDeLlamada {
  /** Hace la llamada a la API con ese token de acceso. */
  llamar: (token: string) => Promise<Response>
  /** Refresca la sesion; `null` si la API rechazo el refresco. Una excepcion no se traga. */
  refrescar: () => Promise<Sesion | null>
  /** Guarda la sesion renovada en la cookie. */
  guardar: (sesion: Sesion) => Promise<void>
  /** Borra la sesion cuando ya no se puede renovar. */
  borrar: () => Promise<void>
}

/** La respuesta de la API, o el aviso de que la sesion se cerro al no poder renovarla. */
export type LlamadaConRefresco = { respuesta: Response } | { sesionCerrada: true }

/**
 * `true` si la respuesta es el `401 token_expired`, el unico que se arregla refrescando.
 *
 * Trabaja sobre un clon, asi que la respuesta original sigue legible.
 *
 * @param respuesta la respuesta de la API
 */
export async function esTokenVencido (respuesta: Response): Promise<boolean> {
  if (respuesta.status !== 401) return false

  try {
    const cuerpo = await respuesta.clone().json() as { error?: { code?: string } }

    return cuerpo.error?.code === 'token_expired'
  } catch {
    return false
  }
}

/**
 * Llama a la API y, ante `401 token_expired`, refresca una vez, guarda la cookie nueva y reintenta.
 *
 * Si el refresco es rechazado borra la sesion y avisa que se cerro, para que el navegador vaya a
 * entrar. Un error al refrescar que no sea un rechazo (red caida, bug) se propaga: tragarlo lo
 * disfrazaria de sesion vencida. Un `401` con otro codigo no refresca.
 *
 * @param sesion la sesion con la que se llama
 * @param dependencias la llamada, el refresco y la cookie
 * @returns la respuesta de la API (la del reintento si hubo refresco) o `sesionCerrada`
 */
export async function llamarConRefresco (sesion: Sesion, dependencias: DependenciasDeLlamada): Promise<LlamadaConRefresco> {
  const respuesta = await dependencias.llamar(sesion.acceso)

  if (!await esTokenVencido(respuesta)) return { respuesta }

  const renovada = await dependencias.refrescar()

  if (renovada === null) {
    await dependencias.borrar()

    return { sesionCerrada: true }
  }

  await dependencias.guardar(renovada)

  return { respuesta: await dependencias.llamar(renovada.acceso) }
}

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
