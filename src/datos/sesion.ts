import 'server-only'

import { cookies } from 'next/headers'
import { claveSesion } from './config'
import { abrir, sellar, type Sesion } from './sobre-sesion'

export const NOMBRE_COOKIE = 'ops_sesion'

/**
 * Lee la sesion de la cookie.
 *
 * @returns La sesion, o `null` si no hay o si la cookie no se puede abrir.
 */
export async function leerSesion (): Promise<Sesion | null> {
  const almacen = await cookies()

  return abrir(almacen.get(NOMBRE_COOKIE)?.value, claveSesion())
}

/**
 * Escribe la cookie de sesion.
 *
 * Solo funciona desde un route handler, una server action o el proxy: un Server Component no puede
 * escribir cookies. Por eso el refresco vive en el proxy y en el BFF, no en las pantallas.
 */
export async function guardarSesion (sesion: Sesion): Promise<void> {
  const almacen = await cookies()

  almacen.set(NOMBRE_COOKIE, sellar(sesion, claveSesion()), opcionesCookie())
}

/** Borra la cookie. Se llama al salir y cuando la API dice que el token esta revocado. */
export async function borrarSesion (): Promise<void> {
  const almacen = await cookies()

  almacen.delete(NOMBRE_COOKIE)
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
