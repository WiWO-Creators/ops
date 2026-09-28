/**
 * Pruebas del toast comun (`lib/avisos.ts`): la cola con techo y cuanto dura cada nivel antes de
 * cerrarse solo. Lo que se protege es que un aviso de mas no tape la pantalla y que el nivel decida
 * bien cuanto tiempo da para leerlo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarACola, duracionPorNivel, quitarDeCola } from '../src/lib/avisos.ts'

test('la cola agrega al final y respeta el techo, descartando lo mas viejo', () => {
  const cola = [{ id: 1 }, { id: 2 }]

  assert.deepEqual(agregarACola(cola, { id: 3 }, 3), [{ id: 1 }, { id: 2 }, { id: 3 }])
  assert.deepEqual(agregarACola(cola, { id: 3 }, 2), [{ id: 2 }, { id: 3 }])
})

test('una cola vacia con techo cero no agrega nada', () => {
  assert.deepEqual(agregarACola([], { id: 1 }, 0), [])
})

test('quitar de la cola saca solo el id pedido, y no falla si no estaba', () => {
  const cola = [{ id: 1 }, { id: 2 }, { id: 3 }]

  assert.deepEqual(quitarDeCola(cola, 2), [{ id: 1 }, { id: 3 }])
  assert.deepEqual(quitarDeCola(cola, 99), cola)
})

test('exito e informacion duran menos que error y advertencia', () => {
  assert.equal(duracionPorNivel('exito'), duracionPorNivel('info'))
  assert.equal(duracionPorNivel('error'), duracionPorNivel('advertencia'))
  assert.ok(duracionPorNivel('exito') < duracionPorNivel('error'))
})
