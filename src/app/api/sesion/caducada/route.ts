import { NextResponse, type NextRequest } from 'next/server'
import { entradaConMotivo } from '@/dominio/entrada'
import { nombreCookie, NOMBRE_COOKIE_SUPLANTADOR, opcionesCookie } from '@/datos/sesion'
import type { Sujeto } from '@/datos/sobre-sesion'

/**
 * Cierra una sesion que la API ya no acepta y devuelve a la pantalla de acceso.
 *
 * Existe por una sola razon: **un Server Component no puede escribir cookies**. Cuando `/me` —o
 * cualquier otra pantalla— recibe `unauthenticated`, `token_revoked` o `token_expired`, lo unico que
 * puede hacer es redirigir; si redirige a la pantalla de acceso, esa pantalla encuentra la cookie
 * intacta —se abre sin problemas, el cifrado no sabe nada de lo que opina la API—, concluye que hay
 * sesion y rebota al panel. El panel vuelve a pedir datos con el mismo token rechazado y el ciclo no
 * termina nunca. Este handler es el eslabon que rompe eso: borra la cookie y recien entonces lleva a
 * la pantalla de acceso, que ya no ve nada que la haga rebotar.
 *
 * Es `GET` porque quien lo invoca es un `redirect()` del servidor, que no puede elegir el metodo. No
 * revoca el token en la API —eso es lo que hace `DELETE /api/sesion` al salir a proposito—: aca el
 * token ya no vale, y una llamada mas a una API que acaba de rechazarlo solo agrega una espera y una
 * forma nueva de fallar entre la persona y su formulario de acceso.
 *
 * La cookie se borra sobre la respuesta y no con `cookies()`: la respuesta es una redireccion
 * construida a mano, y es la unica forma de tener la certeza de que el `Set-Cookie` viaja con ella.
 */
export function GET (peticion: NextRequest): NextResponse {
  const sujeto: Sujeto = peticion.nextUrl.searchParams.get('portal') === '1' ? 'contacto' : 'staff'
  const respuesta = NextResponse.redirect(new URL(entradaConMotivo(sujeto), peticion.url))
  // El mismo `path` con el que se escribio: una cookie de `path: '/'` no se borra con un delete que
  // asuma el path de esta ruta, y quedaria viva justo en el caso que esto existe para resolver.
  const { path } = opcionesCookie()

  respuesta.cookies.delete({ name: nombreCookie(sujeto), path })

  // Quien estaba suplantando pierde tambien la sesion real: la cookie del suplantador solo se puede
  // usar volviendo desde el panel, y a ese panel ya no se entra. Dejarla viva significaria que la
  // proxima persona que entre en esta maquina vea la franja de suplantacion sobre una sesion ajena.
  if (sujeto === 'staff') respuesta.cookies.delete({ name: NOMBRE_COOKIE_SUPLANTADOR, path })

  return respuesta
}
