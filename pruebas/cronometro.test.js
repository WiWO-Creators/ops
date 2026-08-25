/**
 * Pruebas de la aritmetica de cronometros.
 *
 * Cubren lo que se paga: un total que no cuenta el cronometro corriendo deja horas sin facturar, y
 * un formateo que devuelve `NaN` o `-1:-3:-2` convierte un desfasaje de reloj en un dato ilegible.
 *
 * El reloj se inyecta en cada caso: sin eso, la prueba del cronometro abierto cambiaria de resultado
 * en cada ejecucion.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cronometroAbierto,
  formatearDuracion,
  mensajeDeFalloDeCronometro,
  porPersona,
  segundosAcumulados
} from '../src/componentes/proyecto/cronometro.ts'

const AHORA = new Date('2026-08-25T12:00:00Z')

/** Marcaje cerrado, con el total que ya calculo el backend. */
const cerrado = (id, staffId, segundos) => ({
  id,
  task_id: 1,
  staff_id: staffId,
  start_time: '2026-08-25T09:00:00Z',
  end_time: '2026-08-25T10:00:00Z',
  segundos,
  note: null
})

/** Marcaje abierto: el backend manda `segundos` en `null` porque el total todavia no existe. */
const abierto = (id, staffId, inicio) => ({
  id,
  task_id: 1,
  staff_id: staffId,
  start_time: inicio,
  end_time: null,
  segundos: null,
  note: null
})

test('suma los cronometros cerrados', () => {
  const timers = [cerrado(1, 7, 3600), cerrado(2, 7, 1800), cerrado(3, 9, 60)]
  assert.equal(segundosAcumulados(timers, AHORA), 5460)
})

test('un cronometro abierto se cuenta en vivo contra el reloj', () => {
  // Arranco a las 11:30, son las 12:00: media hora corriendo, mas la hora ya cerrada.
  const timers = [cerrado(1, 7, 3600), abierto(2, 7, '2026-08-25T11:30:00Z')]
  assert.equal(segundosAcumulados(timers, AHORA), 5400)
})

test('una lista vacia da cero, no NaN', () => {
  assert.equal(segundosAcumulados([], AHORA), 0)
  assert.equal(porPersona([], AHORA).size, 0)
})

test('un cronometro cerrado sin total se deriva de sus dos puntas', () => {
  // 09:00 a 10:00 son 3600 segundos: la fila se suma igual en vez de descartarse.
  assert.equal(segundosAcumulados([cerrado(1, 7, null)], AHORA), 3600)
})

test('una fecha ilegible cuenta como cero y no rompe el total', () => {
  assert.equal(segundosAcumulados([abierto(1, 7, 'no-es-una-fecha')], AHORA), 0)
})

test('la duracion cero se muestra explicita', () => {
  assert.equal(formatearDuracion(0), '0:00:00')
})

test('una duracion negativa no imprime signos ni NaN', () => {
  // Pasa con el reloj del navegador atrasado respecto del servidor.
  assert.equal(formatearDuracion(-3782), '0:00:00')
  assert.equal(formatearDuracion(Number.NaN), '0:00:00')
})

test('la duracion se formatea como H:MM:SS y no recorta las horas', () => {
  assert.equal(formatearDuracion(3782), '1:03:02')
  assert.equal(formatearDuracion(59), '0:00:59')
  // 120 horas no son 00:00:00: las horas no llevan modulo.
  assert.equal(formatearDuracion(432000), '120:00:00')
})

test('agrupa el total por persona, contando tambien el abierto', () => {
  const timers = [
    cerrado(1, 7, 3600),
    cerrado(2, 9, 600),
    abierto(3, 9, '2026-08-25T11:45:00Z')
  ]
  const totales = porPersona(timers, AHORA)

  assert.equal(totales.get(7), 3600)
  assert.equal(totales.get(9), 600 + 900)
  assert.equal(totales.size, 2)
})

test('el cronometro abierto es el de esa persona, no el de cualquiera', () => {
  const mio = abierto(3, 7, '2026-08-25T11:45:00Z')
  const timers = [cerrado(1, 7, 3600), abierto(2, 9, '2026-08-25T11:00:00Z'), mio]

  assert.equal(cronometroAbierto(timers, 7)?.id, mio.id)
  assert.equal(cronometroAbierto(timers, 11), null)
  // Sin saber quien mira no se puede afirmar que haya uno propio.
  assert.equal(cronometroAbierto(timers, null), null)
})

test('los fallos del backend se traducen a frases, no a codigos', () => {
  assert.match(mensajeDeFalloDeCronometro(403, true), /asignad/i)
  assert.match(mensajeDeFalloDeCronometro(403, false), /propio/i)
  assert.match(mensajeDeFalloDeCronometro(409, true), /facturada/i)
  assert.ok(mensajeDeFalloDeCronometro(500, true).length > 0)
})
