import 'server-only'

import { cache } from 'react'

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

/**
 * Si la capa de IA esta encendida en esta instalacion.
 *
 * La API responde 404 a todo `/ia/*` cuando `ia_habilitada` esta en `0` —el mismo gesto que usa el
 * login con Google con su interruptor—, asi que sin esta consulta la interfaz ofrece un boton que
 * falla al apretarlo. Ofrecer algo que no existe es peor que no ofrecerlo: la persona no puede
 * distinguir "esto no esta contratado" de "esto se rompio".
 *
 * Un fallo de `/settings` devuelve `false`: ante la duda, no se ofrece. Es una comodidad opcional,
 * y una pantalla no puede caerse porque no se pudo leer un interruptor.
 *
 * `cache()` de React, no de datos: memoiza por peticion, para que una pagina que lo consulte dos
 * veces no pida `/settings` dos veces.
 */
export const iaHabilitada = cache(async (): Promise<boolean> => {
  try {
    const ajustes = await leerAjustes()

    return ajustes.editable.ia_habilitada?.value === true
  } catch {
    return false
  }
})
