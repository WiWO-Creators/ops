import {
  XmlElement,
  XmlText,
  createRelativePositionFromTypeIndex,
  relativePositionToJSON,
  type XmlFragment
} from 'yjs'
import type { Document } from '@hocuspocus/server'

import { LIMITES_REPRODUCCION, TIEMPOS_REPRODUCCION } from '../../src/dominio/diff-acta.ts'
import { bloquesComoHtml, tramosDeReemplazo, type TramoDeReemplazo } from '../../src/dominio/tramos-acta.ts'
import { htmlAYDoc, yDocAHtml } from './adaptadores/acta.ts'
import type { ServicioDeDocumentos } from './documentos.ts'
import { registrar } from './registro.ts'

/**
 * El Thinking Orb escribe en el Meeting Paper que alguien tiene abierto en edición conjunta.
 *
 * Si el documento está abierto, el board no guarda el HTML que calculó el orbe: lo manda aquí
 * (`POST interno/actas/{id}/aplicar`) y el servicio lo aplica al documento Yjs por tramos, con un
 * cursor propio visible para quienes editan, como un colaborador más. Al terminar guarda de
 * inmediato con origen `orb` y la persona que lo pidió como autora, de modo que el historial
 * distingue lo del orbe de lo escrito a mano.
 *
 * El cursor viaja por el awareness del propio documento de Hocuspocus: `Document` difunde a todas
 * las conexiones los cambios de su estado local (`awareness.on('update')` en Document.ts), así que
 * no hace falta un canal aparte.
 */

/** Nombre y color con que las demás personas ven al orbe en el editor. */
export const ORBE_USUARIO = { name: 'Thinking Orb', color: '#7c3aed' } as const

/** Origen de las transacciones del orbe, sin guardado automático: el guardado lo manda al final el orbe. */
const ORIGEN_ORBE = { source: 'local', skipStoreHooks: true, context: { orbe: true } } as const

/** Nombre del fragmento Yjs donde vive el texto (el de la extensión de colaboración de TipTap). */
const CAMPO = 'default'

/** Un hijo del documento de acta: bloques (`XmlElement`) o texto; el esquema del acta no usa `XmlHook`. */
type NodoXml = XmlElement | XmlText

/** Cualquier hijo posible de un fragmento, tal como lo entrega `toArray()` (con `XmlHook` incluido). */
type HijoDelFragmento = ReturnType<XmlFragment['toArray']>[number]

/** Lo que el board manda a `interno/actas/{id}/aplicar`. */
export interface PedidoDeAplicar {
  html: string
  staffId: number
  espacioId: number
}

/** Qué pasó con un pedido: se aplica (la promesa avisa cuando termina), no hay nadie, o no se pudo leer. */
export type ResultadoDeOrbe =
  | { estado: 'aplicando', terminada: Promise<void> }
  | { estado: 'no_abierta' }
  | { estado: 'no_aplicable' }

/** Cómo esperar entre gestos; las pruebas lo cambian por una espera nula. */
export interface OpcionesDeOrbe {
  esperar?: (ms: number) => Promise<void>
}

function esEnteroPositivo (valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
}

/**
 * Lee el cuerpo de `aplicar`.
 *
 * @param texto el cuerpo crudo
 * @returns el pedido, o `null` si no es JSON, falta algún campo o alguno tiene el tipo equivocado
 */
export function leerPedidoDeAplicar (texto: string): PedidoDeAplicar | null {
  let dato: unknown

  try {
    dato = JSON.parse(texto)
  } catch {
    return null
  }

  if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) return null

  const { html, staff_id: staffId, espacio_id: espacioId } = dato as Record<string, unknown>

  if (typeof html !== 'string' || !esEnteroPositivo(staffId) || !esEnteroPositivo(espacioId)) return null

  return { html, staffId, espacioId }
}

const esperarReal = async (ms: number): Promise<void> => {
  await new Promise<void>((resolver) => setTimeout(resolver, ms))
}

/** Convierte HTML del board en los bloques Yjs que se insertarán; cada llamada devuelve copias nuevas. */
function nodosDe (html: string): NodoXml[] {
  return hijosDe(htmlAYDoc(html).getXmlFragment(CAMPO)).map((nodo) => nodo.clone())
}

