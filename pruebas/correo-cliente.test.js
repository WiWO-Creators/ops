/**
 * Pruebas del motor de correo al cliente.
 *
 * Lo importante no es que lea el modo, sino que la pantalla nunca diga que algo se mandó: hoy no hay
 * consumidor que vacíe la cola, así que ni siquiera `real` envía, y el aviso tiene que decirlo en los
 * tres modos.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AJUSTE_MODO_CORREO_CLIENTE, avisoDelMotor, esModoCorreoCliente, esResumenColaCliente,
  modoGuardado, modosDisponibles
} from '../src/dominio/correo-cliente.ts'
import { detallesDeAjustesLegibles } from '../src/dominio/ajustes.ts'

/** Los ajustes tal como los publica `GET /settings` con la opción presente. */
function ajustesCon (valor, opciones = ['apagado', 'prueba', 'real'], tipo = 'enum') {
  return {
    editable: { [AJUSTE_MODO_CORREO_CLIENTE]: { group: 'correo', type: tipo, value: valor, options: opciones } },
    readonly: {}
  }
}

test('reconoce los tres modos y nada más', () => {
  for (const modo of ['apagado', 'prueba', 'real']) assert.equal(esModoCorreoCliente(modo), true, modo)
  for (const valor of ['', 'REAL', 'encendido', null, undefined, 1, true]) {
    assert.equal(esModoCorreoCliente(valor), false, String(valor))
  }
})

test('lee el modo guardado', () => {
  assert.equal(modoGuardado(ajustesCon('apagado')), 'apagado')
  assert.equal(modoGuardado(ajustesCon('real')), 'real')
})

test('sin la opción publicada, o con basura adentro, no hay modo', () => {
  assert.equal(modoGuardado({ editable: {}, readonly: {} }), null, 'la API todavía no la expone')
  assert.equal(modoGuardado(ajustesCon(null)), null, 'sin fila en tbloptions')
  assert.equal(modoGuardado(ajustesCon('prueba_larga')), null, 'un valor escrito a mano')
  assert.equal(modoGuardado(ajustesCon('apagado', [], 'texto')), null, 'el backend le cambió el tipo')
})

test('solo ofrece los modos que la API publica, en orden de riesgo creciente', () => {
  assert.deepEqual(modosDisponibles(ajustesCon('apagado')), ['apagado', 'prueba', 'real'])
  assert.deepEqual(modosDisponibles(ajustesCon('apagado', ['real', 'apagado'])), ['apagado', 'real'])
  assert.deepEqual(modosDisponibles(ajustesCon('apagado', ['apagado', 'lote'])), ['apagado'], 'un modo que no sabe explicar')
  assert.deepEqual(modosDisponibles({ editable: {}, readonly: {} }), [])
})

test('distingue el resumen de cada cola: los estados no se llaman igual', () => {
  assert.equal(esResumenColaCliente({ total: 1, pendiente: 1, enviado: 0, error: 0, mode: 'apagado', engine_enabled: false }), true)
  assert.equal(esResumenColaCliente({ total: 855, pending: 3, sending: 0, sent: 850, failed: 2 }), false)
})

test('el aviso nunca promete un envío, ni siquiera con el motor en real', () => {
  for (const [modo, encendido] of [['apagado', false], ['prueba', true], ['real', true]]) {
    const { titulo, detalle } = avisoDelMotor({
      total: 4, pendiente: 4, enviado: 0, error: 0, mode: modo, engine_enabled: encendido
    })

    assert.match(detalle, /Ningún correo sale de esta cola/, modo)
    assert.match(detalle, /4 filas pendientes/, modo)
    assert.equal(titulo.includes('apagado'), !encendido, modo)
    if (encendido) assert.match(titulo, /no envía/, modo)
  }
})

test('el aviso cuenta una sola fila en singular', () => {
  const { detalle } = avisoDelMotor({ total: 1, pendiente: 1, enviado: 0, error: 0, mode: 'apagado', engine_enabled: false })

  assert.match(detalle, /Hay 1 fila pendiente y va a seguir ahí\./)
})

test('la cola vacía no inventa un número', () => {
  const { detalle } = avisoDelMotor({ total: 0, pendiente: 0, enviado: 0, error: 0, mode: 'apagado', engine_enabled: false })

  assert.match(detalle, /Hay 0 filas pendientes/)
})

test('el detalle del 422 nombra la clave rechazada y su motivo', () => {
  assert.deepEqual(
    detallesDeAjustesLegibles(
      { [AJUSTE_MODO_CORREO_CLIENTE]: ['invalid'] },
      { [AJUSTE_MODO_CORREO_CLIENTE]: 'Modo del correo al cliente' }
    ),
    ['Modo del correo al cliente: el valor no pasó la validación del backend']
  )
})

test('una clave o un motivo desconocidos se muestran crudos', () => {
  assert.deepEqual(
    detallesDeAjustesLegibles({ wiwo_otra_cosa: ['no_editable', 'raro'] }, {}),
    ['wiwo_otra_cosa: la API no acepta escribir esta opción, raro']
  )
})
