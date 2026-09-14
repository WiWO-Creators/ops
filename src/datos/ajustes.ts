import 'server-only'

import { cache } from 'react'

import { pedir } from './servidor.ts'
import { ErrorApi } from './errores.ts'
import { motivoDeIa } from '../dominio/ajustes.ts'
import type { EstadoIa } from '../dominio/ajustes.ts'
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
 * Si la capa de IA esta encendida en esta instalacion, y por que no lo esta cuando no lo esta.
 *
 * La API responde 404 a todo `/ia/*` cuando `ia_habilitada` esta en `0` —el mismo gesto que usa el
 * login con Google con su interruptor—, asi que sin esta consulta la interfaz ofrece un boton que
 * falla al apretarlo. Ofrecer algo que no existe es peor que no ofrecerlo: la persona no puede
 * distinguir "esto no esta contratado" de "esto se rompio".
 *
 * Un fallo de `/settings` da `activa: false`: ante la duda, no se ofrece. Es una comodidad opcional,
 * y una pantalla no puede caerse porque no se pudo leer un interruptor. Lo que cambia respecto de
 * tragarse el error es que el motivo viaja: la pantalla puede decir cual de los tres casos es en vez
 * de mostrar el mismo cartel para un ajuste apagado que para la API caida.
 *
 * `cache()` de React, no de datos: memoiza por peticion, para que una pagina que lo consulte dos
 * veces no pida `/settings` dos veces.
 */
export type { EstadoIa }

export const estadoIa = cache(async (): Promise<EstadoIa> => {
  try {
    const ajustes = await leerAjustes()
    const motivo = motivoDeIa(ajustes.editable.ia_habilitada?.value)

    return { activa: motivo === 'encendida', motivo }
  } catch (error) {
    return {
      activa: false,
      motivo: 'no_se_pudo_leer',
      detalle: error instanceof ErrorApi
        ? `${error.codigo} (HTTP ${error.estado}): ${error.message}`
        : error instanceof Error ? error.message : String(error)
    }
  }
})

/**
 * Si la capa de IA esta encendida. Envoltorio de `estadoIa()` para quien solo necesita el si o el no.
 *
 * Comparte su `cache()`: preguntar por el booleano despues del motivo no pide `/settings` de nuevo.
 */
export async function iaHabilitada (): Promise<boolean> {
  return (await estadoIa()).activa
}
