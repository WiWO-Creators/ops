/**
 * Pruebas de las utilidades de texto de los buscadores.
 *
 * Lo que se cuida: que "nunez" encuentre a "Núñez" y que un texto vacío o en blanco no rompa la
 * comparación, porque es lo que llega cuando alguien borra el buscador.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sinAcentos } from '../src/lib/texto.ts'

test('sinAcentos quita tildes y diéresis, pasa a minúsculas y recorta los bordes', () => {
  assert.equal(sinAcentos('  Núñez Güemes  '), 'nunez guemes')
  assert.equal(sinAcentos('ANALÍTICA'), 'analitica')
})

test('sinAcentos deja vacío lo vacío o en blanco', () => {
  assert.equal(sinAcentos(''), '')
  assert.equal(sinAcentos('   '), '')
})

test('sinAcentos es idempotente y no toca lo que no tiene acentos', () => {
  assert.equal(sinAcentos(sinAcentos('Ñandú')), 'nandu')
  assert.equal(sinAcentos('rediseno 2026'), 'rediseno 2026')
})
