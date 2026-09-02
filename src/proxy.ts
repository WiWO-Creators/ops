import { NextResponse, type NextRequest } from 'next/server'
import { claveSesion, MARGEN_REFRESCO_SEGUNDOS } from '@/datos/config'
import { refrescar } from '@/datos/refresco'
import { nombreCookie, opcionesCookie } from '@/datos/sesion'
import { abrir, porVencer, sellar, type Sujeto } from '@/datos/sobre-sesion'

/**
 * Guardia de acceso y refresco por adelantado.
 *
 * Hace dos cosas, y las dos existen porque un Server Component **no puede escribir cookies**:
 *
 *  1. Manda a la pantalla de acceso a quien no tenga sesion, antes de que una pantalla intente pedir
 *     datos.
 *  2. Renueva el token de acceso cuando le quedan menos de `MARGEN_REFRESCO_SEGUNDOS`, de modo que
 *     las pantallas siempre reciban uno vigente y no tengan que resolver el vencimiento.
 *
 * El refresco reactivo sigue existiendo en el BFF, para la peticion que igual llega vencida.
 *
 * Sirve a los dos sujetos. El prefijo de la ruta decide cual: `/portal` usa la cookie del contacto y
 * cae a `/`, que es su pantalla de acceso; el resto, la del panel y `/colab`. Sin esta rama, cada
 * pantalla nueva del portal terminaria mandando al cliente al login del equipo.
 *
 * En Next 16 esto es `proxy`, no `middleware`, y corre siempre en Node.
 */
export async function proxy (peticion: NextRequest): Promise<NextResponse> {
  const clave = claveSesion()
  const enPortal = peticion.nextUrl.pathname === '/portal' ||
    peticion.nextUrl.pathname.startsWith('/portal/')
  const sujeto: Sujeto = enPortal ? 'contacto' : 'staff'
  const cookie = nombreCookie(sujeto)
  const entrada = enPortal ? '/' : '/colab'
  const sesion = abrir(peticion.cookies.get(cookie)?.value, clave)

  // Una cookie del sujeto equivocado vale lo mismo que ninguna: mandar a entrar por la puerta que
  // corresponde.
  if (sesion === null || sesion.sujeto !== sujeto) {
    return NextResponse.redirect(new URL(entrada, peticion.url))
  }

  if (!porVencer(sesion, MARGEN_REFRESCO_SEGUNDOS)) {
    return NextResponse.next()
  }

  try {
    const renovada = await refrescar(sesion)
    const respuesta = NextResponse.next()

    respuesta.cookies.set(cookie, sellar(renovada, clave), opcionesCookie())

    return respuesta
  } catch {
    // El refresco se rechaza cuando vencio o fue revocado. En los dos casos hay que volver a entrar,
    // y la cookie vieja se borra para no reintentar en cada navegacion.
    const respuesta = NextResponse.redirect(new URL(entrada, peticion.url))
    respuesta.cookies.delete(cookie)

    return respuesta
  }
}

/**
 * El panel y el portal.
 *
 * Fuera quedan `/` y `/colab` (las dos pantallas de acceso, que existen justo para quien no tiene
 * sesion), `/sala/<token>` (la pantalla colgada en la puerta de una sala de reunion: una tablet en
 * la pared no se loguea, y la autoriza el token de la sala, no una cookie), `/api/sesion` (que la
 * crea),
 * `/api/bff` (que resuelve su propio refresco y debe responder 401 en JSON, no redirigir), el taller
 * y los estaticos.
 *
 * Los estaticos se excluyen por tener extension y no por nombre: la lista anterior enumeraba
 * `favicon.ico` y `fonts`, asi que cada archivo nuevo de `public/` nacia protegido y la pantalla de
 * entrar —donde justamente no hay sesion— lo recibia como redireccion a `/entrar`. El logotipo fue el
 * primero en toparse con eso. Ninguna pantalla del panel tiene punto en su ruta.
 *
 * La raiz se excluye con el `.+` del final: es lo unico que distingue `/` —donde entra el cliente— de
 * `/procesos`, porque el resto del patron mira el principio de la ruta y no su largo. Y `colab$` con
 * ancla, para que una futura `/colaboradores` no nazca destapada.
 */
export const config = {
  matcher: ['/((?!colab$|sala/|api|taller|_next|.*\\.[a-z0-9]+$).+)']
}
