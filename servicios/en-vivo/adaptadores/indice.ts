import type { ClienteBoard } from '../cliente-board.ts'
import { crearAdaptadorDeActa } from './acta.ts'
import { crearAdaptadorDeTarea } from './tarea.ts'
import { crearAdaptadorDeBorradorDeTicket } from './ticket-borrador.ts'
import { ErrorDeAdaptador, type AdaptadorDeDocumento, type DocumentoReconocido } from './tipos.ts'

const DOCUMENTO = /^(acta|tarea|ticket-borrador):([1-9]\d{0,9})$/

const ADAPTADORES: Record<string, (board: ClienteBoard) => AdaptadorDeDocumento> = {
  acta: crearAdaptadorDeActa,
  tarea: crearAdaptadorDeTarea,
  'ticket-borrador': crearAdaptadorDeBorradorDeTicket
}

/**
 * Elige el adaptador de un documento por su nombre.
 *
 * Los documentos son `acta:{id}` (Meeting Paper), `tarea:{id}` (descripción de una tarea) y
 * `ticket-borrador:{id}` (borrador de la respuesta a un ticket).
 *
 * @param nombre el nombre del documento
 * @param board el cliente del board
 * @returns el adaptador y el id
 * @throws ErrorDeAdaptador `documento_desconocido` si el nombre no corresponde a ningún tipo
 */
export function adaptadorDe (nombre: string, board: ClienteBoard): DocumentoReconocido {
  const reconocido = DOCUMENTO.exec(nombre)
  const crear = reconocido === null ? undefined : ADAPTADORES[reconocido[1] ?? '']

  if (reconocido === null || crear === undefined) throw new ErrorDeAdaptador('documento_desconocido')

  return { adaptador: crear(board), id: Number(reconocido[2]) }
}
