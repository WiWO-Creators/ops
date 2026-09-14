/**
 * Pruebas de la compuerta de entrada: cuando se exige abrir la jornada y cuando no.
 *
 * Es la unica logica de la pieza que no es JSX, y es la que puede encerrar a alguien. Un `true` de
 * mas frente a un estado que no se pudo leer deja a toda la empresa mirando un velo el dia que la
 * API se caiga; un `false` de mas convierte el bloqueo en el aviso que ya habia y que nadie miraba.
 *
 * Los mensajes van aparte porque la causa cambio dos veces. Al principio el 422 era "falta el
 * Espacio"; despues "esa Tarea no es de ese Proyecto"; y ahora no es nada, porque la ventana de
 * apertura perdio los campos y el `POST /me/jornada` sale con el cuerpo vacio. Lo que hay que fijar
 * es justamente eso: que al abrir no se le hable a nadie de un combo que ya no existe.
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

test('al abrir no se nombra ningun destino: la apertura ya no manda ninguno', () => {
  // La ventana no tiene combos, asi que "elige otro Proyecto o Tarea" mandaria a buscar donde no hay
  // nada que buscar. El texto generico al menos dice el codigo con el que preguntar.
  for (const codigo of [403, 404, 422]) {
    const mensaje = mensajeDeFalloDeJornada(codigo, true)

    assert.doesNotMatch(mensaje, /Tarea/)
    assert.doesNotMatch(mensaje, /Proyecto/)
    assert.ok(mensaje.length > 0)
  }
})

test('el 409 al abrir sigue diciendo que ya hay una', () => {
  assert.equal(mensajeDeFalloDeJornada(409, true), 'Ya tienes una jornada abierta.')
})

test('al cerrar no aparecen los textos del destino: ahi no se elige nada', () => {
  // Se comprueba la intencion y no el texto: el 422 al cerrar tiene mensaje propio desde que la
  // caja de comentarios existe, y comparar contra la frase generica ataba la prueba a una
  // redaccion. Lo que importa es que al cerrar nunca se hable de elegir Proyecto ni Tarea.
  const mensaje = mensajeDeFalloDeJornada(422, false)

  assert.doesNotMatch(mensaje, /Tarea/)
  assert.doesNotMatch(mensaje, /Proyecto/)
})
