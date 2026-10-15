/** Cuánto se espera al BFF por un boleto antes de darlo por fallido. */
const TIEMPO_DEL_BOLETO_MS = 8000

/**
 * El boleto no se pudo conseguir.
 *
 * `transitorio` separa lo que puede arreglarse solo (red caída, la API sin contestar) de lo que no
 * (sin sesión, sin permiso sobre el acta, «en vivo» apagado): lo primero se reintenta, lo segundo
 * manda de vuelta a la edición de siempre.
 */
export class ErrorDeBoleto extends Error {
  readonly transitorio: boolean

  constructor (mensaje: string, transitorio: boolean) {
    super(mensaje)
    this.name = 'ErrorDeBoleto'
    this.transitorio = transitorio
  }
}

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
  let respuesta: Response

  try {
    respuesta = await fetch('/api/en-vivo/boleto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documento: `acta:${actaId}`, espacio_id: espacioId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIEMPO_DEL_BOLETO_MS)
    })
  } catch {
    throw new ErrorDeBoleto('No se pudo contactar al servidor.', true)
  }

  if (!respuesta.ok) throw new ErrorDeBoleto(`El boleto fue negado (${respuesta.status}).`, respuesta.status >= 500 && respuesta.status !== 503)

  const cuerpo = await respuesta.json().catch(() => null) as { data?: { boleto?: unknown } } | null
  const boleto = cuerpo?.data?.boleto

  if (typeof boleto !== 'string' || boleto === '') throw new ErrorDeBoleto('La respuesta no trajo boleto.', false)

  return boleto
}
