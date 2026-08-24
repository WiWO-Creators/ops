/**
 * Pruebas de sesion. Cubren la rotacion de refrescos y la deteccion de reuso, que es la parte donde
 * un error no se nota hasta que alguien robo un token.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as sesion from './sesion.js'
import { ErrorApi } from './consulta.js'

beforeEach(() => sesion.reiniciar())

test('login valido devuelve el staff', () => {
  assert.equal(sesion.autenticar('ana@wiwo.me', 'mock1234').is_admin, true)
})

test('email inexistente y clave incorrecta dan el mismo error', () => {
  const aError = (fn) => { try { fn() } catch (e) { return e } }
  const noExiste = aError(() => sesion.autenticar('nadie@wiwo.me', 'mock1234'))
  const claveMala = aError(() => sesion.autenticar('ana@wiwo.me', 'incorrecta'))

  assert.equal(noExiste.estado, 401)
  assert.equal(noExiste.codigo, claveMala.codigo)
  assert.equal(noExiste.message, claveMala.message)
})

test('una cuenta inactiva da 403, no 401', () => {
  assert.throws(
    () => sesion.autenticar('hugo@wiwo.me', 'mock1234'),
    (error) => error instanceof ErrorApi && error.estado === 403
  )
})

test('un token de acceso recien emitido resuelve al staff', () => {
  const { access_token: acceso } = sesion.emitirSesion(1)
  assert.equal(sesion.resolver(acceso, 'acceso').id, 1)
})

test('un token de refresco no sirve como token de acceso', () => {
  const { refresh_token: refresco } = sesion.emitirSesion(1)
  assert.throws(() => sesion.resolver(refresco, 'acceso'), (error) => error.estado === 401)
})

test('sin token el error es unauthenticated', () => {
  assert.throws(() => sesion.resolver(null, 'acceso'), (error) => error.codigo === 'unauthenticated')
})

test('un token revocado se distingue de uno expirado', () => {
  const { access_token: acceso } = sesion.emitirSesion(1)
  sesion.revocar(acceso)
  assert.throws(() => sesion.resolver(acceso, 'acceso'), (error) => error.codigo === 'token_revoked')
})

test('un token vencido devuelve token_expired', () => {
  let reloj = 1_000_000
  sesion.usarReloj(() => reloj)
  const { access_token: acceso } = sesion.emitirSesion(1)
  reloj += (sesion.VIDA_ACCESO + 1) * 1000
  assert.throws(() => sesion.resolver(acceso, 'acceso'), (error) => error.codigo === 'token_expired')
})

test('refrescar rota el par y revoca el refresco anterior', () => {
  const primera = sesion.emitirSesion(1)
  const segunda = sesion.rotar(primera.refresh_token)

  assert.notEqual(segunda.refresh_token, primera.refresh_token)
  assert.equal(sesion.resolver(segunda.access_token, 'acceso').id, 1)
  assert.throws(() => sesion.resolver(primera.refresh_token, 'refresco'), (error) => error.estado === 401)
})

test('reusar un refresco revocado cierra TODAS las sesiones del staff', () => {
  const primera = sesion.emitirSesion(1)
  const otraSesion = sesion.emitirSesion(1)
  sesion.rotar(primera.refresh_token)

  assert.throws(() => sesion.rotar(primera.refresh_token), (error) => error.codigo === 'token_revoked')
  // La sesion paralela, que nadie toco, tambien cae: es el punto de la deteccion de robo.
  assert.throws(() => sesion.resolver(otraSesion.access_token, 'acceso'), (error) => error.codigo === 'token_revoked')
})

test('un token de otro staff no se ve afectado por la revocacion en masa', () => {
  const ajena = sesion.emitirSesion(3)
  const propia = sesion.emitirSesion(1)
  sesion.rotar(propia.refresh_token)
  try { sesion.rotar(propia.refresh_token) } catch { /* esperado: dispara la revocacion en masa */ }

  assert.equal(sesion.resolver(ajena.access_token, 'acceso').id, 3)
})
