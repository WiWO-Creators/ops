/**
 * Sesiones del mock: emision, validacion y rotacion de tokens en memoria.
 *
 * Replica el comportamiento observable de `modules/api/Auth/TokenGuard.php` segun el contrato — no su
 * implementacion. Acá los tokens viven en un `Map` y se pierden al reiniciar el proceso, que es
 * exactamente lo que se quiere de un mock.
 */

import { randomUUID } from 'node:crypto'
import { ErrorApi } from './consulta.js'
import { CONTACTOS, STAFF } from './datos.js'

export const VIDA_ACCESO = 3600
export const VIDA_REFRESCO = 2592000
export const VIDA_DESAFIO = 300

/** @type {Map<string, {sujeto: 'staff'|'contacto', sujetoId: number, tipo: 'acceso'|'refresco'|'desafio', vence: number, revocado: boolean}>} */
const tokens = new Map()

/** Staff cuyos refrescos fueron revocados en masa por reuso. Solo para el mensaje de diagnostico. */
const staffComprometido = new Set()

/** Reloj inyectable: las pruebas necesitan adelantar el tiempo sin esperarlo. */
let ahora = () => Date.now()

/**
 * Reemplaza el reloj del modulo. Solo para pruebas.
 * @param {() => number} reloj
 */
export function usarReloj (reloj) {
  ahora = reloj
}

/** Vacia el estado. Solo para pruebas, para que una no contamine a la siguiente. */
export function reiniciar () {
  tokens.clear()
  staffComprometido.clear()
  ahora = () => Date.now()
}

/**
 * Crea un token de un tipo dado.
 * @param {number} sujetoId
 * @param {'acceso'|'refresco'|'desafio'} tipo
 * @param {number} vidaSegundos
 * @param {'staff'|'contacto'} [sujeto]
 * @returns {string}
 */
function emitir (sujetoId, tipo, vidaSegundos, sujeto = 'staff') {
  const token = `${tipo}_${randomUUID().replace(/-/g, '')}`
  tokens.set(token, { sujeto, sujetoId, tipo, vence: ahora() + vidaSegundos * 1000, revocado: false })
  return token
}

/**
 * Emite el par acceso + refresco de una sesion nueva.
 * @param {number} sujetoId
 * @param {'staff'|'contacto'} [sujeto]
 * @returns {{access_token: string, expires_in: number, refresh_token: string, refresh_expires_in: number}}
 */
export function emitirSesion (sujetoId, sujeto = 'staff') {
  return {
    access_token: emitir(sujetoId, 'acceso', VIDA_ACCESO, sujeto),
    expires_in: VIDA_ACCESO,
    refresh_token: emitir(sujetoId, 'refresco', VIDA_REFRESCO, sujeto),
    refresh_expires_in: VIDA_REFRESCO
  }
}

/**
 * Emite el token intermedio de 2FA.
 * @param {number} staffId
 * @returns {string}
 */
export function emitirDesafio (staffId) {
  return emitir(staffId, 'desafio', VIDA_DESAFIO)
}

/**
 * Resuelve un token a su staff, distinguiendo expirado de revocado.
 *
 * @param {string|null} token
 * @param {'acceso'|'refresco'|'desafio'} tipoEsperado
 * @returns {object} el staff dueño del token
 * @throws {ErrorApi} 401 si falta, no existe, es de otro tipo, esta revocado o vencio
 */
export function resolver (token, tipoEsperado) {
  return resolverSujeto(token, tipoEsperado, 'staff')
}

/**
 * Resuelve un token a su contacto de cliente.
 *
 * Simetrico de `resolver`: un token de staff no resuelve aca, y viceversa. Igual que en la API real,
 * el filtro esta en la busqueda y no en quien llama.
 *
 * @param {string|null} token
 * @param {'acceso'|'refresco'} tipoEsperado
 * @returns {object} el contacto dueño del token
 * @throws {ErrorApi} 401
 */
export function resolverContacto (token, tipoEsperado) {
  return resolverSujeto(token, tipoEsperado, 'contacto')
}

