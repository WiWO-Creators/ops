import 'server-only'

import { llamarApiTipado } from './api'
import { unaVezPorClave } from './mutex'
import { sesionDesdeTokens, type Sesion } from './sobre-sesion'
import type { ParDeTokens } from './tipos'

/**
 * Refresco del token de acceso, con un solo intento en vuelo por token.
 *
 * Esto no es una optimizacion: es una condicion de correccion. La API **revoca todas las sesiones
 * del staff** cuando se reusa un token de refresco ya consumido — es su defensa contra el robo de
 * tokens. Si dos peticiones vencidas refrescan a la vez, la segunda usa un refresco ya gastado y
 * deja a la persona afuera de todas sus pestañas.
 *
 * ponytail: el mapa vive en memoria del proceso. Con varias instancias de Next detras de un
 * balanceador, dos procesos podrian refrescar en paralelo; la salida seria un candado compartido
 * (Redis) o afinidad de sesion. Hoy corre una sola instancia.
 */
const enVuelo = new Map<string, Promise<Sesion>>()

/**
 * Canjea el token de refresco por un par nuevo.
 *
 * @param sesion La sesion con el token de refresco a canjear.
 * @returns La sesion nueva, con su vencimiento ya calculado.
 * @throws ErrorApi si el refresco vencio o fue revocado: ahi hay que volver a entrar.
 */
export async function refrescar (sesion: Sesion): Promise<Sesion> {
  return await unaVezPorClave(enVuelo, sesion.refresco, async () => {
    const { data } = await llamarApiTipado<ParDeTokens>('/auth/refresh', {
      metodo: 'POST',
      cuerpo: { refresh_token: sesion.refresco }
    })

    return sesionDesdeTokens(data, sesion.staffId)
  })
}
