/**
 * Pruebas del orden de las iteraciones de un Proceso.
 *
 * La API las manda de la mas vieja a la mas nueva y la pantalla las muestra al reves. Si el orden se
 * invierte en silencio, la iteracion de arriba deja de ser la ultima y nadie lo nota hasta que
 * alguien lee el motivo equivocado.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarIteraciones } from '../src/lib/iteraciones.ts'

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