function resolverSujeto (token, tipoEsperado, sujeto) {
  if (!token) {
    throw new ErrorApi(401, 'unauthenticated', 'Falta el token de acceso.')
  }

  const fila = tokens.get(token)
  // Un token del sujeto equivocado es indistinguible de uno inexistente: es lo que impide que el
  // portal sea una puerta al panel.
  if (!fila || fila.tipo !== tipoEsperado || fila.sujeto !== sujeto) {
    throw new ErrorApi(401, 'unauthenticated', 'Token inválido.')
  }
  if (fila.revocado) {
    throw new ErrorApi(401, 'token_revoked', 'El token fue revocado.')
  }
  if (fila.vence <= ahora()) {
    throw new ErrorApi(401, 'token_expired', 'El token expiró.')
  }

  const catalogo = sujeto === 'contacto' ? CONTACTOS : STAFF
  const persona = catalogo.find((s) => s.id === fila.sujetoId)
  // Baja: el token sigue vivo pero la identidad ya no. Es el caso que el guard real cubre
  // consultando la fila en cada peticion, y por eso el mock tambien lo comprueba acá.
  if (!persona || !persona.active) {
    fila.revocado = true
    throw new ErrorApi(401, 'token_revoked', 'La cuenta está inactiva.')
  }

  return persona
}

/**
 * Canjea un refresco por un par nuevo y revoca el anterior (rotacion).
 *
 * Reusar un refresco ya revocado revoca TODAS las sesiones de ese staff: es la señal de que el token
 * se filtro, y mantener las demas vivas seria dejarle la puerta abierta a quien lo robo.
 *
 * @param {string|null} token
 * @returns {{access_token: string, expires_in: number, refresh_token: string, refresh_expires_in: number}}
 * @throws {ErrorApi} 401
 */
export function rotar (token) {
  const fila = token ? tokens.get(token) : null

  if (fila && fila.tipo === 'refresco' && fila.revocado) {
    revocarTodo(fila.sujetoId, fila.sujeto)
    if (fila.sujeto === 'staff') staffComprometido.add(fila.sujetoId)
    throw new ErrorApi(401, 'token_revoked', 'Refresco reutilizado: se cerraron todas las sesiones.')
  }

  const sujeto = fila?.sujeto ?? 'staff'
  // El par nuevo es del MISMO sujeto que el viejo: un refresco de contacto no vuelve como staff.
  const persona = resolverSujeto(token, 'refresco', sujeto)
  tokens.get(token).revocado = true
  return emitirSesion(persona.id, sujeto)
}

/**
 * Revoca un token puntual.
 * @param {string} token
 */
export function revocar (token) {
  const fila = tokens.get(token)
  if (fila) fila.revocado = true
}

/**
 * Revoca todos los tokens vivos de un sujeto.
 * @param {number} sujetoId
 * @param {'staff'|'contacto'} [sujeto]
 */
export function revocarTodo (sujetoId, sujeto = 'staff') {
  for (const fila of tokens.values()) {
    // El filtro por sujeto no es opcional: sin el, cerrar las sesiones del staff 5 cerraria tambien
    // las del contacto 5.
    if (fila.sujetoId === sujetoId && fila.sujeto === sujeto) fila.revocado = true
  }
}

/**
 * Valida credenciales contra el fixture.
 *
 * Devuelve el mismo error para email inexistente y contraseña incorrecta: distinguirlos le confirma
 * a un atacante qué direcciones existen.
 *
 * @param {string} email
 * @param {string} password
 * @returns {object} el staff
 * @throws {ErrorApi} 401 si las credenciales no sirven, 403 si la cuenta esta inactiva
 */
export function autenticar (email, password) {
  const staff = STAFF.find((s) => s.email === String(email ?? '').toLowerCase())

  if (!staff || staff.password !== password) {
    throw new ErrorApi(401, 'unauthenticated', 'Credenciales inválidas.')
  }
  if (!staff.active) {
    throw new ErrorApi(403, 'forbidden', 'La cuenta está desactivada.')
  }

  return staff
}

/**
 * Valida credenciales de un contacto de cliente contra el fixture.
 *
 * @param {string} email
 * @param {string} password
 * @returns {object} el contacto
 * @throws {ErrorApi} 401 si las credenciales no sirven, 403 si esta desactivado
 */
export function autenticarContacto (email, password) {
  const contacto = CONTACTOS.find((c) => c.email === String(email ?? '').toLowerCase())

  if (!contacto || contacto.password !== password) {
    throw new ErrorApi(401, 'unauthenticated', 'Credenciales inválidas.')
  }
  if (!contacto.active) {
    throw new ErrorApi(403, 'forbidden', 'La cuenta está desactivada.')
  }

  return contacto
}
