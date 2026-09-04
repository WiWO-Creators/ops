import 'server-only'

import { pedir } from './servidor.ts'
import type { Ajustes } from './recursos.ts'

/**
 * Lectura de los ajustes de la instalacion (`GET /settings`).
 *
 * Vive aparte de `recursos.ts` por una razon mecanica, no estetica: leer necesita `pedir()`, que es
 * `server-only`, y `recursos.ts` lo importan noventa y pico de archivos —varios de ellos componentes
 * de cliente— como archivo de tipos. Meterle `server-only` convertiria el primer `export` de valor
 * que alguien agregue ahi en un error de compilacion en media aplicacion. La escritura, en cambio,
 * si vive en `recursos.ts`: pasa por el BFF y por lo tanto corre en el navegador.
 *
 * Mismo reparto que `lookups.ts` (carga) y `catalogos.ts` (lectura pura).
 *
 * @returns Las opciones editables con su dominio y las de solo lectura.
 * @throws ErrorApi si la API responde con error. La sesion vencida la resuelve `pedir()`.
 */
export async function leerAjustes (): Promise<Ajustes> {
  const { data } = await pedir<Ajustes>('/settings')

  return data
}
