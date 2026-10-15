import type { ClienteBoard } from '../cliente-board.ts'
import { crearAdaptadorDeTexto, type DefinicionDeTexto } from './texto.ts'
import type { AdaptadorDeDocumento } from './tipos.ts'

/**
 * Adaptador de la descripción de una tarea (`tarea:{id}`).
 *
 * `GET en-vivo/tareas/{id}` → `{content, date_updated, espacio_id}` y `PUT {staff_id, content, revision}`
 * → `{date_updated}`. La revisión es `sha1(description)`, un texto opaco que solo cambia si cambia la
 * descripción: un 409 significa que otra persona la editó y el documento se recarga, como el acta. El
 * board escribe como `staff_id` (revalida su permiso `tasks.edit` y su visibilidad), así que el servicio
 * manda al último editor con permiso de escritura.
 */
const DEFINICION: DefinicionDeTexto = {
  documento: 'tarea',
  ruta: (id) => `en-vivo/tareas/${id}`,
  cuerpoDeGuardado: (estado, html, staffId) => ({ staff_id: staffId, content: html, revision: estado.revision }),
  revisionNula: false
}

/**
 * Crea el adaptador de descripciones de tarea.
 *
 * @param board el cliente firmado del board
 * @returns las operaciones del adaptador
 */
export function crearAdaptadorDeTarea (board: ClienteBoard): AdaptadorDeDocumento {
  return crearAdaptadorDeTexto(board, DEFINICION)
}
