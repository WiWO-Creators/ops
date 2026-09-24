/**
 * Notificaciones push de este dispositivo: la logica que decide que mostrar, sin tocar el navegador.
 *
 * Vive en `dominio/` y no dentro del componente porque `pruebas/push.test.js` la corre con
 * `node --test`, que quita tipos de un `.ts` pero no sabe leer un `.tsx`. El componente
 * (`componentes/push/NotificacionesDelDispositivo.tsx`) junta los datos del navegador y de la API y
 * le pregunta aca en que estado esta.
 *
 * El push nace apagado en la instalacion (`wiwo_api_push`, migracion `0910` del board): suscribirse
 * funciona siempre que haya claves VAPID, pero no sale nada hasta que alguien lo encienda. La
 * pantalla lo dice en vez de dejar creer que el dispositivo esta roto.
 */

/** Interruptor de la instalacion que deja salir los push (`Escritura\Ajuste`, grupo `correo`). */
export const AJUSTE_PUSH = 'wiwo_api_push'

/** El grupo con el que se dibuja el interruptor. No es un grupo de la API: es el titulo de la caja. */
export const GRUPO_PUSH = 'avisos_push'

/**
 * Las claves del interruptor de push que la API deja editar: vacio si no esta en `editable`.
 *
 * @param editable el `editable` de `GET /settings`
 * @returns `[AJUSTE_PUSH]` o `[]`
 */
export function clavesDePush (editable: Record<string, unknown>): string[] {
  return AJUSTE_PUSH in editable ? [AJUSTE_PUSH] : []
}

/** `GET /notifications/push`. */
export interface EstadoPushServidor {
  /** Hay claves VAPID validas en el servidor. Sin ellas no hay con que suscribirse. */
  configured: boolean
  /** El interruptor `wiwo_api_push` esta encendido y las claves estan: los push salen. */
  enabled: boolean
  /** La clave publica VAPID en base64url, o `null` sin configuracion. */
  public_key: string | null
  /** Cuantos dispositivos tiene suscriptos quien mira, contando este. */
  subscriptions: number
}

/** `POST /notifications/push/test`. */
export interface ResumenPrueba {
  enabled: boolean
  configured: boolean
  attempted: number
  delivered: number
  removed: number
  failed: number
  skipped: number
}

/** Los estados que la pantalla sabe pintar. */
export type EstadoDelDispositivo =
  /** El navegador no tiene Service Worker, Push API o Notification. */
  | 'no-soportado'
  /** iPhone o iPad fuera de la app instalada: Safari solo da push a la app de la pantalla de inicio. */
  | 'requiere-instalar'
  /** El servidor no tiene claves VAPID: no hay con que suscribirse todavia. */
  | 'no-disponible'
  /** La persona le nego el permiso al sitio: solo se destraba desde los ajustes del navegador. */
  | 'bloqueado'
  /** Hay suscripcion en este dispositivo. */
  | 'activo'
  /** Todo en orden, pero este dispositivo no esta suscripto. */
  | 'inactivo'

/** Lo que el componente sabe del navegador y de la API, ya reunido. */
export interface DatosDelDispositivo {
  soportado: boolean
  esIOS: boolean
  instalada: boolean
  permiso: 'default' | 'granted' | 'denied'
  suscripto: boolean
  clavePublica: string | null
}

/**
 * En que estado esta este dispositivo.
 *
 * El orden importa: iOS va antes que "no soportado" porque Safari en iPhone, fuera de la app
 * instalada, no expone `PushManager`; decir "tu navegador no sirve" seria falso, porque instalandolo
 * si sirve. Y "bloqueado" va antes que "activo": con el permiso negado una suscripcion vieja ya no
 * muestra nada, aunque el navegador la siga devolviendo.
 *
 * @param datos lo reunido del navegador y de `GET /notifications/push`
 * @returns el estado a pintar
 */
export function estadoDelDispositivo (datos: DatosDelDispositivo): EstadoDelDispositivo {
  if (datos.esIOS && !datos.instalada) return 'requiere-instalar'
  if (!datos.soportado) return 'no-soportado'
  if (datos.permiso === 'denied') return 'bloqueado'
  if (datos.suscripto) return 'activo'
  if (datos.clavePublica === null || datos.clavePublica === '') return 'no-disponible'

  return 'inactivo'
}

