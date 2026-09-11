/**
 * Pruebas de la compuerta de entrada: cuando se exige abrir la jornada y cuando no.
 *
 * Es la unica logica de la pieza que no es JSX, y es la que puede encerrar a alguien. Un `true` de
 * mas frente a un estado que no se pudo leer deja a toda la empresa mirando un velo el dia que la
 * API se caiga; un `false` de mas convierte el bloqueo en el aviso que ya habia y que nadie miraba.
 *
 * El mensaje del 422 va aparte porque la causa cambio: antes era "falta el Espacio" y ahora es "esa
 * Tarea no es de ese Proyecto", que es el unico 422 que esta interfaz puede provocar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faltaAbrirJornada, mensajeDeFalloDeJornada } from '../src/dominio/live.ts'

/** Un `GET /me/jornada` minimo: solo lo que la compuerta mira. */
const estado = (abierta) => ({
  open: abierta ? { id: 1, started_at: '2026-09-11T09:00:00Z', seconds: 3600 } : null,
  seconds: 3600,
  measured_seconds: 0,
  uncovered_seconds: 3600,
  over_journey: false,
  timer: null
})

test('sin jornada abierta se exige abrirla', () => {
  assert.equal(faltaAbrirJornada(estado(false)), true)
})

test('con la jornada abierta no se bloquea nada', () => {
  assert.equal(faltaAbrirJornada(estado(true)), false)
})

test('un estado que no se pudo leer no bloquea: adivinar encerraria a quien ya la tiene abierta', () => {
  assert.equal(faltaAbrirJornada(null), false)
})

test('el 422 al abrir nombra el par incoherente, que es el unico que esta pantalla puede mandar', () => {
  const mensaje = mensajeDeFalloDeJornada(422, true)

  assert.match(mensaje, /Tarea/)
  assert.match(mensaje, /Proyecto/)
})

test('el 409 al abrir sigue diciendo que ya hay una, y no habla de Tareas', () => {
  assert.equal(mensajeDeFalloDeJornada(409, true), 'Ya tienes una jornada abierta.')
})

test('al cerrar no aparecen los textos del destino: ahi no se elige nada', () => {
  assert.match(mensajeDeFalloDeJornada(422, false), /cerrar la jornada/)
})
