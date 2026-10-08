/**
 * Carga de propuestas desde el servidor de Next, para las páginas de `/propuestas`.
 *
 * Aparte de `datos/propuestas.ts` porque este módulo importa `pedir`, que solo corre en el servidor,
 * y el otro lo consume también el contador de la barra, que corre en el navegador.
 */
import { esRutaAusente, propuestasDe, rutaDePropuestas, type FiltroDePropuestas } from './propuestas.ts'
import { ErrorApi } from './errores.ts'
import { pedir } from './servidor.ts'
import type { PropuestaExterna } from '../dominio/propuestas.ts'

/**
 * Trae las propuestas, o el error de la API como valor. Una ruta ausente es «ninguna».
 *
 * @param filtro `pendiente` o `todas`
 * @returns las propuestas, o el `ErrorApi` si la API contestó con un fallo
 * @throws cualquier error que no sea de la API (por ejemplo, el `redirect` de una sesión vencida)
 */
export async function cargarPropuestas (filtro: FiltroDePropuestas): Promise<PropuestaExterna[] | ErrorApi> {
  try {
    return propuestasDe((await pedir<unknown>(`/${rutaDePropuestas(filtro)}`)).data)
  } catch (error) {
    if (esRutaAusente(error)) return []
    if (error instanceof ErrorApi) return error

    throw error
  }
}
