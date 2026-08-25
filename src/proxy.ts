import { NextResponse, type NextRequest } from 'next/server'
import { claveSesion, MARGEN_REFRESCO_SEGUNDOS } from '@/datos/config'
import { refrescar } from '@/datos/refresco'
import { NOMBRE_COOKIE, opcionesCookie } from '@/datos/sesion'
import { abrir, porVencer, sellar } from '@/datos/sobre-sesion'

/**
 * Guardia de acceso y refresco por adelantado.
 *
 * Hace dos cosas, y las dos existen porque un Server Component **no puede escribir cookies**:
 *
 *  1. Manda a `/entrar` a quien no tenga sesion, antes de que una pantalla intente pedir datos.
 *  2. Renueva el token de acceso cuando le quedan menos de `MARGEN_REFRESCO_SEGUNDOS`, de modo que
 *     las pantallas siempre reciban uno vigente y no tengan que resolver el vencimiento.
 *
 * El refresco reactivo sigue existiendo en el BFF, para la peticion que igual llega vencida.
 *
 * En Next 16 esto es `proxy`, no `middleware`, y corre siempre en Node.
 */
export async function proxy (peticion: NextRequest): Promise<NextResponse> {
  const clave = claveSesion()
  const sesion = abrir(peticion.cookies.get(NOMBRE_COOKIE)?.value, clave)

  if (sesion === null) {
    return NextResponse.redirect(new URL('/entrar', peticion.url))
  }

  if (!porVencer(sesion, MARGEN_REFRESCO_SEGUNDOS)) {
    return NextResponse.next()
  }

  try {
    const renovada = await refrescar(sesion)
    const respuesta = NextResponse.next()

    respuesta.cookies.set(NOMBRE_COOKIE, sellar(renovada, clave), opcionesCookie())

    return respuesta
  } catch {
    // El refresco se rechaza cuando vencio o fue revocado. En los dos casos hay que volver a entrar,
    // y la cookie vieja se borra para no reintentar en cada navegacion.
    const respuesta = NextResponse.redirect(new URL('/entrar', peticion.url))
    respuesta.cookies.delete(NOMBRE_COOKIE)

    return respuesta
  }
}

/**
 * Solo el panel.
 *
 * Fuera quedan `/entrar` (que existe justo para quien no tiene sesion), `/api/sesion` (que la crea),
 * `/api/bff` (que resuelve su propio refresco y debe responder 401 en JSON, no redirigir), el taller
 * y los estaticos.
 *
 * Los estaticos se excluyen por tener extension y no por nombre: la lista anterior enumeraba
 * `favicon.ico` y `fonts`, asi que cada archivo nuevo de `public/` nacia protegido y la pantalla de
 * entrar —donde justamente no hay sesion— lo recibia como redireccion a `/entrar`. El logotipo fue el
 * primero en toparse con eso. Ninguna pantalla del panel tiene punto en su ruta.
 */
export const config = {
  matcher: ['/((?!entrar|api|taller|_next|.*\\.[a-z0-9]+$).*)']
}
