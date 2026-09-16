import { test } from 'node:test'
import assert from 'node:assert/strict'
import { velocidadDeArrastre } from '../src/componentes/datos/desplazamientoTablero.ts'

test('arrastra hacia ambos extremos y acelera al acercarse al borde visible', () => {
  assert.ok(velocidadDeArrastre(110, 100, 900) < velocidadDeArrastre(150, 100, 900))
  assert.ok(velocidadDeArrastre(890, 100, 900) > velocidadDeArrastre(850, 100, 900))
  assert.equal(velocidadDeArrastre(100, 100, 900), -720)
  assert.equal(velocidadDeArrastre(900, 100, 900), 720)
})

test('no desplaza en el centro, fuera del tablero o con dimensiones inválidas', () => {
  for (const x of [0, 99, 300, 500, 800, 901]) assert.equal(velocidadDeArrastre(x, 100, 900), 0)
  for (const valores of [[NaN, 0, 300], [10, 0, 0], [10, 300, 0], [10, 0, Infinity]]) assert.equal(velocidadDeArrastre(...valores), 0)
})

test('en pantallas estrechas conserva una zona central sin desplazamiento', () => {
  assert.ok(velocidadDeArrastre(5, 0, 120) < 0)
  assert.equal(velocidadDeArrastre(60, 0, 120), 0)
  assert.ok(velocidadDeArrastre(115, 0, 120) > 0)
})
