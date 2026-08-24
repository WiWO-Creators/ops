/**
 * Pruebas de formateo de fechas.
 *
 * Cubren el corrimiento de un dia: la API manda instantes UTC y fechas sin hora, y tratarlas igual
 * hace que un vencimiento aparezca el dia anterior en cualquier huso al oeste de Greenwich. Es un bug
 * que no se nota en el servidor y si en la pantalla de quien trabaja.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoVencimiento, formatearFecha, formatearRelativo } from '../src/lib/fechas.ts'

test('una fecha sin hora no se corre de dia', () => {
  // `new Date('2026-08-24')` daria 23 de agosto en Argentina. El texto tiene que decir 24.
  assert.match(formatearFecha('2026-08-24'), /24/)
})

test('un valor ausente da el guion largo, no "Invalid Date"', () => {
  assert.equal(formatearFecha(null), '—')
  assert.equal(formatearFecha(undefined), '—')
  assert.equal(formatearFecha(''), '—')
})

test('una fecha con basura no rompe la pantalla', () => {
  assert.equal(formatearFecha('no-es-una-fecha'), '—')
  assert.equal(formatearRelativo('no-es-una-fecha'), '—')
})

test('un instante ISO se formatea con la hora cuando se pide', () => {
  const sinHora = formatearFecha('2026-08-24T14:03:00Z')
  const conHora = formatearFecha('2026-08-24T14:03:00Z', true)
  assert.ok(conHora.length > sinHora.length)
  assert.match(conHora, /\d{2}:\d{2}/)
})

test('el relativo mira hacia atras y hacia adelante', () => {
  const ahora = new Date('2026-08-24T12:00:00Z')
  assert.match(formatearRelativo('2026-08-21T12:00:00Z', ahora), /3/)
  assert.match(formatearRelativo('2026-09-07T12:00:00Z', ahora), /2/)
})

test('el vencimiento se compara por dia, no por instante', () => {
  // Las 18:00 de un dia cuya tarea vencia a las 09:00 no es "vencido": sigue siendo hoy.
  const tarde = new Date('2026-08-24T18:00:00')
  assert.equal(estadoVencimiento('2026-08-24', tarde), 'hoy')
})

test('clasifica vencido, proximo y lejano', () => {
  const hoy = new Date('2026-08-24T09:00:00')
  assert.equal(estadoVencimiento('2026-08-23', hoy), 'vencido')
  assert.equal(estadoVencimiento('2026-08-26', hoy), 'proximo')
  assert.equal(estadoVencimiento('2026-09-30', hoy), 'lejano')
  assert.equal(estadoVencimiento(null, hoy), 'sin-fecha')
})

test('un instante no se clasifica como vencimiento', () => {
  // Solo las fechas sin hora son plazos. Un instante no es un vencimiento y no debe colorearse.
  assert.equal(estadoVencimiento('2026-08-24T14:03:00Z'), 'sin-fecha')
})
