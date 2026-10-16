/** Cuánto se espera al BFF por un boleto antes de darlo por fallido. */
const TIEMPO_DEL_BOLETO_MS = 8000

/**
 * El boleto no se pudo conseguir.
 *
 * `transitorio` separa lo que puede arreglarse solo (red caída, la API sin contestar) de lo que no
 * (sin sesión, sin permiso sobre el documento, «en vivo» apagado): lo primero se reintenta, lo segundo
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

/** El boleto de un documento y si la persona puede escribir en él (si no, entra en solo lectura). */
export interface BoletoConPermiso {
  boleto: string
  escritura: boolean
}

/**
 * Pide al BFF el boleto que abre un documento colaborativo (un acta, la descripción de una tarea o el
 * borrador de respuesta de un ticket).
 *
 * El BFF comprueba contra la API que la persona puede leer el recurso y firma un boleto de pocos
 * segundos: por eso se pide uno nuevo en cada conexión, no se guarda.
 *
 * @param documento nombre del documento (`acta:12`, `tarea:500`, `ticket-borrador:40`)
 * @param espacioId id del Proyecto (Espacio) del acta; `null` en los documentos que no cuelgan de uno
 * @returns el boleto firmado
 * @throws ErrorDeBoleto si el BFF lo niega, está apagado o no contesta
 */
export async function pedirBoletoDeDocumento (documento: string, espacioId: number | null): Promise<string> {
  return (await pedirBoletoConPermiso(documento, espacioId)).boleto
}

/**
 * Como {@link pedirBoletoDeDocumento}, pero también dice si la persona puede escribir en el documento.
 *
 * @param documento nombre del documento (`acta:12`, `tarea:500`, `ticket-borrador:40`)
 * @param espacioId id del Proyecto (Espacio) del acta; `null` en los documentos que no cuelgan de uno
 * @returns el boleto y el permiso de escritura (`true` si el BFF no lo dice)
 * @throws ErrorDeBoleto si el BFF lo niega, está apagado o no contesta
 */
export async function pedirBoletoConPermiso (documento: string, espacioId: number | null): Promise<BoletoConPermiso> {
  let respuesta: Response

  try {
    respuesta = await fetch('/api/en-vivo/boleto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documento, ...(espacioId === null ? {} : { espacio_id: espacioId }) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIEMPO_DEL_BOLETO_MS)
    })
  } catch {
    throw new ErrorDeBoleto('No se pudo contactar al servidor.', true)
  }

  if (!respuesta.ok) throw new ErrorDeBoleto(`El boleto fue negado (${respuesta.status}).`, respuesta.status >= 500 && respuesta.status !== 503)

  const cuerpo = await respuesta.json().catch(() => null) as { data?: { boleto?: unknown, escritura?: unknown } } | null
  const boleto = cuerpo?.data?.boleto

  if (typeof boleto !== 'string' || boleto === '') throw new ErrorDeBoleto('La respuesta no trajo boleto.', false)

  return { boleto, escritura: cuerpo?.data?.escritura !== false }
}
