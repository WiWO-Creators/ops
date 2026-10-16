import { NextResponse, type NextRequest } from 'next/server'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { cabecerasDeOrigen } from '@/datos/origen'
import { accesoGoogleDelPortal } from '@/dominio/portal-google'

/** Sin esto Next podria servir la respuesta de una vez para todos: aca cada correo tiene la suya. */
export const dynamic = 'force-dynamic'

/** Largo maximo de un correo (RFC 5321). Mas que eso no es un correo y no vale un viaje a la API. */
const LARGO_MAXIMO_CORREO = 254

/**
 * `GET /api/sesion/portal-google[?email=]`: si el portal ofrece Google y para que correo.
 *
 * Es el proxy de `GET /auth/portal/google`. Vive junto a `/api/sesion` y no en el BFF generico porque
 * `/auth/*` esta fuera de su lista blanca a proposito. No lleva token: la respuesta es publica y la
 * API la limita por IP, por eso viajan las cabeceras de origen (`datos/origen.ts`): sin ellas todos
 * los intentos parecerian venir de este servidor y compartirian el mismo tope.
 *
 * Sin `email` solo dice si el interruptor global esta encendido (lo que decide si el portal cambia de
 * cara). Con `email` agrega el `client_id` del cliente al que pertenece ese dominio, o `null`. La API
 * no revela si la cuenta existe; aca tampoco se agrega nada.
 *
 * @returns `{ enabled, client_id, required }` ya normalizado, o el error de la API tal cual (el `429`
 *          incluido: la pantalla lo muestra como «demasiados intentos»).
 */
export async function GET (peticion: NextRequest): Promise<NextResponse> {
  const email = peticion.nextUrl.searchParams.get('email')?.trim() ?? ''

  if (email.length > LARGO_MAXIMO_CORREO) {
    return NextResponse.json({ mensaje: 'Ese correo no es válido.' }, { status: 400 })
  }

  const consulta = email === '' ? '' : `?email=${encodeURIComponent(email)}`

  try {
    const { data } = await llamarApiTipado<unknown>(`/auth/portal/google${consulta}`, {
      cabeceras: cabecerasDeOrigen(peticion.headers)
    })

    return NextResponse.json(accesoGoogleDelPortal(data))
  } catch (error) {
    if (error instanceof ErrorApi) {
      return NextResponse.json({ codigo: error.codigo, mensaje: error.message }, { status: error.estado })
    }

    return NextResponse.json({ mensaje: 'No se pudo contactar al servidor.' }, { status: 502 })
  }
}