/**
 * Si el dispositivo es un iPhone, iPad o iPod.
 *
 * El iPad desde iPadOS 13 se presenta como Mac de escritorio; lo que lo delata es que tiene
 * pantalla tactil, y ningun Mac la tiene.
 *
 * @param agente `navigator.userAgent`
 * @param puntosTactiles `navigator.maxTouchPoints`
 */
export function esDispositivoIOS (agente: string, puntosTactiles: number): boolean {
  if (/iPhone|iPad|iPod/i.test(agente)) return true

  return /Macintosh/i.test(agente) && puntosTactiles > 1
}

/**
 * Convierte la clave publica VAPID (base64url) a los bytes que pide `pushManager.subscribe()`.
 *
 * Se devuelve `Uint8Array` sobre un `ArrayBuffer` propio y no sobre uno compartido: Safari rechaza
 * la clave si el buffer tiene bytes de mas alrededor.
 *
 * @param clave la clave en base64url, con o sin relleno
 * @returns los 65 bytes del punto P-256
 * @throws Error si la clave no es base64url o no mide 65 bytes
 */
export function bytesDeClave (clave: string): Uint8Array<ArrayBuffer> {
  const limpia = clave.trim().replace(/=+$/, '')

  if (!/^[A-Za-z0-9_-]+$/.test(limpia)) throw new Error('La clave pública no es base64url.')

  const base64 = limpia.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (limpia.length % 4)) % 4)
  const binario = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binario.length))

  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)

  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('La clave pública no es un punto P-256.')

  return bytes
}

/** Tope del navegador que viaja con la suscripcion. El de la columna del board. */
const LARGO_AGENTE = 255

/**
 * El cuerpo de `POST /notifications/push/subscriptions`.
 *
 * Solo las tres piezas que la API acepta, mas el navegador para que la persona reconozca el
 * dispositivo. `expirationTime` no viaja: ningun servicio lo llena y la API no lo usa.
 *
 * @param suscripcion `PushSubscription.toJSON()`
 * @param agente `navigator.userAgent`
 * @returns el cuerpo, o `null` si la suscripcion vino incompleta
 */
export function cuerpoDeSuscripcion (
  suscripcion: { endpoint?: string, keys?: Record<string, string> },
  agente: string
): { endpoint: string, keys: { p256dh: string, auth: string }, user_agent: string } | null {
  const endpoint = suscripcion.endpoint
  const p256dh = suscripcion.keys?.p256dh
  const auth = suscripcion.keys?.auth

  if (typeof endpoint !== 'string' || endpoint === '') return null
  if (typeof p256dh !== 'string' || p256dh === '' || typeof auth !== 'string' || auth === '') return null

  return { endpoint, keys: { p256dh, auth }, user_agent: agente.slice(0, LARGO_AGENTE) }
}

/** Lo que dice la pantalla despues de "Enviar prueba". */
export interface MensajeDePrueba {
  tono: 'exito' | 'aviso' | 'peligro'
  texto: string
}

/**
 * Traduce el resumen de la prueba a una frase.
 *
 * El caso que mas importa es el apagado: la suscripcion quedo bien y no llega nada porque la
 * instalacion todavia no manda push. Sin decirlo, la persona concluye que su telefono no funciona.
 *
 * @param resumen la respuesta de `POST /notifications/push/test`
 */
export function mensajeDePrueba (resumen: ResumenPrueba): MensajeDePrueba {
  if (!resumen.configured) {
    return { tono: 'aviso', texto: 'El servidor todavía no tiene las claves de notificaciones.' }
  }

  if (!resumen.enabled) {
    return {
      tono: 'aviso',
      texto: 'El envío de notificaciones está en pausa para toda la instalación. Tu dispositivo quedó registrado y empezará a recibirlas cuando se encienda.'
    }
  }

  if (resumen.delivered > 0) {
    return {
      tono: 'exito',
      texto: resumen.delivered === 1
        ? 'Prueba enviada. Debería aparecer en unos segundos.'
        : `Prueba enviada a ${resumen.delivered} dispositivos. Debería aparecer en unos segundos.`
    }
  }

  if (resumen.attempted === 0) {
    return { tono: 'aviso', texto: 'No hay dispositivos registrados a tu nombre. Actívalo de nuevo.' }
  }

  return { tono: 'peligro', texto: 'El servicio de notificaciones no aceptó la prueba. Desactiva y vuelve a activar.' }
}
