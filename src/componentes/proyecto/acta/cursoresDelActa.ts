import type { DecorationAttrs } from '@tiptap/pm/view'
import { colorDeColaborador, esColaboradorOrbe } from '@/dominio/acta-colaborativa'

/**
 * Cómo se dibujan los cursores de las demás personas en el editor conjunto del Meeting Paper.
 *
 * Los datos de cada cursor (`user`) los publica el otro cliente por la presencia de Yjs, así que son
 * entrada ajena: el nombre entra como texto, nunca como HTML, y el color solo se acepta si es un
 * hexadecimal de seis dígitos (si no, se cae al color que le toca por su id). Las clases y los
 * colores viven en `estilos/acta.css`.
 */

const HEXADECIMAL = /^#[0-9a-f]{6}$/i

/** El color que se usa para una persona: el que publica si es válido, o el que le toca por su id. */
function colorDe (user: Record<string, unknown>): string {
  if (typeof user.color === 'string' && HEXADECIMAL.test(user.color)) return user.color

  return colorDeColaborador(typeof user.id === 'number' ? user.id : 0)
}

/**
 * El cursor de otra persona: una barra y una etiqueta con su nombre. El del asistente va con el
 * color de su marca y no con el que publica.
 *
 * @param user lo que publicó el otro cliente (`name`, `color`, `id`)
 * @returns el elemento que TipTap inserta en la posición del cursor
 */
export function cursorDeColaborador (user: Record<string, unknown>): HTMLElement {
  const cursor = document.createElement('span')
  const etiqueta = document.createElement('div')

  cursor.classList.add('collaboration-carets__caret')
  etiqueta.classList.add('collaboration-carets__label')
  etiqueta.textContent = typeof user.name === 'string' ? user.name : ''

  if (esColaboradorOrbe(user.name)) cursor.classList.add('collaboration-carets__caret--orbe')
  else cursor.style.setProperty('--cursor-color', colorDe(user))

  cursor.append(etiqueta)

  return cursor
}

/**
 * La selección de otra persona, tintada con su color.
 *
 * @param user lo que publicó el otro cliente
 * @returns los atributos de la decoración de ProseMirror
 */
export function seleccionDeColaborador (user: Record<string, unknown>): DecorationAttrs {
  if (esColaboradorOrbe(user.name)) {
    return { nodeName: 'span', class: 'collaboration-carets__selection collaboration-carets__selection--orbe' }
  }

  return { nodeName: 'span', class: 'collaboration-carets__selection', style: `--cursor-color: ${colorDe(user)}` }
}
