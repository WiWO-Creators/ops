import { ErrorDeBoleto, pedirBoletoDeDocumento } from '@/componentes/en-vivo/boletoDeDocumento'

export { ErrorDeBoleto }

/**
 * Pide al BFF el boleto que abre el documento colaborativo de un acta.
 *
 * El BFF comprueba contra la API que la persona puede leer el acta y firma un boleto de pocos
 * segundos: por eso se pide uno nuevo en cada conexión, no se guarda.
 *
 * @param actaId id del acta
 * @param espacioId id del Proyecto (Espacio) al que pertenece
 * @returns el boleto firmado
 * @throws ErrorDeBoleto si el BFF lo niega, está apagado o no contesta
 */
export async function pedirBoletoDelActa (actaId: number, espacioId: number): Promise<string> {
  return await pedirBoletoDeDocumento(`acta:${actaId}`, espacioId)
}
