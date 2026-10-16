import { firmar } from '../../src/lib/en-vivo/firma.ts'
import type { ConfiguracionDelServicio } from './configuracion.ts'

/**
 * Cliente HTTP del servicio hacia el board (`API_BASE`), con la firma HMAC de «Ops en vivo».
 *
 * Nunca sigue redirecciones, nunca espera más de `EN_VIVO_TIEMPO_API_MS` y nunca registra cuerpos:
 * lo que viaja son actas completas.
 */

export interface RespuestaDeBoard {
  estado: number
  /** El JSON de la respuesta, o `null` si no había cuerpo o no era JSON. */
  datos: unknown
}

export type ClienteBoard = (metodo: 'GET' | 'PUT', ruta: string, cuerpo?: unknown) => Promise<RespuestaDeBoard>

async function leerDatos (respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json()
  } catch {
    return null
  }
}

/**
 * Arma el cliente del board.
 *
 * @param config la configuración del servicio (base de la API, secreto y tiempo máximo)
 * @returns la función que llama al board: `pedirBoard(metodo, ruta, cuerpo?)`
 * @throws (al llamar) el error de red o `TimeoutError` si el board no contesta a tiempo; los códigos
 *         de estado no lanzan: los decide quien llama
 */
export function crearClienteBoard (
  config: Pick<ConfiguracionDelServicio, 'apiBase' | 'secreto' | 'tiempoApiMs'>
): ClienteBoard {
  return async function pedirBoard (metodo, ruta, cuerpo) {
    const crudo = cuerpo === undefined ? '' : JSON.stringify(cuerpo)
    const cabeceras: Record<string, string> = {
      accept: 'application/json',
      ...firmar(config.secreto, metodo, ruta, crudo)
    }

    if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json'

    const respuesta = await fetch(`${config.apiBase}/${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : crudo,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(config.tiempoApiMs)
    })

    return { estado: respuesta.status, datos: await leerDatos(respuesta) }
  }
}
