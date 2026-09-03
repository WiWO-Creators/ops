import 'server-only'

import { AccessToken } from 'livekit-server-sdk'

/**
 * Firma de tokens de entrada a LiveKit.
 *
 * Vive aparte de las pantallas por una sola razon: el secreto de LiveKit no puede cruzar al
 * navegador nunca. `server-only` convierte en error de compilacion cualquier import desde un
 * componente de cliente, que es la unica garantia que no depende de acordarse.
 *
 * El token se firma en el servidor y viaja como prop al componente de la videollamada. No hay
 * endpoint de tokens a proposito: la pantalla ya autorizo antes de renderizar, y un endpoint seria
 * un segundo lugar donde volver a escribir la misma comprobacion.
 */

/**
 * Cuanto vale un token de entrada.
 *
 * Cuatro horas cubre una jornada de reuniones sin que a nadie se le venza a mitad de una. Cuando
 * vence, recargar la pantalla firma uno nuevo: la pagina es dinamica, no hay cache que invalidar.
 */
const HORAS_DE_VIGENCIA = 4

export interface EntradaALaSala {
  token: string
  url: string
}

/**
 * Firma la entrada de una persona a una sala.
 *
 * **No autoriza nada.** Quien llama ya decidio que esta persona puede entrar a esta sala; aca solo
 * se emite la credencial. Llamarla sin haber comprobado el permiso es exactamente el error que
 * `dominio/teletrabajo.ts` existe para evitar.
 *
 * @param sala      Nombre de la sala en LiveKit, ya validado.
 * @param identidad Identidad unica de esta conexion (ver `identidadDe`).
 * @param nombre    Nombre para mostrar sobre el video.
 * @returns El token firmado y la URL del servidor.
 * @throws {Error} Si falta alguna de las tres variables de entorno de LiveKit.
 */
export async function firmarEntrada (
  sala: string,
  identidad: string,
  nombre: string
): Promise<EntradaALaSala> {
  const clave = process.env.LIVEKIT_API_KEY
  const secreto = process.env.LIVEKIT_API_SECRET
  const url = process.env.LIVEKIT_URL

  if (clave === undefined || clave === '' ||
      secreto === undefined || secreto === '' ||
      url === undefined || url === '') {
    throw new Error('Faltan LIVEKIT_API_KEY, LIVEKIT_API_SECRET o LIVEKIT_URL')
  }

  const token = new AccessToken(clave, secreto, {
    identity: identidad,
    name: nombre,
    ttl: HORAS_DE_VIGENCIA * 60 * 60
  })

  // `roomCreate` no se concede: las salas nacen solas con `auto_create` del servidor, y sin ese
  // permiso un token filtrado no puede fabricar salas nuevas fuera del catalogo.
  token.addGrant({
    roomJoin: true,
    room: sala,
    canPublish: true,
    canSubscribe: true,
    // Habilita el canal de datos, que es lo que usan los indicadores de calidad y el "levantar la
    // mano" si mas adelante se agrega. No publica media.
    canPublishData: true
  })

  return { token: await token.toJwt(), url }
}
