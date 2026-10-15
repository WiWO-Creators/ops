import {
  XmlElement,
  XmlText,
  createRelativePositionFromTypeIndex,
  relativePositionToJSON,
  type XmlFragment
} from 'yjs'
import type { Document } from '@hocuspocus/server'

import { LIMITES_REPRODUCCION, TIEMPOS_REPRODUCCION } from '../../src/dominio/diff-acta.ts'
import { bloquesComoHtml, ubicarTramosEnVivo, type AnclaDeTramo, type TramoUbicado } from '../../src/dominio/tramos-acta.ts'
import { htmlAYDoc, yDocAHtml } from './adaptadores/acta.ts'
import type { ServicioDeDocumentos } from './documentos.ts'
import { registrar } from './registro.ts'

/**
 * El Thinking Orb escribe en el Meeting Paper que alguien tiene abierto en edición conjunta.
 *
 * Si el documento está abierto, el board no guarda el HTML que calculó el orbe: lo manda aquí
 * (`POST interno/actas/{id}/aplicar`, con `{html, base, revision, staff_id, espacio_id}`) y el
 * servicio lo aplica al documento Yjs por tramos, con un cursor propio visible para quienes editan,
 * como un colaborador más. Al terminar guarda de inmediato con origen `orb` y la persona que lo pidió
 * como autora, de modo que el historial distingue lo del orbe de lo escrito a mano.
 *
 * Se aplica a 3 bandas: `base` es el acta que el board tenía guardada cuando el orbe trabajó, `html`
 * lo que el orbe propone y el documento vivo lo que hay ahora, con texto de personas aún sin guardar.
 * Del cambio base → html solo se reemplazan los bloques que siguen idénticos a la base; si una persona
 * editó uno, se conserva su texto y lo del orbe entra a continuación. Nunca se pisa texto ajeno.
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
  /** El acta que propone el orbe. */
  html: string
  /** El acta guardada en el board sobre la que el orbe calculó `html` (puede ser vacía). */
  base: string
  /** La revisión opaca de `base` (`<ISO>~<huella>`); solo se compara por igualdad, para el registro. */
  revision: string | null
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
 * @returns el pedido, o `null` si no es JSON, falta algún campo (`base` es obligatorio) o alguno tiene
 * el tipo equivocado
 */
export function leerPedidoDeAplicar (texto: string): PedidoDeAplicar | null {
  let dato: unknown

  try {
    dato = JSON.parse(texto)
  } catch {
    return null
  }

  if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) return null

  const { html, base, revision = null, staff_id: staffId, espacio_id: espacioId } = dato as Record<string, unknown>

  if (typeof html !== 'string' || typeof base !== 'string') return null
  if (revision !== null && typeof revision !== 'string') return null
  if (!esEnteroPositivo(staffId) || !esEnteroPositivo(espacioId)) return null

  return { html, base, revision, staffId, espacioId }
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
 * El índice, en el fragmento tal como está ahora, donde entra el HTML de un tramo.
 *
 * El ancla se resuelve por identidad del bloque (no por posición): si una persona agrega o quita un
 * párrafo mientras el orbe escribe, la inserción cae junto a su bloque. Si el bloque ancla ya no
 * existe, el HTML entra al final.
 *
 * @param modelo los hijos del fragmento al planear; los índices del ancla apuntan a él
 */
function indiceDeEntrada (fragmento: XmlFragment, modelo: readonly HijoDelFragmento[], ancla: AnclaDeTramo): number {
  if (ancla.tipo === 'inicio') return 0
  if (ancla.tipo === 'fin') return fragmento.length

  const vivo = indiceVivo(fragmento, modelo[ancla.vivo])

  if (vivo < 0) return fragmento.length

  return ancla.tipo === 'antes' ? vivo : vivo + 1
}

/**
 * Aplica los tramos al documento, uno por uno, con el cursor del orbe a la vista.
 *
 * Los tramos traen índices de bloques del documento tal como estaba al planear (`modelo`); los bloques
 * que se borran y el bloque ancla se localizan por identidad Yjs y no por posición, de modo que los
 * cambios de otras personas mientras el orbe escribe no desplazan el reemplazo hacia otro bloque. Solo se
 * borran bloques que siguen idénticos a la base; el resto del documento no se toca.
 *
 * @returns cuántos tramos se aplicaron
 */
