import { getSchema } from '@tiptap/core'
import { generateHTML, generateJSON } from '@tiptap/html'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import { XmlElement, XmlText, type Doc, type XmlFragment } from 'yjs'

import { extensionesDeActa } from '../../src/lib/en-vivo/extensiones-acta.ts'
import { bloquesComoHtml, ubicarTramosEnVivo, type AnclaDeTramo } from '../../src/dominio/tramos-acta.ts'

/**
 * Lo que el servicio sabe del texto del Meeting Paper como árbol Yjs: convertirlo desde y hacia HTML
 * con el esquema del acta, ubicar sus bloques de primer nivel y combinar un cambio ajeno con lo que
 * hay en el documento vivo (3 bandas).
 *
 * Lo usan el adaptador del acta (conflicto 409 y cambios externos) y el Thinking Orb, que aplican la
 * misma regla: nunca se pisa texto de una persona que aún no se guardó.
 */

/** Nombre del fragmento Yjs donde vive el texto (el de la extensión de colaboración de TipTap). */
export const CAMPO = 'default'

/** Un hijo del documento de acta: bloques (`XmlElement`) o texto; el esquema del acta no usa `XmlHook`. */
export type NodoXml = XmlElement | XmlText

/** Cualquier hijo posible de un fragmento, tal como lo entrega `toArray()` (con `XmlHook` incluido). */
export type HijoDelFragmento = ReturnType<XmlFragment['toArray']>[number]

/** Origen de las transacciones de fusión: se reflejan en los clientes pero no disparan un guardado. */
export const ORIGEN_DE_FUSION = { source: 'local', skipStoreHooks: true } as const

/**
 * Convierte el HTML del board en un documento Yjs con el esquema del acta.
 *
 * @param html el contenido del acta tal como lo guarda el board
 * @returns un `Y.Doc` con el texto en el fragmento `default`
 */
export function htmlAYDoc (html: string): Doc {
  return prosemirrorJSONToYDoc(getSchema(extensionesDeActa()), generateJSON(html, extensionesDeActa()), CAMPO)
}

/**
 * Convierte un documento Yjs del acta en el HTML que se guarda en el board.
 *
 * @param documento el documento colaborativo
 * @returns el HTML según el esquema del acta
 */
export function yDocAHtml (documento: Doc): string {
  return generateHTML(yDocToProsemirrorJSON(documento, CAMPO), extensionesDeActa())
}

/** Los hijos de un fragmento que son bloques o texto. */
export function hijosDe (fragmento: XmlFragment): NodoXml[] {
  return fragmento.toArray().filter((nodo): nodo is NodoXml => nodo instanceof XmlElement || nodo instanceof XmlText)
}

/** Convierte HTML del board en los bloques Yjs que se insertarán; cada llamada devuelve copias nuevas. */
export function nodosDe (html: string): NodoXml[] {
  return hijosDe(htmlAYDoc(html).getXmlFragment(CAMPO)).map((nodo) => nodo.clone())
}

/** La posición actual de un nodo entre los hijos del fragmento, o -1 si ya no está. */
export function indiceVivo (fragmento: XmlFragment, nodo: HijoDelFragmento | undefined): number {
  return nodo === undefined ? -1 : fragmento.toArray().indexOf(nodo)
}

/**
 * El índice, en el fragmento tal como está ahora, donde entra el HTML de un tramo.
 *
 * El ancla se resuelve por identidad del bloque (no por posición): si una persona agrega o quita un
 * párrafo mientras se aplica el cambio, la inserción cae junto a su bloque. Si el bloque ancla ya no
 * existe, el HTML entra al final.
 *
 * @param modelo los hijos del fragmento al planear; los índices del ancla apuntan a él
 */
export function indiceDeEntrada (fragmento: XmlFragment, modelo: readonly HijoDelFragmento[], ancla: AnclaDeTramo): number {
  if (ancla.tipo === 'inicio') return 0
  if (ancla.tipo === 'fin') return fragmento.length

  const vivo = indiceVivo(fragmento, modelo[ancla.vivo])

  if (vivo < 0) return fragmento.length

  return ancla.tipo === 'antes' ? vivo : vivo + 1
}

/**
 * El HTML de cada bloque de primer nivel del documento, por identidad del nodo Yjs.
 *
 * @returns el mapa; vacío si el HTML del documento no se puede emparejar uno a uno con sus bloques
 * (entonces ningún bloque se puede dar por intacto)
 */
export function htmlPorBloque (documento: Doc): Map<HijoDelFragmento, string> {
  const hijos = documento.getXmlFragment(CAMPO).toArray()
  const bloques = bloquesComoHtml(yDocAHtml(documento))
  const mapa = new Map<HijoDelFragmento, string>()

  if (bloques.length !== hijos.length) return mapa

  for (const [indice, hijo] of hijos.entries()) mapa.set(hijo, bloques[indice] ?? '')

  return mapa
}

/** Qué pasó al combinar un cambio ajeno con el documento vivo. */
export type ResultadoDeFusion = 'fusionado' | 'sin_cambios' | 'no_mapeable'

/**
 * Lleva al documento vivo el cambio que otra persona hizo en el board, sin pisar lo escrito aquí (3 bandas).
 *
 * `htmlBase` es lo último que el servicio guardó en el board; `htmlAjeno`, lo que el board tiene ahora;
 * el documento vivo trae además texto que aún no se guardó. El cambio base → ajeno se traduce a
 * operaciones sobre los bloques vivos: solo se reemplaza un bloque que sigue idéntico a la base; si una
 * persona lo editó, su texto se conserva y lo ajeno entra a continuación.
 *
 * @param documento el documento colaborativo; se modifica en una sola transacción
 * @param htmlBase el HTML que el servicio guardó por última vez, normalizado
 * @param htmlAjeno el HTML que el board tiene ahora, normalizado
 * @returns `fusionado` si se aplicó algo, `sin_cambios` si no había nada que aplicar, `no_mapeable` si los
 * bloques del documento no se pueden emparejar con su HTML (no se toca nada)
 */
export function fusionarConLoAjeno (documento: Doc, htmlBase: string, htmlAjeno: string): ResultadoDeFusion {
  const fragmento = documento.getXmlFragment(CAMPO)
  const htmlLocal = yDocAHtml(documento)

  if (bloquesComoHtml(htmlLocal).length !== fragmento.length) return 'no_mapeable'

  const tramos = ubicarTramosEnVivo(htmlBase, htmlLocal, htmlAjeno)

  if (tramos.length === 0) return 'sin_cambios'

  const modelo: HijoDelFragmento[] = fragmento.toArray()

  documento.transact(() => {
    for (const tramo of tramos) {
      for (const indice of tramo.borrarVivos) {
        const posicion = indiceVivo(fragmento, modelo[indice])

        if (posicion >= 0) fragmento.delete(posicion, 1)
      }

      fragmento.insert(indiceDeEntrada(fragmento, modelo, tramo.ancla), nodosDe(tramo.html))
    }
  }, ORIGEN_DE_FUSION)

  return 'fusionado'
}
