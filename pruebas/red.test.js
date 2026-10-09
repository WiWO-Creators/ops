/**
 * Limites de tiempo y claves de idempotencia del transporte del navegador.
 *
 * Con red lenta lo que importa es que una peticion nunca quede colgada y que un tiempo agotado no se
 * confunda con un aborto de quien llama.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveDeIdempotencia,
  conLimite,
  esTiempoAgotado,
  milisegundosDe
} from '../src/datos/red.ts'

test('milisegundosDe usa el valor solo si es un entero positivo', () => {
  assert.equal(milisegundosDe('8000', 1), 8000)
  assert.equal(milisegundosDe(undefined, 15), 15)
  assert.equal(milisegundosDe('0', 15), 15)
  assert.equal(milisegundosDe('-5', 15), 15)
  assert.equal(milisegundosDe('1.5', 15), 15)
  assert.equal(milisegundosDe('abc', 15), 15)
})

test('conLimite aborta por tiempo y el fallo se reconoce como tiempo agotado', async () => {
  const senal = conLimite(undefined, 20)

  await new Promise((resolver) => senal.addEventListener('abort', resolver))

  assert.equal(esTiempoAgotado(senal.reason), true)
})

test('conLimite respeta el aborto del llamador y no lo trata como tiempo agotado', () => {
  const control = new AbortController()
  const senal = conLimite(control.signal, 60_000)

  control.abort()

  assert.equal(senal.aborted, true)
  assert.equal(esTiempoAgotado(senal.reason), false)
})

test('esTiempoAgotado ignora cualquier otro fallo', () => {
  assert.equal(esTiempoAgotado(new TypeError('fetch failed')), false)
  assert.equal(esTiempoAgotado(new DOMException('x', 'AbortError')), false)
  assert.equal(esTiempoAgotado(undefined), false)
})

test('claveDeIdempotencia entrega una clave distinta cada vez', () => {
  const claves = new Set(Array.from({ length: 50 }, () => claveDeIdempotencia()))

  assert.equal(claves.size, 50)
  for (const clave of claves) assert.ok(clave.length >= 16)
})