async function reproducir (documento: Document, tramos: TramoUbicado[], esperar: (ms: number) => Promise<void>): Promise<number> {
  const fragmento = documento.getXmlFragment(CAMPO)
  const modelo: HijoDelFragmento[] = fragmento.toArray()
  const pausa = async (ms: number, animada: boolean): Promise<void> => {
    if (animada && documento.getConnectionsCount() > 0) await esperar(ms)
  }

  if (tramos.length === 0) return 0

  const inicio = posicionEn(fragmento, indiceDeEntrada(fragmento, modelo, tramos[0]?.ancla ?? { tipo: 'fin' }))

  mostrarCursor(documento, inicio, inicio)
  await pausa(TIEMPOS_REPRODUCCION.intro, true)

  for (const [orden, tramo] of tramos.entries()) {
    if (documento.isDestroyed) break

    const animada = orden < LIMITES_REPRODUCCION.maxBloquesAnimados
    const sobran = tramo.borrarVivos.flatMap((indice) => modelo[indice] ?? [])
    const nuevos = nodosDe(tramo.html)

    // Primero se marca lo que se va a reemplazar (o el punto donde se escribirá)...
    if (animada && sobran.length > 0) {
      const primero = indiceVivo(fragmento, sobran[0])
      const ultimo = indiceVivo(fragmento, sobran.at(-1))

      if (primero >= 0 && ultimo >= primero) mostrarCursor(documento, posicionEn(fragmento, primero), posicionEn(fragmento, ultimo + 1))
    } else if (animada) {
      const punto = posicionEn(fragmento, indiceDeEntrada(fragmento, modelo, tramo.ancla))

      mostrarCursor(documento, punto, punto)
    }
    await pausa(TIEMPOS_REPRODUCCION.salto + (sobran.length > 0 ? TIEMPOS_REPRODUCCION.pausaDeBorrado : 0), animada)

    // ...y luego se reemplaza de una vez.
    documento.transact(() => {
      for (const nodo of sobran) {
        const indice = indiceVivo(fragmento, nodo)

        if (indice >= 0) fragmento.delete(indice, 1)
      }

      fragmento.insert(indiceDeEntrada(fragmento, modelo, tramo.ancla), nuevos)
    }, ORIGEN_ORBE)

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
 * Los tramos del orbe ubicados en el documento vivo (3 bandas: base, orbe y documento vivo).
 *
 * Los bloques del HTML del documento deben coincidir uno a uno con los hijos del árbol Yjs para poder
 * apuntar a ellos; con el esquema del acta siempre ocurre. Si no, el documento se trata como sin
 * bloques reconocibles: no se borra nada ajeno y lo del orbe entra al final.
 *
 * @param htmlBase el acta guardada sobre la que el orbe trabajó, normalizada
 * @param htmlNuevo el acta que propone el orbe, normalizada
 */
function planearTramos (documento: Document, htmlBase: string, htmlNuevo: string): TramoUbicado[] {
  const htmlVivo = yDocAHtml(documento)
  const mapeable = bloquesComoHtml(htmlVivo).length === documento.getXmlFragment(CAMPO).length

  return ubicarTramosEnVivo(htmlBase, mapeable ? htmlVivo : '', htmlNuevo)
}

/**
 * Aplica el HTML del orbe al Meeting Paper abierto, escribiendo por tramos con su cursor a la vista.
 *
 * Responde al instante si hay con quién hacerlo: `estado: 'aplicando'` con una promesa que se
 * resuelve cuando el cambio ya se aplicó y el guardado (origen `orb`, `staffId` como autor) terminó.
 * Dos pedidos sobre el mismo acta se encolan en el candado de guardado del documento. Quien llame
 * debe atrapar el rechazo de `terminada` (el cambio no se pudo completar).
 *
 * Lo que alguien escribió y aún no se guardó no se pisa: el cambio se aplica a 3 bandas (ver el
 * encabezado del módulo). Un bloque que el orbe cambió y una persona también editó conserva el texto de
 * la persona, y lo del orbe entra a continuación.
 *
 * @param servicio los documentos del servicio
 * @param id el id del acta
 * @param pedido el HTML nuevo, la base sobre la que se calculó, quién lo pidió y de qué Espacio
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
  let htmlBase: string

  try {
    // Pasar el HTML del board por el esquema del acta lo deja comparable con el del documento vivo.
    htmlNuevo = yDocAHtml(htmlAYDoc(pedido.html))
    htmlBase = yDocAHtml(htmlAYDoc(pedido.base))
  } catch {
    registrar({ evento: 'orbe_html_ilegible', documento: nombre })

    return { estado: 'no_aplicable' }
  }

  const { documento, estado } = abierto
  const esperar = opciones.esperar ?? esperarReal

  const terminada = (async () => {
    let aplicados = 0
    let conservados = 0

    try {
      await documento.saveMutex.runExclusive(async () => {
        if (documento.isDestroyed) return

        // La revisión se compara como texto opaco: si el board ya la movió, hay guardados que este documento no vio.
        if (pedido.revision !== null && pedido.revision !== estado.revision) {
          registrar({ evento: 'orbe_revision_distinta', documento: nombre })
        }

        try {
          const tramos = planearTramos(documento, htmlBase, htmlNuevo)

          conservados = tramos.reduce((suma, tramo) => suma + tramo.conservados, 0)
          aplicados = await reproducir(documento, tramos, esperar)
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

    registrar({ evento: 'orbe_aplicada', documento: nombre, tramos: aplicados, conservados })
    await servicio.guardarYa(documento)
  })()

  return { estado: 'aplicando', terminada }
}