function hijosDe (fragmento: XmlFragment): NodoXml[] {
  return fragmento.toArray().filter((nodo): nodo is NodoXml => nodo instanceof XmlElement || nodo instanceof XmlText)
}

function indiceVivo (fragmento: XmlFragment, nodo: HijoDelFragmento | undefined): number {
  return nodo === undefined ? -1 : fragmento.toArray().indexOf(nodo)
}

/** El último texto dentro de un bloque, para poner el cursor al final de lo escrito. */
function ultimoTexto (nodo: HijoDelFragmento | undefined): XmlText | null {
  let actual: HijoDelFragmento | null | undefined = nodo

  while (actual instanceof XmlElement) {
    actual = actual.length === 0 ? null : actual.get(actual.length - 1)
  }

  return actual instanceof XmlText ? actual : null
}

function posicionEn (fragmento: XmlFragment, indice: number): unknown {
  return relativePositionToJSON(createRelativePositionFromTypeIndex(fragmento, indice))
}

/** Muestra al orbe en el documento: selección entre `anchor` y `head` (iguales = cursor sin selección). */
function mostrarCursor (documento: Document, anchor: unknown, head: unknown): void {
  documento.awareness.setLocalState({ user: ORBE_USUARIO, cursor: { anchor, head } })
}

/**
 * Aplica los tramos al documento, uno por uno, con el cursor del orbe a la vista.
 *
 * Los bloques que se borran y el bloque previo al que se inserta se localizan por identidad y no por
 * posición: si alguien agrega o quita un párrafo mientras el orbe escribe, el reemplazo cae donde
 * debe y no sobre otro bloque.
 *
 * @returns cuántos tramos se aplicaron
 */
async function reproducir (documento: Document, tramos: TramoDeReemplazo[], esperar: (ms: number) => Promise<void>): Promise<number> {
  const fragmento = documento.getXmlFragment(CAMPO)
  const modelo: HijoDelFragmento[] = fragmento.toArray()
  const pausa = async (ms: number, animada: boolean): Promise<void> => {
    if (animada && documento.getConnectionsCount() > 0) await esperar(ms)
  }

  if (tramos.length === 0) return 0

  const primerBloque = modelo[tramos[0]?.desde ?? 0]
  const inicio = posicionEn(fragmento, primerBloque === undefined ? fragmento.length : Math.max(0, indiceVivo(fragmento, primerBloque)))

  mostrarCursor(documento, inicio, inicio)
  await pausa(TIEMPOS_REPRODUCCION.intro, true)

  for (const [orden, tramo] of tramos.entries()) {
    if (documento.isDestroyed) break

    const animada = orden < LIMITES_REPRODUCCION.maxBloquesAnimados
    const sobran = modelo.slice(tramo.desde, tramo.desde + tramo.borrar)
    const ancla = tramo.desde > 0 ? modelo[tramo.desde - 1] : undefined
    const nuevos = nodosDe(tramo.html)

    // Primero se marca lo que se va a reemplazar...
    if (animada && sobran.length > 0) {
      const primero = indiceVivo(fragmento, sobran[0])
      const ultimo = indiceVivo(fragmento, sobran.at(-1))

      if (primero >= 0 && ultimo >= primero) mostrarCursor(documento, posicionEn(fragmento, primero), posicionEn(fragmento, ultimo + 1))
    }
    await pausa(TIEMPOS_REPRODUCCION.salto + (sobran.length > 0 ? TIEMPOS_REPRODUCCION.pausaDeBorrado : 0), animada)

    // ...y luego se reemplaza de una vez.
    documento.transact(() => {
      for (const nodo of sobran) {
        const indice = indiceVivo(fragmento, nodo)

        if (indice >= 0) fragmento.delete(indice, 1)
      }

      const indiceAncla = indiceVivo(fragmento, ancla)

      fragmento.insert(ancla === undefined ? 0 : indiceAncla >= 0 ? indiceAncla + 1 : fragmento.length, nuevos)
    }, ORIGEN_ORBE)
    modelo.splice(tramo.desde, tramo.borrar, ...nuevos)

    const texto = ultimoTexto(nuevos.at(-1))
    const fin = texto === null
      ? posicionEn(fragmento, Math.max(0, indiceVivo(fragmento, nuevos.at(-1)) + 1))
      : relativePositionToJSON(createRelativePositionFromTypeIndex(texto, texto.length))

    mostrarCursor(documento, fin, fin)
    await pausa(TIEMPOS_REPRODUCCION.pausaDeEscritura, animada)
  }

  return tramos.length
}

