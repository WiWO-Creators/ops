/**
 * Reglas del segundo paso del portal: el codigo de 6 digitos que el contacto recibe por correo.
 *
 * Vive aca y no dentro del formulario porque son decisiones —que se acepta tipear, que error pide
 * que accion— y una decision asi se prueba. El formulario solo las dibuja.
 */

/** Largo del codigo. Lo fija la API (`Auth\SegundoFactorContacto`). */
export const LARGO_CODIGO = 6

/** Lo que la pantalla hace despues de un error del segundo paso. */
export type AccionTrasError =
  /** El codigo estaba mal pero quedan intentos: se limpia el campo y se vuelve a tipear. */
  | 'reintentar'
  /** El codigo venció o ya no sirve: hay que pedir uno nuevo. */
  | 'pedir-otro'
  /** El desafio murio (intentos agotados, vencido, revocado): se vuelve a poner la contraseña. */
  | 'reiniciar'
  /** El problema no es del codigo (correo caido, freno): se avisa y se queda donde esta. */
  | 'avisar'

export interface ErrorDelCodigo {
  mensaje: string
  accion: AccionTrasError
}

/**
 * Deja solo los digitos del codigo, hasta el largo esperado.
 *
 * Quien copia el codigo del correo lo pega con espacios o con un salto de linea; descartarlos en
 * silencio es mas amable que un "codigo invalido" que cuesta un intento de los cinco.
 *
 * @param valor lo que hay en el campo
 */
export function normalizarCodigo (valor: string): string {
  return valor.replace(/\D/g, '').slice(0, LARGO_CODIGO)
}

/** Si lo tipeado ya es un codigo completo y vale la pena enviarlo (cada envio gasta un intento). */
export function esCodigoCompleto (valor: string): boolean {
  return new RegExp(`^\\d{${LARGO_CODIGO}}$`).test(valor)
}

/**
 * Traduce el error de `/api/sesion` en el segundo paso a un texto y una accion.
 *
 * El codigo del contrato manda sobre el estado HTTP: los cuatro `401` de aqui piden cosas distintas.
 *
 * @param codigo el `codigo` del cuerpo de error
 * @param estado el estado HTTP
 * @param mensaje el texto de la API, usado solo cuando el codigo no se conoce
 */
export function interpretarErrorDeCodigo (
  codigo: string | undefined,
  estado: number,
  mensaje: string | undefined
): ErrorDelCodigo {
  switch (codigo) {
    case 'invalid_code':
      return { mensaje: 'El código no es correcto. Revísalo e inténtalo de nuevo.', accion: 'reintentar' }
    case 'code_expired':
      return { mensaje: 'El código venció. Pide uno nuevo.', accion: 'pedir-otro' }
    case 'challenge_exhausted':
    case 'token_expired':
    case 'token_revoked':
    case 'unauthenticated':
      return {
        mensaje: 'Esta verificación ya no sirve. Vuelve a entrar con tu correo y contraseña.',
        accion: 'reiniciar'
      }
    case 'resend_too_soon':
      return { mensaje: mensaje ?? 'Espera unos segundos antes de pedir otro código.', accion: 'avisar' }
    case 'rate_limited':
      return { mensaje: 'Demasiados intentos. Espera unos minutos antes de volver a probar.', accion: 'avisar' }
    case 'two_factor_unavailable':
      return {
        mensaje: mensaje ?? 'No pudimos enviar el código de verificación. Avisa al equipo e inténtalo más tarde.',
        accion: 'avisar'
      }
    default:
      return {
        mensaje: estado === 401
          ? 'Esta verificación ya no sirve. Vuelve a entrar con tu correo y contraseña.'
          : mensaje ?? 'No se pudo verificar el código. Intenta de nuevo.',
        accion: estado === 401 ? 'reiniciar' : 'avisar'
      }
  }
}

/**
 * Error del PRIMER paso (contraseña) cuando la API contesta que el codigo no pudo salir.
 *
 * El 503 `two_factor_unavailable` no es una clave mala, y mostrar "correo o contraseña incorrectos"
 * seria justo el bloqueo sin aviso que esta funcion evita. Devuelve `null` para cualquier otro error.
 */
export function avisoDeCodigoNoEnviado (codigo: string | undefined, mensaje: string | undefined): string | null {
  if (codigo !== 'two_factor_unavailable') return null

  return mensaje ?? 'No pudimos enviar el código de verificación. Avisa al equipo e inténtalo más tarde.'
}

/** La nota sobre a donde fue el correo, solo cuando no fue a la persona (modo de prueba). */
export function notaDeEntrega (entrega: string | undefined): string | null {
  return entrega === 'prueba'
    ? 'Entorno de pruebas: el código se envió a la casilla de pruebas del sistema, no a tu correo.'
    : null
}
