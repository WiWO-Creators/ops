import { NextResponse, type NextRequest } from 'next/server'
import { claveSesion, VIDA_TRASPASO_SEGUNDOS } from '@/datos/config'
import { claveTraspaso, PATRON_PKCE, sellarTraspaso } from '@/datos/traspaso'

/**
 * Sella el login de Google que se hizo en Chrome para que la app nativa lo canjee en su WebView.
 *
 * No abre sesión ni mira cookies: recibe el ID token y el reto de la app y devuelve el código. Que
 * cualquiera pueda pedir uno no regala nada —sellar una credencial propia equivale a mandarla directo a
 * `/api/sesion`—, y quien valida la cuenta sigue siendo la API al canjear. Ver `datos/traspaso.ts`.
 */

interface CuerpoTraspaso {
  google?: unknown
  reto?: unknown
}

/**
 * Devuelve el código de traspaso.
 *
 * @returns `{ codigo }` sin caché, o 400 si falta la credencial o el reto no es PKCE.
 */
export async function POST (peticion: NextRequest): Promise<NextResponse> {
  let cuerpo: CuerpoTraspaso

  try {
    cuerpo = await peticion.json() as CuerpoTraspaso
  } catch {
    return responder({ mensaje: 'Cuerpo inválido' }, 400)
  }

  if (typeof cuerpo.google !== 'string' || cuerpo.google.trim() === '') {
    return responder({ mensaje: 'Falta la credencial de Google' }, 400)
  }

  if (typeof cuerpo.reto !== 'string' || !PATRON_PKCE.test(cuerpo.reto)) {
    return responder({ mensaje: 'El reto no es válido.' }, 400)
  }

  const codigo = sellarTraspaso(cuerpo.google, cuerpo.reto, claveTraspaso(claveSesion()), VIDA_TRASPASO_SEGUNDOS)

  return responder({ codigo }, 200)
}

/** Respuesta JSON que nunca se cachea: lleva una credencial sellada. */
function responder (cuerpo: Record<string, unknown>, estado: number): NextResponse {
  return NextResponse.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } })
}
