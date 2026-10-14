import { NextResponse, type NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { CABECERA_TOKEN, comprobarSalud, resumenPublico, tokenValido } from '@/datos/salud'

/**
 * `GET /api/salud`: el chequeo que vigila un monitor externo.
 *
 * Responde 200 si el BFF y la API estan bien y 503 si falla cualquiera. Es publico (la ruta `/api`
 * queda fuera del guardia de sesion) pero el cuerpo solo dice si cada componente esta bien; el detalle
 * (tiempos, motivos y lo que reporta la API) viaja unicamente con la cabecera `x-salud-token` igual a
 * `WIWO_SALUD_TOKEN`, el mismo valor que la API usa en su propio `GET /health`.
 */

/** Sin esto Next resuelve la ruta en el build y la sirve estatica: un chequeo que nunca cambia. */
export const dynamic = 'force-dynamic'

/** Comparacion en tiempo constante: se hashea para que `timingSafeEqual` reciba largos iguales. */
function iguales (a: string, b: string): boolean {
  const hash = (valor: string): Buffer => createHash('sha256').update(valor).digest()

  return timingSafeEqual(hash(a), hash(b))
}

/**
 * @param peticion la peticion del monitor
 * @returns 200 o 503 con el cuerpo publico, o el detalle completo si el token es valido
 */
export async function GET (peticion: NextRequest): Promise<NextResponse> {
  const recibido = peticion.headers.get(CABECERA_TOKEN)
  const conDetalle = tokenValido(recibido, process.env.WIWO_SALUD_TOKEN, iguales)
  const baseApi = process.env.API_BASE?.trim().replace(/\/+$/, '') ?? ''

  const resultado = await comprobarSalud({
    baseApi: baseApi === '' ? null : baseApi,
    claveSesion: process.env.SESION_CLAVE,
    token: conDetalle ? recibido : null
  })

  return NextResponse.json(conDetalle ? resultado : resumenPublico(resultado), {
    status: resultado.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' }
  })
}
