/**
 * Pruebas de la comparacion entre lo estimado y lo registrado en una Tarea.
 *
 * Cubren el caso que se ve todos los dias y que es facil informar mal: hay miles de tareas con
 * estimacion y unos cientos de marcajes, asi que lo normal es "estimado sin registro". Si eso se
 * calculara como un desvio, cada tarea sin cronometro diria que va sobrada por el total estimado.
 *
 * El resto es aritmetica de coma flotante: las horas registradas salen de dividir segundos, y sin
 * tolerancia una tarea que anoto exactamente lo estimado se pintaria como excedida por un residuo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararTiempo } from '../src/dominio/tiempo-estimado.ts'

test('sin estimacion no hay nada que comparar, aunque haya tiempo registrado', () => {
  assert.deepEqual(compararTiempo(null, 7200), { estado: 'sin_estimacion' })
  assert.deepEqual(compararTiempo(undefined, 0), { estado: 'sin_estimacion' })
  assert.deepEqual(compararTiempo(Number.NaN, 7200), { estado: 'sin_estimacion' })
})

test('estimado sin registro no es un desvio: es una medicion que no se hizo', () => {
  assert.deepEqual(compararTiempo(8, 0), { estado: 'sin_registro', estimadas: 8 })
})

test('un total de segundos invalido o negativo cuenta como sin registro, no como resta', () => {
  assert.deepEqual(compararTiempo(8, -50), { estado: 'sin_registro', estimadas: 8 })
  assert.deepEqual(compararTiempo(8, Number.NaN), { estado: 'sin_registro', estimadas: 8 })
})

test('cero horas estimadas es una estimacion, no la ausencia de una', () => {
  assert.deepEqual(compararTiempo(0, 3600), {
    estado: 'excedido',
    estimadas: 0,
    registradas: 1,
    desvio: 1
  })
})

test('pasarse deja el desvio positivo', () => {
  const comparacion = compararTiempo(2, 9000)

  assert.equal(comparacion.estado, 'excedido')
  assert.equal(comparacion.registradas, 2.5)
  assert.equal(comparacion.desvio, 0.5)
})

test('quedarse corto deja el desvio negativo', () => {
  const comparacion = compararTiempo(4, 3600)

  assert.equal(comparacion.estado, 'por_debajo')
  assert.equal(comparacion.desvio, -3)
})

test('el residuo de dividir segundos no convierte lo justo en excedido', () => {
  // 0.1 h = 360 s exactos; el problema es el 0.1 del lado estimado, que no es representable.
  const comparacion = compararTiempo(0.1 + 0.2, 1080)

  assert.equal(comparacion.estado, 'en_estimacion')
  assert.equal(comparacion.desvio, 0)
})
