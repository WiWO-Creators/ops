/**
 * Pruebas del sobre de sesion.
 *
 * La cookie guarda los dos tokens de la API. Lo que se prueba no es que el cifrado funcione —eso lo
 * garantiza Node— sino que una cookie manipulada, truncada o cifrada con otra clave devuelva "no hay
 * sesion" en vez de datos plausibles: ahi es donde un error se convierte en un agujero.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { abrir, mismoToken, porVencer, sellar } from '../src/datos/sobre-sesion.ts'

const CLAVE = randomBytes(32)
const SESION = { acceso: 'acc-123', refresco: 'ref-456', venceEn: 2_000_000_000, staffId: 7 }

test('lo sellado se abre igual', () => {
  assert.deepEqual(abrir(sellar(SESION, CLAVE), CLAVE), SESION)
})

test('dos sellados de lo mismo son distintos: el IV es nuevo cada vez', () => {
  assert.notEqual(sellar(SESION, CLAVE), sellar(SESION, CLAVE))
})

test('una cookie ausente o vacia no es sesion', () => {
  assert.equal(abrir(undefined, CLAVE), null)
  assert.equal(abrir('', CLAVE), null)
})

test('otra clave no abre la cookie', () => {
  assert.equal(abrir(sellar(SESION, CLAVE), randomBytes(32)), null)
})

test('una cookie manipulada no abre: GCM autentica', () => {
  const sellada = Buffer.from(sellar(SESION, CLAVE), 'base64url')
  sellada[sellada.length - 1] ^= 0xff

  assert.equal(abrir(sellada.toString('base64url'), CLAVE), null)
})

test('una cookie truncada no abre', () => {
  const sellada = sellar(SESION, CLAVE)

  assert.equal(abrir(sellada.slice(0, 10), CLAVE), null)
})

test('basura que no es base64url tampoco lanza', () => {
  assert.equal(abrir('no-soy-una-cookie!!!', CLAVE), null)
})

test('una sesion con forma vieja se descarta en vez de usarse a medias', () => {
  const incompleta = sellar({ acceso: 'a', venceEn: 1 }, CLAVE)

  assert.equal(abrir(incompleta, CLAVE), null)
})

test('porVencer respeta el margen', () => {
  const ahora = 1_000_000_000_000 // epoch ms
  const enUnMinuto = { ...SESION, venceEn: 1_000_000_060 }

  assert.equal(porVencer(enUnMinuto, 30, ahora), false)
  assert.equal(porVencer(enUnMinuto, 60, ahora), true)
  assert.equal(porVencer(enUnMinuto, 90, ahora), true)
})

test('mismoToken compara sin romperse con largos distintos', () => {
  assert.equal(mismoToken('abc', 'abc'), true)
  assert.equal(mismoToken('abc', 'abd'), false)
  assert.equal(mismoToken('abc', 'abcd'), false)
  assert.equal(mismoToken('', ''), true)
})
