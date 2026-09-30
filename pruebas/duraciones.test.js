/**
 * Formatos de duracion compartidos.
 *
 * Tres formatos para tres lugares: `HH:MM` en tiempos y timesheet, `H:MM:SS` en los cronometros en
 * vivo y "3 h 25 min" en la ficha publica. Los tres deben tolerar lo que manda un reloj desfasado.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearDuracion, segundosAHoraMinuto, tiempoLegible } from '../src/lib/duraciones.ts'
import { segundosAHoraMinuto as desdeFormatos } from '../src/componentes/proyecto/formatos.ts'
import { formatearDuracion as desdeCronometro } from '../src/componentes/proyecto/cronometro.ts'
import { tiempoLegible as desdeEnlace } from '../src/lib/enlace-publico.ts'

test('segundosAHoraMinuto no convierte las horas en dias', () => {
  assert.equal(segundosAHoraMinuto(30 * 3600 + 5 * 60 + 59), '30:05')
  assert.equal(segundosAHoraMinuto(59), '00:00')
  assert.equal(segundosAHoraMinuto(0), '00:00')
})

test('formatearDuracion no acota las horas y rellena minutos y segundos', () => {
  assert.equal(formatearDuracion(120 * 3600), '120:00:00')
  assert.equal(formatearDuracion(3661.9), '1:01:01')
})

test('tiempoLegible omite la parte que vale cero', () => {
  assert.equal(tiempoLegible(3 * 3600), '3 h')
  assert.equal(tiempoLegible(25 * 60), '25 min')
  assert.equal(tiempoLegible(3 * 3600 + 25 * 60), '3 h 25 min')
})

test('lo negativo o no finito se muestra como cero en los tres formatos', () => {
  for (const valor of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(segundosAHoraMinuto(valor), '00:00')
    assert.equal(formatearDuracion(valor), '0:00:00')
    assert.equal(tiempoLegible(valor), '0 min')
  }
})

test('los modulos de origen reexportan las mismas funciones', () => {
  assert.equal(desdeFormatos, segundosAHoraMinuto)
  assert.equal(desdeCronometro, formatearDuracion)
  assert.equal(desdeEnlace, tiempoLegible)
})
