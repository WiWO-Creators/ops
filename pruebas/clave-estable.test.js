/**
 * Pruebas de la clave de idempotencia estable de los formularios.
 *
 * Si la clave cambiara en cada pulsacion, reintentar un alta de la que no llego respuesta la crearia
 * dos veces; si no cambiara nunca, un alta distinta se tomaria por repeticion de la anterior.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveParaCuerpo } from '../src/componentes/proyecto/clave-estable.ts'

/** Fabrica de claves predecible. */
function contador () {
  let n = 0

  return () => `clave-${++n}`
}

test('el mismo cuerpo reutiliza la clave', () => {
  const generar = contador()
  const primera = claveParaCuerpo(null, { nombre: 'A' }, generar)
  const segunda = claveParaCuerpo(primera, { nombre: 'A' }, generar)

  assert.equal(segunda.clave, primera.clave)
})

test('un cuerpo distinto recibe una clave nueva', () => {
  const generar = contador()
  const primera = claveParaCuerpo(null, { nombre: 'A' }, generar)
  const segunda = claveParaCuerpo(primera, { nombre: 'B' }, generar)

  assert.notEqual(segunda.clave, primera.clave)
})

test('sin envio previo se genera una clave', () => {
  assert.equal(claveParaCuerpo(null, {}, contador()).clave, 'clave-1')
})
