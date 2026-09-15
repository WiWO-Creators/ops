import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { llamarApi } from '@/datos/api'

/**
 * Lo que sondea el televisor: el paquete de la pantalla de un area.
 *
 * === POR QUE EXISTE, SI LA RUTA DE LA API ES PUBLICA ===
 *
 * Tres razones, en orden de importancia:
 *
 * 1. `src/datos/api.ts` es el unico punto del proyecto que conoce la URL de la API. Si la pantalla
 *    llamara directo desde el navegador, esa URL se publicaria en el HTML de una pagina abierta a
 *    internet y ademas haria falta CORS para cada televisor.
 * 2. Es lo que se puede interceptar en una prueba de navegador. Un Server Component no se puede
 *    stubbear desde afuera; una peticion `fetch` del cliente si, y eso es lo que hace verificable la
 *    rotacion, la degradacion y los vacios sin depender de que haya datos reales.
 * 3. Es donde se fija `no-store`. Sin eso, un proxy o una CDN en el medio puede guardar un snapshot y
 *    dejar la pantalla mostrando el mismo minuto para siempre: un fallo que nadie detecta, porque la
 *    pared se ve perfecta.
 *
 * NO pasa por el BFF (`/api/bff/...`) a proposito: aquel existe para adosar el token de una persona a
 * la peticion, y aca no hay persona.
 */

export const dynamic = 'force-dynamic'

/**
 * La forma de un codigo de pantalla: cinco caracteres del alfabeto sin ambiguedades.
 *
 * Se valida antes de reenviar para que la ruta no sirva de tunel hacia otras rutas de la API. La caja
 * no importa —nadie controla las mayusculas escribiendo con un control remoto, y la API normaliza—
 * pero la clase de caracteres si: nada que pueda salirse del segmento de URL.
 *
 * Tiene que seguir a `Escritura\Pantallas::ALFABETO`. Si alla se agrega un simbolo y aca no, esta
 * ruta contesta 404 a codigos que la API considera validos, y el fallo se ve como "esa pantalla no
 * existe" en vez de como lo que es.
 */
const FORMA_DE_CODIGO = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/i

/**
 * Reenvia `GET /public/display/{codigo}`, incluida la revalidacion por `ETag`.
 *
 * El `if-none-match` que manda el navegador viaja tal cual, y un `304` de la API vuelve como `304`
 * sin cuerpo: es lo que hace que un televisor que pregunta cada treinta segundos durante meses no
 * mueva un solo byte de datos mientras no pase nada.
 *
 * No se reenvia ninguna otra cabecera del cliente ni la query, y el codigo no se escribe en ningun log.
 */
export async function GET (
  peticion: NextRequest,
  ctx: RouteContext<'/api/pantalla/[codigo]'>
): Promise<Response> {
  const { codigo } = await ctx.params

  if (!FORMA_DE_CODIGO.test(codigo)) {
    return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 })
  }

  const cabeceras: Record<string, string> = {}
  const etag = peticion.headers.get('if-none-match')

  if (etag !== null) {
    cabeceras['if-none-match'] = etag
  }

  let respuesta: Response

  try {
    respuesta = await llamarApi(`/public/display/${encodeURIComponent(codigo)}`, { cabeceras })
  } catch {
    // La API no contesto: se dice con un 503, y la pantalla lo cuenta como un fallo mas de su
    // backoff. Sin cuerpo con detalle — esta ruta esta abierta a internet.
    return NextResponse.json({ error: { code: 'upstream_down' } }, { status: 503 })
  }

  if (respuesta.status === 304) {
    // Sin cuerpo y conservando el ETag, que es lo que el navegador va a volver a mandar.
    return new NextResponse(null, {
      status: 304,
      headers: cabecerasDeSalida(respuesta)
    })
  }

  return new NextResponse(await respuesta.text(), {
    status: respuesta.status,
    headers: cabecerasDeSalida(respuesta)
  })
}

/**
 * Las cabeceras que vuelven al navegador.
 *
 * `no-store` en el borde y no `no-cache`: la revalidacion contra la API ya la hace esta ruta con el
 * `if-none-match`, y lo que no se quiere es que algo entre el televisor y Next se quede con una copia
 * del paquete de un area.
 */
function cabecerasDeSalida (respuesta: Response): Headers {
  const cabeceras = new Headers({ 'cache-control': 'no-store' })
  const etag = respuesta.headers.get('etag')

  if (etag !== null) {
    cabeceras.set('etag', etag)
  }

  if (respuesta.status !== 304) {
    cabeceras.set('content-type', 'application/json; charset=utf-8')
  }

  return cabeceras
}
