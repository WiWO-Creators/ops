/**
 * Pruebas de las reglas de la lista de seguidores predeterminados (WIW-0496).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOPE_SEGUIDORES_PREDETERMINADOS,
  problemaDeSeguidores,
  seguidoresCambiaron
} from '../src/dominio/seguidores-predeterminados.ts'

test('seguidoresCambiaron no mira el orden: la API guarda un conjunto', () => {
  assert.equal(seguidoresCambiaron([5, 6], [6, 5]), false)
  assert.equal(seguidoresCambiaron([], []), false)
})

test('seguidoresCambiaron detecta altas, bajas y reemplazos', () => {
  assert.equal(seguidoresCambiaron([5], [5, 6]), true)
  assert.equal(seguidoresCambiaron([5, 6], [5]), true)
  assert.equal(seguidoresCambiaron([5, 6], [5, 7]), true)
})

test('problemaDeSeguidores acepta hasta el tope y rechaza uno mas', () => {
  const tope = Array.from({ length: TOPE_SEGUIDORES_PREDETERMINADOS }, (_, i) => i + 1)
  assert.equal(problemaDeSeguidores([]), null)
  assert.equal(problemaDeSeguidores(tope), null)
  assert.match(problemaDeSeguidores([...tope, 999]) ?? '', /hasta 30/)
})
