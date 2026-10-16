import { NextResponse } from 'next/server'
import { estadoEnVivo } from '@/datos/ajustes'
import { llamarApiTipado } from '@/datos/api'
import { personasEnSalas } from '@/datos/teletrabajo'
import { leerSesion } from '@/datos/sesion'
import type { Yo } from '@/datos/tipos'
import { alcanceDeLive } from '@/dominio/live'

/**
 * Quién del equipo está en qué sala de Teletrabajo, para las tarjetas del equipo en vivo.
 *
 * Existe porque LiveKit solo se puede preguntar desde el servidor (su secreto no cruza al navegador)
 * y porque la API de la plataforma no sabe de salas. Exige sesión de staff, «Equipo en vivo» encendido
 * y el mismo alcance que el tablero (`GET /live`): quien solo se ve a sí misma no la usa y recibe 404.
 * No devuelve contenido de nadie, solo `{ [idDePersona]: sala }`, y una sala de Espacio sale como
 * `privada` para no decir en qué Proyecto se reúne alguien.
 *
 * Quién de esas personas se ve en el tablero lo decide el tablero (`GET /live`), no esta ruta: aquí
 * solo se cruza lo que ya se mostró.
 *
 * Responde `{data:{...}}`; 401 sin sesión de staff; 404 con «Equipo en vivo» apagado o alcance
 * propio; 503 `salas_no_disponibles` si LiveKit no contestó (quien llama conserva lo último que sabía).
 */

/** Sin esto Next serviría la respuesta del build para siempre. */
export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'cache-control': 'no-store' }

/**
 * Si quien pregunta ve a más gente que a sí misma, que es lo que hace el tablero `GET /live`.
 *
 * @param acceso el token de la persona
 * @returns `true` si su alcance en el tablero no es `propio`; `false` también si `/me` no se pudo leer
 */
async function veAlEquipo (acceso: string): Promise<boolean> {
  try {
    const { data: yo } = await llamarApiTipado<Yo>('/me', { token: acceso })

    return alcanceDeLive(yo) !== 'propio'
  } catch {
    return false
  }
}

/**
 * @returns el mapa de personas en sala como objeto JSON; 404 si «Equipo en vivo» está apagado o quien
 * pregunta solo ve su propia fila (la ruta no existe para ella)
 */
export async function GET (): Promise<NextResponse> {
  const sesion = await leerSesion('staff')

  if (sesion === null) {
    return NextResponse.json({ error: { code: 'sin_sesion' } }, { status: 401, headers: SIN_CACHE })
  }

  if (!(await estadoEnVivo()).equipo || !await veAlEquipo(sesion.acceso)) {
    return NextResponse.json({ error: { code: 'no_encontrado' } }, { status: 404, headers: SIN_CACHE })
  }

  const personas = await personasEnSalas()

  if (personas === null) {
    return NextResponse.json({ error: { code: 'salas_no_disponibles' } }, { status: 503, headers: SIN_CACHE })
  }

  return NextResponse.json({ data: Object.fromEntries(personas) }, { headers: SIN_CACHE })
}
