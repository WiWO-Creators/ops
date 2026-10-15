import type { ClienteBoard } from '../cliente-board.ts'
import { crearAdaptadorDeActa } from './acta.ts'
import { ErrorDeAdaptador, type DocumentoReconocido } from './tipos.ts'

const DOCUMENTO_DE_ACTA = /^acta:([1-9]\d{0,9})$/

/**
 * Elige el adaptador de un documento por su nombre.
 *
 * Hoy solo existen las actas (`acta:{id}`); en la fase 8 se suman `tarea:{id}` y `ticket-borrador:{id}`.
 *
 * @param nombre el nombre del documento
 * @param board el cliente del board
 * @returns el adaptador y el id
 * @throws ErrorDeAdaptador `documento_desconocido` si el nombre no corresponde a ningún tipo
 */
export function adaptadorDe (nombre: string, board: ClienteBoard): DocumentoReconocido {
  const acta = DOCUMENTO_DE_ACTA.exec(nombre)

  if (acta !== null) return { adaptador: crearAdaptadorDeActa(board), id: Number(acta[1]) }

  throw new ErrorDeAdaptador('documento_desconocido')
}
