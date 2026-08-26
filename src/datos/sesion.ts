import 'server-only'

import { cookies } from 'next/headers'
import { claveSesion } from './config'
import { abrir, sellar, type Sesion, type Sujeto } from './sobre-sesion'

export const NOMBRE_COOKIE = 'ops_sesion'
export const NOMBRE_COOKIE_PORTAL = 'ops_portal'

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
