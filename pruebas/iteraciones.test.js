/**
 * Pruebas del orden de las iteraciones de un Proceso.
 *
 * La API las manda de la mas vieja a la mas nueva y la pantalla las muestra al reves. Si el orden se
 * invierte en silencio, la iteracion de arriba deja de ser la ultima y nadie lo nota hasta que
 * alguien lee el motivo equivocado.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numerarIteraciones, ordenarIteraciones } from '../src/lib/iteraciones.ts'

test('la mas nueva queda primera', () => {
  const ordenadas = ordenarIteraciones([{ id: 1 }, { id: 2 }, { id: 3 }])

  assert.deepEqual(ordenadas.map((it) => it.id), [3, 2, 1])
})

test('una lista que llega desordenada tambien se ordena', () => {
  const ordenadas = ordenarIteraciones([{ id: 7 }, { id: 2 }, { id: 40 }])

  assert.deepEqual(ordenadas.map((it) => it.id), [40, 7, 2])
})

test('no muta el arreglo original', () => {
  const original = [{ id: 1 }, { id: 2 }]
  ordenarIteraciones(original)

  assert.deepEqual(original.map((it) => it.id), [1, 2])
})

test('una lista vacia sigue vacia', () => {
  assert.deepEqual(ordenarIteraciones([]), [])
})

test('la ronda explicita manda sobre la posicion', () => {
  const numeradas = numerarIteraciones([
    { id: 6, round: 3 },
    { id: 8, round: 5 }
  ])

  assert.deepEqual(numeradas.map((it) => it.numero), [5, 3])
})

test('borrar una intermedia no corre la numeracion', () => {
  const antes = numerarIteraciones([
    { id: 6, round: 3 },
    { id: 7, round: 4 },
    { id: 8, round: 5 }
  ])
  const despues = numerarIteraciones([
    { id: 6, round: 3 },
    { id: 8, round: 5 }
  ])

  assert.deepEqual(antes.map((it) => it.numero), [5, 4, 3])
  assert.deepEqual(despues.map((it) => it.numero), [5, 3])
})

test('sin ronda se numera por posicion, de la mas vieja a la mas nueva', () => {
  const numeradas = numerarIteraciones([
    { id: 4, round: null },
    { id: 5, round: null }
  ])

  assert.deepEqual(numeradas.map((it) => [it.id, it.numero]), [[5, 2], [4, 1]])
})

test('conviven las viejas sin ronda con las nuevas numeradas', () => {
  const numeradas = numerarIteraciones([
    { id: 4, round: null },
    { id: 5, round: null },
    { id: 6, round: 3 }
  ])

  assert.deepEqual(numeradas.map((it) => [it.id, it.numero]), [[6, 3], [5, 2], [4, 1]])
})

test('una lista vacia no rompe la numeracion', () => {
  assert.deepEqual(numerarIteraciones([]), [])
})
