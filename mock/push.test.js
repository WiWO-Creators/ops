/**
 * El mock de Web Push tiene que validar y podar igual que `modules/api/Push/` del board: si acepta
 * de mas, la pantalla pasa en local y se cae en produccion.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
import { avisosRuta, endpointPermitido, reiniciarPush, validarSuscripcion } from './avisos.js'

const punto = (() => { const c = createECDH('prime256v1'); c.generateKeys(); return c.getPublicKey().toString('base64url') })()
const valida = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: punto, auth: randomBytes(16).toString('base64url') }, expirationTime: null }
const ana = { id: 7 }
const beto = { id: 8 }
const pedir = (metodo, resto, actual, cuerpo = {}, parametros = new URLSearchParams()) =>
  avisosRuta(metodo, resto, parametros, actual, async () => cuerpo)

beforeEach(() => {
  reiniciarPush()
  delete process.env.MOCK_PUSH_ENCENDIDO
  delete process.env.MOCK_PUSH_SIN_CLAVES
})

test('valida la suscripcion con los mismos codigos que la API', () => {
  const casos = [
    [{ ...valida, endpoint: 'http://fcm.googleapis.com/x' }, 'endpoint', 'push_service'],
    [{ ...valida, endpoint: '' }, 'endpoint', 'required'],
    [{ ...valida, endpoint: 'https://fcm.googleapis.com/' + 'a'.repeat(1100) }, 'endpoint', 'max:1024'],
    [{ ...valida, endpoint: 'https://fcm.googleapis.com.evil.com/x' }, 'endpoint', 'push_service'],
    [{ ...valida, keys: { ...valida.keys, p256dh: '' } }, 'keys.p256dh', 'p256'],
    [{ ...valida, keys: { ...valida.keys, auth: 'A'.repeat(100) } }, 'keys.auth', 'auth'],
    [{ ...valida, staffid: 3 }, 'staffid', 'no_editable']
  ]

  for (const [cuerpo, campo, codigo] of casos) {
    assert.throws(() => validarSuscripcion(cuerpo), (error) => error.estado === 422 && error.detalles[campo]?.[0] === codigo, campo)
  }

  assert.equal(endpointPermitido('https://web.push.apple.com/abc'), true)
  assert.equal(endpointPermitido('https://fcm.googleapis.com:8443/abc'), false)
})

test('estado, alta, prueba apagada y baja, con la forma de la API', async () => {
  const estado = await pedir('GET', ['push'], ana)
  assert.deepEqual(Object.keys(estado.cuerpo.data), ['configured', 'enabled', 'public_key', 'subscriptions'])
  assert.equal(estado.cuerpo.data.enabled, false, 'nace apagado, como en la instalacion')

  const alta = await pedir('POST', ['push', 'subscriptions'], ana, valida)
  assert.equal(alta.estado, 201)
  assert.equal(alta.cuerpo.data.subscriptions, 1)

  const prueba = await pedir('POST', ['push', 'test'], ana)
  assert.deepEqual(prueba.cuerpo.data, { enabled: false, configured: true, attempted: 0, delivered: 0, removed: 0, failed: 0, skipped: 0 })

  process.env.MOCK_PUSH_ENCENDIDO = '1'
  assert.equal((await pedir('POST', ['push', 'test'], ana)).cuerpo.data.delivered, 1)

  assert.equal((await pedir('DELETE', ['push', 'subscriptions'], beto, { endpoint: valida.endpoint })).cuerpo.data.subscriptions, 0)
  assert.equal((await pedir('GET', ['push'], ana)).cuerpo.data.subscriptions, 1, 'nadie borra el dispositivo de otro')
  assert.equal((await pedir('DELETE', ['push', 'subscriptions'], ana, { endpoint: valida.endpoint })).cuerpo.data.subscriptions, 0)
  assert.equal((await pedir('DELETE', ['push', 'subscriptions'], ana, { endpoint: valida.endpoint })).cuerpo.data.subscriptions, 0, 'idempotente')
})

test('sin claves no hay clave publica', async () => {
  process.env.MOCK_PUSH_SIN_CLAVES = '1'
  const estado = await pedir('GET', ['push'], ana)

  assert.equal(estado.cuerpo.data.public_key, null)
  assert.equal(estado.cuerpo.data.configured, false)
})

test('la campana del mock filtra sin leer y respeta per_page', async () => {
  const sinLeer = await pedir('GET', [], ana, {}, new URLSearchParams('per_page=1&filter[unread]=1'))
  assert.equal(sinLeer.cuerpo.data.length, 1)
  assert.equal(sinLeer.cuerpo.data[0].read, false)

  assert.deepEqual((await pedir('GET', ['count'], ana)).cuerpo.data, { total: 2, unread: 1 })
  await assert.rejects(pedir('GET', ['push', 'otra'], ana), (error) => error.estado === 404)
})
