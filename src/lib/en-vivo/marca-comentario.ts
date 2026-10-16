import { Mark, type Editor } from '@tiptap/core'
import type { Mark as MarcaDelModelo, Node as NodoDelModelo } from '@tiptap/pm/model'

import { esAnclaValida } from '../../dominio/comentarios-acta.ts'

/**
 * La marca de los comentarios en línea del Meeting Paper (fase 10 de «Ops en vivo»).
 *
 * Envuelve el fragmento comentado en `<span data-hilo="{ancla}">`; el hilo vive en el board y se
 * une al texto solo por esa ancla. Forma parte del esquema compartido (`extensionesDeActa`), así que
 * la conoce tanto el editor del navegador como el servicio que convierte el HTML del board a
 * documento Yjs: si una de las dos no la conociera, el `<span>` se perdería al pasar de una a otra.
 *
 * - `excludes: ''`: dos hilos pueden cubrir el mismo texto (uno abarca una frase y otro una palabra
 *   de adentro). Con la exclusión por defecto el segundo borraría al primero.
 * - `inclusive: false`: escribir justo al final de un fragmento comentado no lo agranda.
 * - Un `data-hilo` que no cumple el patrón del board no se reconoce: el `<span>` queda como texto
 *   corriente, igual que lo deja `HtmlSeguro` al guardar.
 *
 * Solo imports relativos con extensión: la importa el servicio, que corre en Node sin el alias `@/`.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comentario: {
      /** Marca la selección como el fragmento de un hilo. */
      ponerComentario: (ancla: string) => ReturnType
      /** Quita la marca de un hilo, en todo el documento. */
      quitarComentario: (ancla: string) => ReturnType
    }
  }
}

/** Nombre de la marca en el esquema. */
export const NOMBRE_DE_MARCA_COMENTARIO = 'comentario'

export const MarcaComentario = Mark.create({
  name: NOMBRE_DE_MARCA_COMENTARIO,
  inclusive: false,
  excludes: '',

  addAttributes () {
    return {
      hilo: {
        default: null,
        parseHTML: (elemento: HTMLElement) => elemento.getAttribute('data-hilo'),
        renderHTML: (atributos: Record<string, unknown>) => (
          esAnclaValida(atributos.hilo) ? { 'data-hilo': atributos.hilo } : {}
        )
      }
    }
  },

  parseHTML () {
    return [
      {
        tag: 'span[data-hilo]',
        getAttrs: (elemento: HTMLElement | string) => (
          typeof elemento !== 'string' && esAnclaValida(elemento.getAttribute('data-hilo')) ? null : false
        )
      }
    ]
  },

  renderHTML ({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },

  addCommands () {
    return {
      // Se escribe a mano y no con `setMark`: este fusiona los atributos con los de una marca que ya
      // esté en el texto y pisaría el hilo anterior en vez de sumarse a él.
      ponerComentario: (ancla: string) => ({ state, tr, dispatch }) => {
        const tipo = state.schema.marks[NOMBRE_DE_MARCA_COMENTARIO]

        if (tipo === undefined || !esAnclaValida(ancla) || state.selection.empty) return false

        if (dispatch !== undefined) {
          const marca = tipo.create({ hilo: ancla })

          for (const { $from, $to } of state.selection.ranges) tr.addMark($from.pos, $to.pos, marca)
        }

        return true
      },
      quitarComentario: (ancla: string) => ({ state, tr, dispatch }) => {
        const rangos = rangosDeComentario(state.doc, ancla)

        if (rangos.length === 0) return false

        if (dispatch !== undefined) {
          for (const { desde, hasta, marca } of rangos) tr.removeMark(desde, hasta, marca)
        }

        return true
      }
    }
  }
})

/** Un tramo del documento que lleva la marca de un hilo. */
export interface RangoDeComentario {
  desde: number
  hasta: number
  marca: MarcaDelModelo
}

/**
 * Los tramos del documento que llevan la marca de un hilo.
 *
 * @param documento el documento de ProseMirror
 * @param ancla el `data-hilo` del hilo
 * @returns un tramo por cada nodo de texto marcado, en orden de aparición
 */
export function rangosDeComentario (documento: NodoDelModelo, ancla: string): RangoDeComentario[] {
  const rangos: RangoDeComentario[] = []

  documento.descendants((nodo, posicion) => {
    for (const marca of nodo.marks) {
      if (marca.type.name === NOMBRE_DE_MARCA_COMENTARIO && marca.attrs.hilo === ancla) {
        rangos.push({ desde: posicion, hasta: posicion + nodo.nodeSize, marca })
      }
    }
  })

  return rangos
}

/**
 * El texto comentado de un hilo tal como está ahora en el editor.
 *
 * @param editor el editor del acta
 * @param ancla el `data-hilo` del hilo
 * @returns el texto, o `null` si el documento ya no tiene esa marca
 */
export function textoDeComentario (editor: Editor, ancla: string): string | null {
  const rangos = rangosDeComentario(editor.state.doc, ancla)

  if (rangos.length === 0) return null

  return rangos
    .map(({ desde, hasta }) => editor.state.doc.textBetween(desde, hasta, ' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
