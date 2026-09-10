import { NextResponse } from 'next/server'
import { versionDelServidor } from '@/datos/version'

/**
 * Que version esta sirviendo el servidor ahora mismo.
 *
 * Es la unica forma que tiene una pestaña de saber que su JavaScript quedo viejo: preguntarselo a
 * quien si lo sabe. No lleva datos de nadie ni toca la API, asi que no pasa por el BFF ni pide sesion
 * — es informacion del despliegue, no del negocio.
 */

/**
 * `force-dynamic` es obligatorio aca.
 *
 * Sin esto Next resuelve la ruta durante el build y la sirve como estatica: devolveria para siempre
 * la version del build que la genero, que es justamente el numero que tiene que cambiar.
 */
export const dynamic = 'force-dynamic'

/**
 * @returns `{ version }` con la version del proceso que atiende
 */
export function GET (): NextResponse {
  // `no-store` explicito ademas de `force-dynamic`: lo primero manda en Next, lo segundo manda en el
  // navegador y en cualquier proxy que haya en el medio. Una respuesta cacheada un minuto retrasa el
  // aviso justo lo que el intervalo intenta acortar.
  return NextResponse.json(
    { version: versionDelServidor() },
    { headers: { 'cache-control': 'no-store' } }
  )
}
