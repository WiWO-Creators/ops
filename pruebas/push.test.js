/**
 * Pruebas de la logica de las notificaciones push del dispositivo (`src/dominio/push.ts`).
 *
 * Lo que se fija es el orden de los estados —iOS antes que "no soportado", "bloqueado" antes que
 * "activo"— y la frase del caso apagado: son los dos lugares donde un error hace que la pantalla le
 * diga a alguien algo falso sobre su telefono.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createECDH } from 'node:crypto'
import {
  bytesDeClave,
  cuerpoDeSuscripcion,
  esDispositivoIOS,
  estadoDelDispositivo,
  mensajeDePrueba
} from '../src/dominio/push.ts'

const base = { soportado: true, esIOS: false, instalada: false, permiso: 'default', suscripto: false, clavePublica: 'B' + 'A'.repeat(86) }

test('estadoDelDispositivo recorre los seis estados en su orden', () => {
  assert.equal(estadoDelDispositivo(base), 'inactivo')
  assert.equal(estadoDelDispositivo({ ...base, suscripto: true, permiso: 'granted' }), 'activo')
  assert.equal(estadoDelDispositivo({ ...base, soportado: false }), 'no-soportado')
  assert.equal(estadoDelDispositivo({ ...base, clavePublica: null }), 'no-disponible')
  assert.equal(estadoDelDispositivo({ ...base, clavePublica: '' }), 'no-disponible')
  assert.equal(estadoDelDispositivo({ ...base, permiso: 'denied' }), 'bloqueado')
})

test('iPhone fuera de la app instalada pide instalar, aunque Safari no exponga PushManager', () => {
  assert.equal(estadoDelDispositivo({ ...base, esIOS: true, soportado: false }), 'requiere-instalar')
  assert.equal(estadoDelDispositivo({ ...base, esIOS: true, instalada: true }), 'inactivo')
})

test('el permiso negado gana a una suscripcion vieja', () => {
  assert.equal(estadoDelDispositivo({ ...base, permiso: 'denied', suscripto: true }), 'bloqueado')
})

test('una suscripcion existente se muestra activa aunque el servidor pierda las claves', () => {
  assert.equal(estadoDelDispositivo({ ...base, suscripto: true, clavePublica: null }), 'activo')
})

test('esDispositivoIOS reconoce el iPad que se presenta como Mac', () => {
  assert.equal(esDispositivoIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', 5), true)
  assert.equal(esDispositivoIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), true)
  assert.equal(esDispositivoIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), false)
  assert.equal(esDispositivoIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5), false)
})

test('bytesDeClave devuelve los 65 bytes de una clave P-256 real', () => {
  const curva = createECDH('prime256v1')
  curva.generateKeys()
  const esperada = curva.getPublicKey()
  const bytes = bytesDeClave(esperada.toString('base64url'))

  assert.equal(bytes.length, 65)
  assert.equal(bytes.buffer.byteLength, 65, 'el buffer no tiene bytes de mas')
  assert.deepEqual(Buffer.from(bytes), esperada)
  assert.deepEqual(Buffer.from(bytesDeClave(esperada.toString('base64url') + '=')), esperada, 'acepta relleno')
})

test('bytesDeClave rechaza lo que no es una clave publica P-256', () => {
  assert.throws(() => bytesDeClave('no es base64!'))
  assert.throws(() => bytesDeClave(Buffer.alloc(32, 1).toString('base64url')))
  assert.throws(() => bytesDeClave(Buffer.concat([Buffer.from([2]), Buffer.alloc(64, 1)]).toString('base64url')))
})

test('cuerpoDeSuscripcion manda solo endpoint, claves y navegador', () => {
  const cuerpo = cuerpoDeSuscripcion(
    { endpoint: 'https://fcm.googleapis.com/fcm/send/x', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } },
    'x'.repeat(400)
  )

  assert.deepEqual(Object.keys(cuerpo), ['endpoint', 'keys', 'user_agent'])
  assert.equal(cuerpo.user_agent.length, 255)
  assert.equal(cuerpoDeSuscripcion({ endpoint: '', keys: { p256dh: 'P', auth: 'A' } }, ''), null)
  assert.equal(cuerpoDeSuscripcion({ endpoint: 'https://x', keys: { p256dh: 'P' } }, ''), null)
  assert.equal(cuerpoDeSuscripcion({}, ''), null)
})

test('mensajeDePrueba dice que el envio esta en pausa cuando el interruptor esta apagado', () => {
  const apagado = mensajeDePrueba({ enabled: false, configured: true, attempted: 0, delivered: 0, removed: 0, failed: 0, skipped: 0 })

  assert.equal(apagado.tono, 'aviso')
  assert.match(apagado.texto, /en pausa/)
})

test('mensajeDePrueba cubre entrega, sin dispositivos, fallo y sin claves', () => {
  const cero = { enabled: true, configured: true, attempted: 0, delivered: 0, removed: 0, failed: 0, skipped: 0 }

  assert.equal(mensajeDePrueba({ ...cero, attempted: 1, delivered: 1 }).tono, 'exito')
  assert.match(mensajeDePrueba({ ...cero, attempted: 2, delivered: 2 }).texto, /2 dispositivos/)
  assert.match(mensajeDePrueba(cero).texto, /No hay dispositivos/)
  assert.equal(mensajeDePrueba({ ...cero, attempted: 1, failed: 1 }).tono, 'peligro')
  assert.match(mensajeDePrueba({ ...cero, configured: false, enabled: false }).texto, /claves/)
})

test('ningun texto del bloque usa guiones largos', async () => {
  const { readFile } = await import('node:fs/promises')
  const fuentes = await Promise.all([
    readFile(new URL('../src/dominio/push.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/componentes/push/NotificacionesDelDispositivo.tsx', import.meta.url), 'utf8')
  ])
  const visibles = fuentes.flatMap((fuente) => fuente.match(/'[^'\n]*'|`[^`\n]*`|>[^<{}\n]+</g) ?? [])

  assert.deepEqual(visibles.filter((texto) => /[—–]/.test(texto)), [])
})
