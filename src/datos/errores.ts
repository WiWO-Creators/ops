import type { CodigoError, SobreError } from './tipos'

/**
 * Error de la API con el codigo del contrato intacto.
 *
 * El codigo importa mas que el estado HTTP: los tres `401` (`unauthenticated`, `token_expired`,
 * `token_revoked`) piden reacciones distintas, y `details` solo llega en los `422`.
 */
export class ErrorApi extends Error {
  readonly codigo: CodigoError
  readonly estado: number
  readonly detalles: Record<string, string[]> | undefined

  constructor (codigo: CodigoError, mensaje: string, estado: number, detalles?: Record<string, string[]>) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.codigo = codigo
    this.estado = estado
    this.detalles = detalles
  }

  /** El token vencio y se puede recuperar refrescando. */
  get esRefrescable (): boolean {
    return this.codigo === 'token_expired'
  }

  /** No hay forma de seguir sin volver a entrar. */
  get exigeEntrar (): boolean {
    return this.codigo === 'unauthenticated' || this.codigo === 'token_revoked'
  }
}

/**
 * Construye un `ErrorApi` a partir de una respuesta que no fue exitosa.
 *
 * Una respuesta sin JSON valido (un 502 del proxy, un HTML de Apache) tambien tiene que producir un
 * `ErrorApi`: si no, el llamador recibe un `SyntaxError` que no dice nada.
 */
export async function errorDesdeRespuesta (respuesta: Response, ruta: string): Promise<ErrorApi> {
  let cuerpo: SobreError | null = null

  try {
    cuerpo = await respuesta.json() as SobreError
  } catch {
    cuerpo = null
  }

  if (cuerpo?.error?.code) {
    return new ErrorApi(cuerpo.error.code, cuerpo.error.message, respuesta.status, cuerpo.error.details)
  }

  return new ErrorApi(
    'server_error',
    `La API respondio ${respuesta.status} sin cuerpo de error en ${ruta}`,
    respuesta.status
  )
}
