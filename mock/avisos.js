/**
 * `/notifications` del mock: la campana y las notificaciones push del dispositivo.
 *
 * Hasta ahora el mock no servia la campana y en local contestaba 404; ahora sirve lo minimo para que
 * la campana y el service worker (`public/sw-push.js`) tengan con que trabajar, y las cuatro rutas de
 * Web Push con la misma forma y las mismas validaciones que `modules/api/Push/` en el board.
 *
 * El interruptor `wiwo_api_push` nace APAGADO, igual que en la instalacion real: con eso "Enviar
 * prueba" contesta `enabled: false` y la pantalla tiene que decirlo. `MOCK_PUSH_ENCENDIDO=1` lo
 * enciende para mirar el camino feliz. `MOCK_PUSH_SIN_CLAVES=1` simula el servidor sin claves VAPID.
 * El mock nunca manda un push de verdad: con el interruptor encendido cuenta cada dispositivo como
 * entregado.
 */

import { createECDH } from 'node:crypto'
import { ErrorApi } from './consulta.js'

/** Los mismos sufijos que `Suscripciones::HOSTS_PERMITIDOS`. */
const HOSTS_PERMITIDOS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com'
]

const LARGO_ENDPOINT = 1024
const LARGO_AGENTE = 255
const MAXIMO_SUSCRIPCIONES = 10

/** Una clave publica P-256 real, para que `pushManager.subscribe()` la acepte en un navegador. */
const CLAVE_PUBLICA = (() => {
  const curva = createECDH('prime256v1')
  curva.generateKeys()

  return curva.getPublicKey().toString('base64url')
})()

/** @type {Map<string, {staffid: number, endpoint: string, p256dh: string, auth: string, user_agent: string|null}>} */
const SUSCRIPCIONES = new Map()

/** @type {Map<number, Array<{id: number, text: string, read: boolean, date: string, link: string|null, from: {id: number, name: string}|null}>>} */
const AVISOS = new Map()

/** Estado del interruptor y de las claves, leido en cada peticion para poder cambiarlo en pruebas. */
function configuracion () {
  return {
    configurado: process.env.MOCK_PUSH_SIN_CLAVES !== '1',
    encendido: process.env.MOCK_PUSH_ENCENDIDO === '1'
  }
}

/** Los avisos de una persona, sembrados la primera vez que se piden. */
function avisosDe (staffId) {
  if (!AVISOS.has(staffId)) {
    const ahora = Date.now()
    AVISOS.set(staffId, [
      { id: 9002, text: 'Te asignaron la Tarea "Revisar la pauta de octubre".', read: false, date: new Date(ahora - 5 * 60000).toISOString(), link: '#taskid=512', from: { id: 2, name: 'Catalina Rojas' } },
      { id: 9001, text: 'Tu jornada sigue abierta.', read: true, date: new Date(ahora - 26 * 3600000).toISOString(), link: null, from: null }
    ])
  }

  return AVISOS.get(staffId)
}

/**
 * Si un endpoint es de un servicio de push conocido. Mismas reglas que `Suscripciones::endpointPermitido()`.
 *
 * @param {string} endpoint
 */
export function endpointPermitido (endpoint) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false

  const host = url.hostname.toLowerCase().replace(/\.$/, '')

  return HOSTS_PERMITIDOS.some((permitido) => host === permitido || host.endsWith('.' + permitido))
}

/** Bytes de un base64url estricto, o null. */
function bytes (valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(valor)) return null

  return Buffer.from(valor.replace(/=+$/, ''), 'base64url')
}

/**
 * Valida una suscripcion igual que `Suscripciones::validar()`, con los mismos codigos por campo.
 *
 * @param {Record<string, unknown>} cuerpo
 * @returns {{endpoint: string, p256dh: string, auth: string, user_agent: string|null}}
 * @throws {ErrorApi} 422
 */
export function validarSuscripcion (cuerpo) {
  const errores = {}

  for (const clave of Object.keys(cuerpo ?? {})) {
    if (!['endpoint', 'keys', 'expirationTime', 'user_agent'].includes(clave)) errores[clave] = ['no_editable']
  }

  const endpoint = typeof cuerpo?.endpoint === 'string' ? cuerpo.endpoint.trim() : ''
  if (endpoint === '') errores.endpoint = ['required']
  else if (endpoint.length > LARGO_ENDPOINT) errores.endpoint = [`max:${LARGO_ENDPOINT}`]
  else if (!endpointPermitido(endpoint)) errores.endpoint = ['push_service']

  const claves = cuerpo?.keys !== null && typeof cuerpo?.keys === 'object' ? cuerpo.keys : {}
  const punto = typeof claves.p256dh === 'string' && claves.p256dh.length <= 128 ? bytes(claves.p256dh) : null
  const secreto = typeof claves.auth === 'string' && claves.auth.length <= 64 ? bytes(claves.auth) : null

  if (punto === null || punto.length !== 65 || punto[0] !== 4) errores['keys.p256dh'] = ['p256']
  if (secreto === null || secreto.length !== 16) errores['keys.auth'] = ['auth']

  const agente = cuerpo?.user_agent
  if (agente !== undefined && agente !== null && typeof agente !== 'string') errores.user_agent = ['string']

  if (Object.keys(errores).length > 0) {
    throw new ErrorApi(422, 'validation_failed', 'La suscripción del dispositivo no es válida.', errores)
  }

  const limpio = typeof agente === 'string' ? agente.replace(/[\x00-\x1F\x7F]/g, '').trim() : ''

  return { endpoint, p256dh: claves.p256dh, auth: claves.auth, user_agent: limpio === '' ? null : limpio.slice(0, LARGO_AGENTE) }
}

