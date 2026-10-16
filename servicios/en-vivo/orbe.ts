import {
  XmlElement,
  XmlText,
  createRelativePositionFromTypeIndex,
  relativePositionToJSON,
  type XmlFragment
} from 'yjs'
import type { Document } from '@hocuspocus/server'

import { LIMITES_REPRODUCCION, TIEMPOS_REPRODUCCION } from '../../src/dominio/diff-acta.ts'
import { bloquesComoHtml, ubicarTramosEnVivo, type TramoUbicado } from '../../src/dominio/tramos-acta.ts'
import {
  CAMPO,
  htmlAYDoc,
  htmlPorBloque,
  indiceDeEntrada,
  indiceVivo,
  nodosDe,
  yDocAHtml,
  type HijoDelFragmento
} from './bloques-acta.ts'
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
 * De los bloques que el plan quiere reemplazar, deja solo los que siguen igual que al planear.
 *
 * Entre el plan y cada reemplazo hay pausas de animación en las que una persona puede seguir
 * escribiendo: un bloque que cambió desde entonces se conserva (misma regla de 3 bandas que al planear)
 * y lo del orbe entra a continuación.
 *
 * @param candidatos los bloques que el plan pensaba borrar en este tramo
 * @param esperados el HTML de cada bloque al planear
 * @param documento el documento vivo
 * @returns los que se pueden borrar sin pisar texto ajeno, y cuántos se conservaron
 */
function bloquesSinTocar (
  candidatos: HijoDelFragmento[],
  esperados: ReadonlyMap<HijoDelFragmento, string>,
  documento: Document
): { borrables: HijoDelFragmento[], conservados: number } {
  if (candidatos.length === 0) return { borrables: [], conservados: 0 }

  const actuales = htmlPorBloque(documento)
  const borrables = candidatos.filter((nodo) => {
    const antes = esperados.get(nodo)

    return antes !== undefined && actuales.get(nodo) === antes
  })

  return { borrables, conservados: candidatos.length - borrables.length }
}

/** Cuántos tramos se aplicaron y cuántos bloques se conservaron porque una persona los cambió durante la reproducción. */
interface ResultadoDeReproduccion {
  aplicados: number
  conservadosTarde: number
}

/**
 * Aplica los tramos al documento, uno por uno, con el cursor del orbe a la vista.
 *
 * Los tramos traen índices de bloques del documento tal como estaba al planear (`modelo`); los bloques
 * que se borran y el bloque ancla se localizan por identidad Yjs y no por posición, de modo que los
 * cambios de otras personas mientras el orbe escribe no desplazan el reemplazo hacia otro bloque. Solo se
 * borran bloques que siguen idénticos a la base, y eso se vuelve a comprobar justo antes de cada
 * reemplazo (las pausas de la animación dan tiempo a escribir); el resto del documento no se toca.
 *
 * @returns cuántos tramos se aplicaron y cuántos bloques se conservaron durante la reproducción
 */
async function reproducir (documento: Document, tramos: TramoUbicado[], esperar: (ms: number) => Promise<void>): Promise<ResultadoDeReproduccion> {
  const fragmento = documento.getXmlFragment(CAMPO)
  const modelo: HijoDelFragmento[] = fragmento.toArray()
  const esperados = htmlPorBloque(documento)
  let conservadosTarde = 0
  const pausa = async (ms: number, animada: boolean): Promise<void> => {
    if (animada && documento.getConnectionsCount() > 0) await esperar(ms)
  }

  if (tramos.length === 0) return { aplicados: 0, conservadosTarde }

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

    // ...y luego se reemplaza de una vez, tras comprobar que nadie tocó esos bloques durante la pausa.
    const { borrables, conservados } = bloquesSinTocar(sobran, esperados, documento)

    conservadosTarde += conservados
    documento.transact(() => {
      for (const nodo of borrables) {
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

  return { aplicados: tramos.length, conservadosTarde }
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

          const reproduccion = await reproducir(documento, tramos, esperar)

          aplicados = reproduccion.aplicados
          conservados += reproduccion.conservadosTarde
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