/**
 * Los tramos que llevan el documento vivo al HTML nuevo. Si los bloques del HTML del documento no
 * coinciden uno a uno con los hijos del árbol Yjs (no debería pasar con el esquema del acta), se
 * reemplaza todo en un tramo para no tocar bloques ajenos.
 */
function planearTramos (documento: Document, htmlNuevo: string): TramoDeReemplazo[] {
  const htmlActual = yDocAHtml(documento)

  if (bloquesComoHtml(htmlActual).length === documento.getXmlFragment(CAMPO).length) return tramosDeReemplazo(htmlActual, htmlNuevo)
  if (htmlActual === htmlNuevo) return []

  return [{ desde: 0, borrar: documento.getXmlFragment(CAMPO).length, html: htmlNuevo, insertados: bloquesComoHtml(htmlNuevo).length }]
}

/**
 * Aplica el HTML del orbe al Meeting Paper abierto, escribiendo por tramos con su cursor a la vista.
 *
 * Responde al instante si hay con quién hacerlo: `estado: 'aplicando'` con una promesa que se
 * resuelve cuando el cambio ya se aplicó y el guardado (origen `orb`, `staffId` como autor) terminó.
 * Dos pedidos sobre el mismo acta se encolan en el candado de guardado del documento. Quien llame
 * debe atrapar el rechazo de `terminada` (el cambio no se pudo completar).
 *
 * Límite conocido: el orbe parte del acta que el board tenía guardada. Lo que alguien escribió en
 * los últimos segundos y aún no se guardó se reemplaza, igual que si el orbe hubiera editado un
 * instante antes de esa persona.
 *
 * @param servicio los documentos del servicio
 * @param id el id del acta
 * @param pedido el HTML nuevo, quién lo pidió y de qué Espacio
 * @param opciones cómo esperar entre gestos
 * @returns `no_abierta` si el acta no está cargada con conexiones o es de otro Espacio; `no_aplicable`
 * si el HTML no se pudo convertir (el board debe seguir su camino de siempre); `aplicando` si ya está en marcha
 */
export function aplicarComoOrbe (
  servicio: Pick<ServicioDeDocumentos, 'abierto' | 'guardarYa'>,
  id: number,
  pedido: PedidoDeAplicar,
  opciones: OpcionesDeOrbe = {}
): ResultadoDeOrbe {
  const nombre = `acta:${id}`
  const abierto = servicio.abierto(nombre)

  if (abierto === null || abierto.estado.espacioId !== pedido.espacioId) return { estado: 'no_abierta' }

  let htmlNuevo: string

  try {
    // Pasar el HTML del board por el esquema del acta lo deja comparable con el del documento vivo.
    htmlNuevo = yDocAHtml(htmlAYDoc(pedido.html))
  } catch {
    registrar({ evento: 'orbe_html_ilegible', documento: nombre })

    return { estado: 'no_aplicable' }
  }

  const { documento, estado } = abierto
  const esperar = opciones.esperar ?? esperarReal

  const terminada = (async () => {
    let aplicados = 0

    try {
      await documento.saveMutex.runExclusive(async () => {
        if (documento.isDestroyed) return

        try {
          aplicados = await reproducir(documento, planearTramos(documento, htmlNuevo), esperar)
        } finally {
          documento.awareness.setLocalState(null)
        }

        if (aplicados === 0) return

        // Todo guardado desde aquí se rotula `orb` y a quien lo pidió se le acredita la autoría.
        estado.origen = 'orb'
        estado.ultimoEditor = pedido.staffId
        estado.autores.add(pedido.staffId)
      })
    } catch (error) {
      registrar({ evento: 'orbe_fallida', documento: nombre, error: error instanceof Error ? error.name : 'desconocido' })
      throw error
    }

    if (aplicados === 0 || documento.isDestroyed) return

    registrar({ evento: 'orbe_aplicada', documento: nombre, tramos: aplicados })
    await servicio.guardarYa(documento)
  })()

  return { estado: 'aplicando', terminada }
}
