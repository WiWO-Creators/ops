import type { ClienteBoard } from '../cliente-board.ts'
import { crearAdaptadorDeTexto, type DefinicionDeTexto } from './texto.ts'
import type { AdaptadorDeDocumento } from './tipos.ts'

/**
 * Adaptador del borrador compartido de la respuesta a un ticket (`ticket-borrador:{id}`).
 *
 * `GET en-vivo/tickets/{id}/borrador` → `{content, date_updated}` (`date_updated` es `null` mientras no
 * hay borrador) y `PUT {staff_id, content, revision}` → `{date_updated}`, con `revision: null` si no
 * había. La revisión es un texto opaco. Un borrador que queda vacío lo borra el board y contesta
 * `date_updated: null`. Al enviarse la respuesta el propio board descarta el borrador: el
 * `DELETE {staff_id, revision}` (422 sin revisión, 409 si no coincide) lo hace él, no el servicio, que
 * nunca borra: por eso este adaptador no lo envía.
 */
const DEFINICION: DefinicionDeTexto = {
  documento: 'ticket-borrador',
  ruta: (id) => `en-vivo/tickets/${id}/borrador`,
  cuerpoDeGuardado: (estado, html, staffId) => ({ staff_id: staffId, content: html, revision: estado.revision }),
  revisionNula: true
}

/**
 * Crea el adaptador de borradores de respuesta de ticket.
 *
 * @param board el cliente firmado del board
 * @returns las operaciones del adaptador
 */
export function crearAdaptadorDeBorradorDeTicket (board: ClienteBoard): AdaptadorDeDocumento {
  return crearAdaptadorDeTexto(board, DEFINICION)
}
