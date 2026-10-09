import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diaLocal, esClaveDeModo, estadoDelModo, leerModoVigente, MODOS, SIN_MODO
} from '../src/dominio/modos-especiales.ts'
import { CLAVE_MODO_APAGADO, SCRIPT_TEMA_INICIAL } from '../src/lib/tema.ts'

test('solo son modos las claves del catalogo', () => {
  assert.equal(esClaveDeModo('halloween'), true)
  assert.equal(esClaveDeModo(SIN_MODO), false)
  assert.equal(esClaveDeModo('toString'), false)
  assert.equal(esClaveDeModo(null), false)
})

test('leerModoVigente acepta lo que contesta la API y descarta lo raro', () => {
  const bueno = { clave: 'halloween', desde: '2026-10-25', hasta: '2026-11-01' }

  assert.deepEqual(leerModoVigente(bueno), bueno)
  assert.equal(leerModoVigente(null), null)
  assert.equal(leerModoVigente({ ...bueno, clave: 'navidad' }), null)
  assert.equal(leerModoVigente({ ...bueno, hasta: '01/11/2026' }), null)
  assert.equal(leerModoVigente({ clave: 'halloween' }), null)
})

test('estadoDelModo cubre apagado, programado, vigente y vencido, con bordes inclusivos', () => {
  const e = (modo, desde, hasta, hoy) => estadoDelModo(modo, desde, hasta, hoy)

  assert.equal(e(SIN_MODO, '2026-10-25', '2026-11-01', '2026-10-30'), 'apagado')
  assert.equal(e('halloween', '', '2026-11-01', '2026-10-30'), 'apagado')
  assert.equal(e('halloween', '2026-10-25', '2026-11-01', '2026-10-24'), 'programado')
  assert.equal(e('halloween', '2026-10-25', '2026-11-01', '2026-10-25'), 'vigente')
  assert.equal(e('halloween', '2026-10-25', '2026-11-01', '2026-11-01'), 'vigente')
  assert.equal(e('halloween', '2026-10-25', '2026-11-01', '2026-11-02'), 'vencido')
})

test('diaLocal da YYYY-MM-DD con ceros', () => {
  assert.equal(diaLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

test('el color de la barra de cada modo es un hexadecimal en claro y en oscuro', () => {
  for (const { colorBarra } of Object.values(MODOS)) {
    assert.match(colorBarra.claro, /^#[0-9A-F]{6}$/i)
    assert.match(colorBarra.oscuro, /^#[0-9A-F]{6}$/i)
  }
})

test('el script anti-destello apaga el modo guardado antes de pintar', () => {
  assert.ok(SCRIPT_TEMA_INICIAL.includes(CLAVE_MODO_APAGADO))
  assert.ok(SCRIPT_TEMA_INICIAL.includes("removeAttribute('data-modo')"))
})
