'use client'

import {
  useDocumentoColaborativo,
  type DocumentoColaborativo
} from '@/componentes/en-vivo/useDocumentoColaborativo'
import { pedirBoletoDelActa } from './boletoDelActa'

/** La sesión de un Meeting Paper: la misma forma que la de cualquier documento colaborativo. */
export type ActaColaborativa = DocumentoColaborativo

/**
 * La sesión de edición conjunta de un Meeting Paper.
 *
 * Es `useDocumentoColaborativo` aplicado al documento `acta:{id}`, con el boleto que pide el BFF tras
 * comprobar que la persona puede leer el acta en su Proyecto. Ver ese hook para el ciclo de la sesión
 * (documento nuevo en cada reconexión, `sin_conexion` y `sin_acceso` finales).
 *
 * @param actaId id del Meeting Paper
 * @param espacioId id del Proyecto (Espacio) al que pertenece
 * @param activo `false` mantiene todo apagado; pasar a `true` abre la sesión
 * @returns el documento, el proveedor y el estado de la sesión
 */
export function useActaColaborativa (actaId: number, espacioId: number, activo: boolean): ActaColaborativa {
  return useDocumentoColaborativo({
    nombre: `acta:${actaId}`,
    pedirBoleto: async () => await pedirBoletoDelActa(actaId, espacioId),
    activo,
    identidad: String(espacioId)
  })
}
