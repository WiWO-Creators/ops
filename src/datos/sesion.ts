import 'server-only'

import { cookies } from 'next/headers'
import { claveSesion } from './config'
import { abrir, sellar, type Sesion, type Sujeto } from './sobre-sesion'

export const NOMBRE_COOKIE = 'ops_sesion'
export const NOMBRE_COOKIE_PORTAL = 'ops_portal'

/**
 * Cookie donde espera la sesion REAL mientras se mira el panel como otra persona.
 *
 * Se sella igual que las otras dos —son los mismos tokens— y existe por una sola razon: sin ella,
 * suplantar seria un viaje de ida. Quien entra como otro pisa `ops_sesion`, y para volver a su cuenta
 * tendria que loguearse de nuevo.
 *
 * Que esta cookie exista ES la señal de que hay suplantacion en curso: el panel no guarda un booleano
 * aparte, porque dos fuentes de verdad para el mismo hecho se desincronizan.
 */
export const NOMBRE_COOKIE_SUPLANTADOR = 'ops_suplantador'

/**
 * Cookie de cada sujeto.
 *
 * Dos cookies y no una con un campo adentro: asi abrir el portal en la misma maquina no pisa la
 * sesion del panel —pasa todo el tiempo cuando alguien del equipo revisa como se ve del lado del
 * cliente— y una sesion de contacto no puede llegar por accidente a codigo que espera staff.
 */
export function nombreCookie (sujeto: Sujeto): string {
  return sujeto === 'contacto' ? NOMBRE_COOKIE_PORTAL : NOMBRE_COOKIE
}

/**
 * Lee la sesion de la cookie.
 *
 * @param sujeto Que cookie leer. Por defecto la del panel.
 * @returns La sesion, o `null` si no hay, si la cookie no se puede abrir, o si el sujeto que trae no
 *          es el que se pedia.
 */
export async function leerSesion (sujeto: Sujeto = 'staff'): Promise<Sesion | null> {
  const almacen = await cookies()
  const sesion = abrir(almacen.get(nombreCookie(sujeto))?.value, claveSesion())

  // Una cookie del sujeto equivocado se descarta en vez de usarse. No deberia pasar —cada sujeto
  // escribe la suya— pero si pasara, seguir adelante seria pedirle datos de portal a la API del
  // panel con el token de otro.
  return sesion?.sujeto === sujeto ? sesion : null
}

/**
 * Escribe la cookie de sesion.
 *
 * Solo funciona desde un route handler, una server action o el proxy: un Server Component no puede
 * escribir cookies. Por eso el refresco vive en el proxy y en el BFF, no en las pantallas.
 */
export async function guardarSesion (sesion: Sesion): Promise<void> {
  const almacen = await cookies()

  almacen.set(nombreCookie(sesion.sujeto), sellar(sesion, claveSesion()), opcionesCookie())
}

/** Borra la cookie. Se llama al salir y cuando la API dice que el token esta revocado. */
export async function borrarSesion (sujeto: Sujeto = 'staff'): Promise<void> {
  const almacen = await cookies()

  almacen.delete(nombreCookie(sujeto))
}

/**
 * Opciones de la cookie.
 *
 * `httpOnly` para que el JavaScript de la pagina no la lea. `sameSite: lax` porque el BFF vive en el
 * mismo origen y no hay flujo entre sitios que preservar. `secure` fuera de desarrollo: en local se
 * sirve por HTTP y una cookie `secure` no se guardaria.
 *
 * La cookie dura lo que el token de refresco, no lo que el de acceso: el de acceso se renueva solo.
 */
export function opcionesCookie (): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 30 dias, que es lo que vive el token de refresco segun el contrato.
    maxAge: 60 * 60 * 24 * 30
  }
}

/**
 * Guarda la sesion real de quien suplanta.
 *
 * @param sesion La sesion del superadministrador, tal cual estaba antes de suplantar.
 */
export async function guardarSuplantador (sesion: Sesion): Promise<void> {
  const almacen = await cookies()

  almacen.set(NOMBRE_COOKIE_SUPLANTADOR, sellar(sesion, claveSesion()), opcionesCookie())
}

/**
 * Lee la sesion real guardada.
 *
 * @returns La sesion del superadministrador, o `null` si no hay suplantacion en curso o la cookie no
 *          se puede abrir. Una cookie que no abre se trata como ausente: la vuelta se resuelve
 *          saliendo, no rompiendo la pantalla.
 */
export async function leerSuplantador (): Promise<Sesion | null> {
  const almacen = await cookies()
  const sesion = abrir(almacen.get(NOMBRE_COOKIE_SUPLANTADOR)?.value, claveSesion())

  // Solo staff suplanta: un contacto del portal no tiene por donde llegar a esta cookie, y aceptarla
  // seria dejar que una sesion de portal vuelva a una del panel.
  return sesion?.sujeto === 'staff' ? sesion : null
}

/** Borra la cookie de la sesion real. Se llama al volver a la propia cuenta y al salir. */
export async function borrarSuplantador (): Promise<void> {
  const almacen = await cookies()

  almacen.delete(NOMBRE_COOKIE_SUPLANTADOR)
}
