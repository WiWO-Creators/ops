/**
 * Sesiones del mock: emision, validacion y rotacion de tokens en memoria.
 *
 * Replica el comportamiento observable de `modules/api/Auth/TokenGuard.php` segun el contrato — no su
 * implementacion. Acá los tokens viven en un `Map` y se pierden al reiniciar el proceso, que es
 * exactamente lo que se quiere de un mock.
 */

import { randomUUID } from 'node:crypto'
import { ErrorApi } from './consulta.js'
import { STAFF } from './datos.js'

export const VIDA_ACCESO = 3600
export const VIDA_REFRESCO = 2592000
export const VIDA_DESAFIO = 300

/** @type {Map<string, {staffId: number, tipo: 'acceso'|'refresco'|'desafio', vence: number, revocado: boolean}>} */
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
 * @param {number} staffId
 * @param {'acceso'|'refresco'|'desafio'} tipo
 * @param {number} vidaSegundos
 * @returns {string}
 */
function emitir (staffId, tipo, vidaSegundos) {
  const token = `${tipo}_${randomUUID().replace(/-/g, '')}`
  tokens.set(token, { staffId, tipo, vence: ahora() + vidaSegundos * 1000, revocado: false })
  return token
}

/**
 * Emite el par acceso + refresco de una sesion nueva.
 * @param {number} staffId
 * @returns {{access_token: string, expires_in: number, refresh_token: string, refresh_expires_in: number}}
 */
export function emitirSesion (staffId) {
  return {
    access_token: emitir(staffId, 'acceso', VIDA_ACCESO),
    expires_in: VIDA_ACCESO,
    refresh_token: emitir(staffId, 'refresco', VIDA_REFRESCO),
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
  if (!token) {
    throw new ErrorApi(401, 'unauthenticated', 'Falta el token de acceso.')
  }

  const fila = tokens.get(token)
  if (!fila || fila.tipo !== tipoEsperado) {
    throw new ErrorApi(401, 'unauthenticated', 'Token inválido.')
  }
  if (fila.revocado) {
    throw new ErrorApi(401, 'token_revoked', 'El token fue revocado.')
  }
  if (fila.vence <= ahora()) {
    throw new ErrorApi(401, 'token_expired', 'El token expiró.')
  }

  const staff = STAFF.find((s) => s.id === fila.staffId)
  // Baja de empleado: el token sigue vivo pero la identidad ya no. Es el caso que el guard real
  // cubre consultando el staff en cada peticion, y por eso el mock tambien lo comprueba acá.
  if (!staff || !staff.active) {
    fila.revocado = true
    throw new ErrorApi(401, 'token_revoked', 'La cuenta está inactiva.')
  }

  return staff
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
    revocarTodo(fila.staffId)
    staffComprometido.add(fila.staffId)
    throw new ErrorApi(401, 'token_revoked', 'Refresco reutilizado: se cerraron todas las sesiones.')
  }

  const staff = resolver(token, 'refresco')
  tokens.get(token).revocado = true
  return emitirSesion(staff.id)
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
 * Revoca todos los tokens de un staff.
 * @param {number} staffId
 */
export function revocarTodo (staffId) {
  for (const fila of tokens.values()) {
    if (fila.staffId === staffId) fila.revocado = true
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
