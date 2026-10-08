import { escribirEnBff, leerDelBff, type OpcionesDeEscritura } from './mutaciones'
import { mutarConReintento, type OpcionesDeReintento, type ResultadoDeMutacion } from '@/datos/reintento'

export { ESPERAS_DE_REINTENTO_MS, mutarConReintento, servidorIdempotente } from '@/datos/reintento'
export type { OpcionesDeReintento, ResultadoDeMutacion } from '@/datos/reintento'

/**
 * Escribe en el BFF con reintento seguro y verificación del estado real.
 *
 * @param ruta ruta del BFF, sin barra inicial
 * @param metodo verbo de la escritura
 * @param cuerpo cuerpo JSON
 * @param opciones comprobación de estado y versión esperada
 * @returns el resultado definitivo de la escritura
 */
export async function mutarEnBff<T> (
  ruta: string,
  metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  cuerpo?: unknown,
  opciones: Pick<OpcionesDeReintento, 'yaAplicada' | 'servidorIdempotente'> & Pick<OpcionesDeEscritura, 'siCoincide' | 'senal'> = {}
): Promise<ResultadoDeMutacion<T>> {
  const { siCoincide, senal, ...reintento } = opciones

  return await mutarConReintento<T>(
    async (clave) => await escribirEnBff<T>(ruta, metodo, cuerpo, { idempotencia: clave, siCoincide, senal }),
    { metodo, ...reintento }
  )
}

/**
 * Comprobación de «¿la tarea ya tiene este valor?» leyendo su estado real.
 *
 * @param ruta ruta de lectura de la entidad, por ejemplo `tasks/12`
 * @param coincide recibe el `data` leído y dice si ya refleja lo pedido
 * @returns una función apta para {@link OpcionesDeReintento.yaAplicada}
 */
export function comprobarEntidad<T> (ruta: string, coincide: (datos: T) => boolean): () => Promise<boolean> {
  return async () => {
    const leida = await leerDelBff<T>(ruta)

    return leida.ok && coincide(leida.datos)
  }
}