/** Cuantos dispositivos tiene una persona. */
function contar (staffId) {
  let total = 0
  for (const fila of SUSCRIPCIONES.values()) if (fila.staffid === staffId) total++

  return total
}

/** `GET /notifications/push`: la misma forma que `ServicioPush::estado()`. */
export function estadoPush (staffId) {
  const { configurado, encendido } = configuracion()

  return {
    configured: configurado,
    enabled: configurado && encendido,
    public_key: configurado ? CLAVE_PUBLICA : null,
    subscriptions: contar(staffId)
  }
}

/** Guarda o reasigna una suscripcion; el tope por persona saca la mas vieja. */
export function suscribir (staffId, cuerpo) {
  const datos = validarSuscripcion(cuerpo)

  if (!SUSCRIPCIONES.has(datos.endpoint) && contar(staffId) >= MAXIMO_SUSCRIPCIONES) {
    const masVieja = [...SUSCRIPCIONES.entries()].find(([, fila]) => fila.staffid === staffId)
    if (masVieja !== undefined) SUSCRIPCIONES.delete(masVieja[0])
  }

  // Mismo endpoint, otra persona: el dispositivo pasa a ser de quien lo esta usando.
  SUSCRIPCIONES.set(datos.endpoint, { staffid: staffId, ...datos })

  return estadoPush(staffId)
}

/** Borra la suscripcion propia. Idempotente, y nunca borra la de otro. */
export function desuscribir (staffId, cuerpo) {
  const endpoint = typeof cuerpo?.endpoint === 'string' ? cuerpo.endpoint.trim() : ''

  if (endpoint === '' || endpoint.length > LARGO_ENDPOINT) {
    throw new ErrorApi(422, 'validation_failed', 'Falta el endpoint del dispositivo.', { endpoint: ['required'] })
  }

  if (SUSCRIPCIONES.get(endpoint)?.staffid === staffId) SUSCRIPCIONES.delete(endpoint)

  return estadoPush(staffId)
}

/** `POST /notifications/push/test`: la misma forma que `EnvioPush::probar()`. */
export function probar (staffId) {
  const { configurado, encendido } = configuracion()
  const resumen = { enabled: false, configured: configurado, attempted: 0, delivered: 0, removed: 0, failed: 0, skipped: 0 }

  if (!configurado || !encendido) return resumen

  const propias = contar(staffId)

  return { ...resumen, enabled: true, attempted: propias, delivered: propias }
}

/** Solo para las pruebas del mock. */
export function reiniciarPush () {
  SUSCRIPCIONES.clear()
  AVISOS.clear()
}

/**
 * Atiende todo `/notifications/*`.
 *
 * @param {string} metodo
 * @param {string[]} resto segmentos despues de `notifications`
 * @param {URLSearchParams} parametros
 * @param {{id: number}} actual staff de la sesion
 * @param {() => Promise<object>} cuerpo thunk: el cuerpo se lee solo si la ruta lo pide
 */
export async function avisosRuta (metodo, resto, parametros, actual, cuerpo) {
  const [sub, subsub] = resto

  if (sub === 'push') {
    if (subsub === undefined && metodo === 'GET') return { estado: 200, cuerpo: { data: estadoPush(actual.id) } }
    if (subsub === 'subscriptions' && resto.length === 2 && metodo === 'POST') {
      return { estado: 201, cuerpo: { data: suscribir(actual.id, await cuerpo()) } }
    }
    if (subsub === 'subscriptions' && resto.length === 2 && metodo === 'DELETE') {
      return { estado: 200, cuerpo: { data: desuscribir(actual.id, await cuerpo()) } }
    }
    if (subsub === 'test' && resto.length === 2 && metodo === 'POST') {
      return { estado: 201, cuerpo: { data: probar(actual.id) } }
    }

    throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
  }

  const avisos = avisosDe(actual.id)
  const sinLeer = () => avisos.filter((aviso) => !aviso.read).length

  if (sub === undefined && metodo === 'GET') {
    const filtro = parametros.get('filter[unread]')
    const filtradas = filtro === '1' ? avisos.filter((a) => !a.read) : filtro === '0' ? avisos.filter((a) => a.read) : avisos
    const porPagina = Math.max(1, Math.min(100, Number(parametros.get('per_page')) || 25))

    return {
      estado: 200,
      cuerpo: {
        data: filtradas.slice(0, porPagina),
        meta: { pagination: { page: 1, per_page: porPagina, total: filtradas.length, total_pages: Math.max(1, Math.ceil(filtradas.length / porPagina)) } }
      }
    }
  }

  if (sub === 'count' && resto.length === 1 && metodo === 'GET') {
    return { estado: 200, cuerpo: { data: { total: avisos.length, unread: sinLeer() } } }
  }

  if (sub === 'read' && resto.length === 1 && metodo === 'POST') {
    const marcadas = sinLeer()
    for (const aviso of avisos) aviso.read = true

    return { estado: 200, cuerpo: { data: { marked: marcadas, total: avisos.length, unread: 0 } } }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
}
