/**
 * Pruebas de formateo de fechas.
 *
 * Cubren el corrimiento de un dia: la API manda instantes UTC y fechas sin hora, y tratarlas igual
 * hace que un vencimiento aparezca el dia anterior en cualquier huso al oeste de Greenwich. Es un bug
 * que no se nota en el servidor y si en la pantalla de quien trabaja.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoVencimiento, formatearFecha, formatearRelativo, formatearVencimiento, SIN_VENCIMIENTO } from '../src/lib/fechas.ts'

test('una fecha sin hora no se corre de dia', () => {
  // `new Date('2026-08-24')` daria 23 de agosto en Argentina. El texto tiene que decir 24.
  assert.match(formatearFecha('2026-08-24'), /24/)
})

test('la fecha se muestra compacta, sin los "de" que la parten en dos lineas', () => {
  // "24 de ago. de 2026" en una celda angosta ocupa dos lineas y sube el alto de la fila entera.
  const texto = formatearFecha('2026-08-24')
  assert.doesNotMatch(texto, / de /)
  assert.doesNotMatch(texto, /\./)
  // Espacio duro: en una columna angosta la fecha tiene que desbordar antes que partirse.
  assert.match(texto, /^\d{2}\u00a0\w+\u00a0\d{4}$/)
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

test('un vencimiento ausente se lee "Sin fecha", no como dato que falta', () => {
  // Una tarea puede no tener plazo a proposito. El guion largo la haria pasar por un dato sin cargar.
  assert.equal(formatearVencimiento(null), SIN_VENCIMIENTO)
  assert.equal(formatearVencimiento(undefined), SIN_VENCIMIENTO)
  assert.equal(formatearVencimiento(''), SIN_VENCIMIENTO)
  assert.notEqual(SIN_VENCIMIENTO, '—')
})

test('un vencimiento con fecha se formatea igual que cualquier otra fecha', () => {
  assert.equal(formatearVencimiento('2026-08-24'), formatearFecha('2026-08-24'))
})

test('una tarea sin vencimiento nunca queda clasificada como vencida', () => {
  // El color rojo de la tabla y del tablero sale de aca: sin fecha no hay contra que medir.
  assert.equal(estadoVencimiento(null), 'sin-fecha')
  assert.equal(estadoVencimiento(''), 'sin-fecha')
  assert.equal(estadoVencimiento(undefined), 'sin-fecha')
})
