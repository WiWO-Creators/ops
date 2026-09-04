import 'server-only'

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { esNombreDeSalaValido, imagenDeMetadata } from '@/dominio/teletrabajo'

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

/** Las tres variables de entorno de LiveKit, ya comprobadas. */
interface ConfiguracionDeLiveKit {
  clave: string
  secreto: string
  url: string
}

/**
 * Lee la configuracion de LiveKit del entorno.
 *
 * Existe para que las tres comprobaciones esten en un solo lugar: con la firma del token y las
 * consultas de ocupacion leyendo `process.env` cada una por su cuenta, un despliegue al que le
 * falta una variable falla en un sitio y funciona a medias en el otro.
 *
 * @returns Las tres variables.
 * @throws {Error} Si falta alguna.
 */
function configuracionDeLiveKit (): ConfiguracionDeLiveKit {
  const clave = process.env.LIVEKIT_API_KEY
  const secreto = process.env.LIVEKIT_API_SECRET
  const url = process.env.LIVEKIT_URL

  if (clave === undefined || clave === '' ||
      secreto === undefined || secreto === '' ||
      url === undefined || url === '') {
    throw new Error('Faltan LIVEKIT_API_KEY, LIVEKIT_API_SECRET o LIVEKIT_URL')
  }

  return { clave, secreto, url }
}

/**
 * Cliente de la API de administracion de LiveKit.
 *
 * `LIVEKIT_URL` es la del navegador y viene en `wss://`, porque es la que abre el WebSocket de la
 * sala. La API de administracion es HTTP y **rechaza ese esquema**: hay que traducirlo. Es el error
 * silencioso mas facil de cometer aca — la URL parece correcta y el cliente no conecta nunca.
 */
function administracion (): RoomServiceClient {
  const { clave, secreto, url } = configuracionDeLiveKit()

  return new RoomServiceClient(url.replace(/^ws/, 'http'), clave, secreto)
}

/** Lo que se sabe de alguien que ya esta dentro de una sala, para anunciarlo en la antesala. */
export interface QuienEsta {
  identidad: string
  nombre: string
  imagen: string | null
}

/**
 * Cuanta gente hay en cada sala activa.
 *
 * Una sola consulta para toda la portada: `listRooms()` sin argumentos trae las salas que existen
 * ahora mismo. Una sala vacia **no aparece** en la respuesta, y eso significa cero, no error.
 *
 * @returns Mapa de nombre de sala a cantidad de personas, o `null` si LiveKit no respondio.
 */
export async function ocupacionDeSalas (): Promise<Map<string, number> | null> {
  try {
    const salas = await administracion().listRooms()

    return new Map(salas.map((sala) => [sala.name, sala.numParticipants]))
  } catch {
    // Que el servidor de video este caido no puede tumbar la portada: las salas siguen listadas y
    // sin contador. Devolver un mapa vacio seria peor que devolver `null` — se leeria como "no hay
    // nadie en ninguna", que es una afirmacion que en ese momento no se puede hacer.
    return null
  }
}

/**
 * Quien esta dentro de una sala, ahora mismo.
 *
 * Es lo que la antesala necesita para poder decir "ya estan Ana y Jose" antes de entrar, en vez de
 * un numero suelto.
 *
 * @param sala Nombre de la sala en LiveKit.
 * @returns Las personas dentro, o `null` si LiveKit no respondio o la sala no existe todavia.
 */
export async function quienEstaEn (sala: string): Promise<QuienEsta[] | null> {
  if (!esNombreDeSalaValido(sala)) return null

  try {
    const dentro = await administracion().listParticipants(sala)

    return dentro.map((participante) => ({
      identidad: participante.identity,
      nombre: participante.name === '' ? participante.identity : participante.name,
      imagen: imagenDeMetadata(participante.metadata)
    }))
  } catch {
    // Una sala a la que nadie entro todavia no existe en LiveKit y la consulta falla. Es el caso
    // normal, no un fallo: se responde igual que si el servidor no contestara y la antesala no
    // muestra a nadie.
    return null
  }
}

/**
 * Firma la entrada de una persona a una sala.
 *
 * **No autoriza nada.** Quien llama ya decidio que esta persona puede entrar a esta sala; aca solo
 * se emite la credencial. Llamarla sin haber comprobado el permiso es exactamente el error que
 * `dominio/teletrabajo.ts` existe para evitar.
 *
 * Lo que si comprueba es la forma del nombre, y no por desconfiar de quien llama hoy: el nombre
 * entra literal en un JWT firmado, que es la unica autoridad que LiveKit reconoce. Que hoy llegue
 * validado es un contrato en un comentario, y un comentario no detiene al segundo llamador que
 * alguien agregue el año que viene.
 *
 * La foto de perfil viaja en `metadata` y no en un campo propio porque LiveKit no tiene uno: es el
 * unico lugar donde un dato del producto llega a los demas participantes. Es la misma URL que el
 * resto del panel ya muestra a los compañeros, y si no carga, el avatar cae a las iniciales.
 *
 * @param sala      Nombre de la sala en LiveKit.
 * @param identidad Identidad unica de esta conexion (ver `identidadDe`).
 * @param nombre    Nombre para mostrar sobre el video.
 * @param imagen    Foto de perfil, si la persona tiene.
 * @returns El token firmado y la URL del servidor.
 * @throws {Error} Si el nombre de sala no es valido, o si falta alguna de las tres variables de
 *                 entorno de LiveKit.
 */
export async function firmarEntrada (
  sala: string,
  identidad: string,
  nombre: string,
  imagen: string | null = null
): Promise<EntradaALaSala> {
  if (!esNombreDeSalaValido(sala)) {
    throw new Error(`Nombre de sala invalido: "${sala}"`)
  }

  const { clave, secreto, url } = configuracionDeLiveKit()

  const token = new AccessToken(clave, secreto, {
    identity: identidad,
    name: nombre,
    metadata: JSON.stringify({ imagen }),
    ttl: HORAS_DE_VIGENCIA * 60 * 60
  })

  // `roomCreate` no se concede: las salas nacen solas con `auto_create` del servidor, y sin ese
  // permiso un token filtrado no puede fabricar salas nuevas fuera del catalogo.
  token.addGrant({
    roomJoin: true,
    room: sala,
    canPublish: true,
    canSubscribe: true,
    // Habilita el canal de datos, que es lo que usan el chat de la sala y los indicadores de
    // calidad. No publica media.
    canPublishData: true
  })

  return { token: await token.toJwt(), url }
}
