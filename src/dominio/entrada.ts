import type { Sujeto } from '@/datos/sobre-sesion'

/**
 * A donde va quien no puede seguir mirando el panel, y por que puerta vuelve.
 *
 * Vive en `dominio/` y no en `datos/servidor.ts` porque es la unica pieza del circuito de acceso que
 * se puede probar sola: el resto son Server Components y route handlers que necesitan el runtime de
 * Next para correr. Y hay exactamente una regla que probar —que la puerta de salida nunca sea la
 * misma que la de entrada—, porque violarla es lo que produce el bucle que esto existe para cortar.
 */

/** Pantalla de acceso de cada sujeto. La raiz es del cliente; el equipo entra por `/colab`. */
const ENTRADA: Record<Sujeto, string> = {
  staff: '/colab',
  contacto: '/'
}

/** Nombre del parametro con el que la pantalla de acceso se entera de por que esta ahi. */
export const PARAMETRO_SESION = 'sesion'

/**
 * Valor del parametro cuando la sesion existia pero la API la rechazo.
 *
 * "Caducada" y no "invalida": para quien mira es lo mismo —su sesion dejo de servir— y no hace falta
 * distinguir entre un token vencido, uno revocado y una cuenta dada de baja.
 */
export const SESION_CADUCADA = 'caducada'

/**
 * La pantalla de acceso del sujeto, para quien llega sin cookie.
 *
 * @param sujeto de quien es la sesion que falta
 * @returns la ruta de la pantalla de acceso
 */
export function entradaDe (sujeto: Sujeto): string {
  return ENTRADA[sujeto]
}

/**
 * La salida para quien SI trae cookie y la API igual la rechaza.
 *
 * No manda a la pantalla de acceso: manda a la ruta que **borra la cookie** y recien despues lleva
 * ahi. Mandarlo directo a la pantalla de acceso es lo que producia el bucle — esa pantalla ve una
 * cookie que se abre sin problemas, concluye que hay sesion y rebota al panel, que vuelve a pedir
 * datos con el mismo token rechazado, y asi indefinidamente. Un Server Component no puede borrar
 * cookies; un route handler si, y por eso la salida pasa por uno.
 *
 * @param sujeto de quien es la sesion rechazada
 * @returns la ruta del route handler que cierra la sesion y redirige a la entrada
 */
export function salidaPorSesionRechazada (sujeto: Sujeto): string {
  return sujeto === 'contacto'
    ? '/api/sesion/caducada?portal=1'
    : '/api/sesion/caducada'
}

/**
 * La entrada con el motivo puesto, que es a donde deja la salida de arriba.
 *
 * @param sujeto de quien es la sesion rechazada
 * @returns la pantalla de acceso con el parametro que le dice que no rebote
 */
export function entradaConMotivo (sujeto: Sujeto): string {
  return `${entradaDe(sujeto)}?${PARAMETRO_SESION}=${SESION_CADUCADA}`
}

/**
 * Si la pantalla de acceso tiene que quedarse quieta en vez de rebotar al panel.
 *
 * Es el segundo cerrojo contra el bucle, y es a proposito que sea redundante con el borrado de la
 * cookie: si el borrado fallara —una cookie escrita con otro `path`, un navegador que ignora el
 * `Set-Cookie`— la pantalla de acceso seguiria viendo sesion y volveria a rebotar. Con esto, no.
 *
 * @param valor el parametro `sesion` de la URL, tal como llego
 * @returns `true` si hay que mostrar el formulario aunque la cookie siga ahi
 */
export function vieneDeSesionRechazada (valor: string | string[] | undefined): boolean {
  return valor === SESION_CADUCADA
}

/**
 * El aviso que se le muestra a quien acaba de perder la sesion.
 *
 * @param valor el parametro `sesion` de la URL, tal como llego
 * @returns el texto para pantalla, o `null` si llego a la pantalla de acceso por su cuenta
 */
export function avisoDeSesion (valor: string | string[] | undefined): string | null {
  return vieneDeSesionRechazada(valor)
    ? 'Tu sesión caducó. Vuelve a entrar.'
    : null
}
