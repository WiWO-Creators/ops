import { NextResponse } from 'next/server'
import { personasEnSalas } from '@/datos/teletrabajo'
import { leerSesion } from '@/datos/sesion'

/**
 * Quién del equipo está en qué sala de Teletrabajo, para las tarjetas del equipo en vivo.
 *
 * Existe porque LiveKit solo se puede preguntar desde el servidor (su secreto no cruza al navegador)
 * y porque la API de la plataforma no sabe de salas. Pide sesión de staff y nada más: no devuelve
 * contenido de nadie, solo `{ [idDePersona]: sala }`, y una sala de Espacio sale como `privada`
 * para no decir en qué Proyecto se reúne alguien.
 *
 * Quién de esas personas se ve en el tablero lo decide el tablero (`GET /live`), no esta ruta: aquí
 * solo se cruza lo que ya se mostró.
 *
 * Responde `{data:{...}}`; 401 sin sesión de staff; 503 `salas_no_disponibles` si LiveKit no
 * contestó (quien llama conserva lo último que sabía).
 */

/** Sin esto Next serviría la respuesta del build para siempre. */
export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'cache-control': 'no-store' }

/**
 * @returns el mapa de personas en sala como objeto JSON
 */
export async function GET (): Promise<NextResponse> {
  if (await leerSesion('staff') === null) {
    return NextResponse.json({ error: { code: 'sin_sesion' } }, { status: 401, headers: SIN_CACHE })
  }

  const personas = await personasEnSalas()

  if (personas === null) {
    return NextResponse.json({ error: { code: 'salas_no_disponibles' } }, { status: 503, headers: SIN_CACHE })
  }

  return NextResponse.json({ data: Object.fromEntries(personas) }, { headers: SIN_CACHE })
}
