/**
 * Pruebas del traspaso del login de Google de Chrome a la app nativa.
 *
 * Lo que se protege: que el código solo se abra con el verifier de su reto, que venza, que uno
 * manipulado o sellado con otra clave no entregue nada, y que la clave no sea la de la cookie.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { abrirTraspaso, claveTraspaso, retoDe, sellarTraspaso } from '../src/datos/traspaso.ts'

const CLAVE_SESION = randomBytes(32)
const CLAVE = claveTraspaso(CLAVE_SESION)
const VERIFIER = randomBytes(32).toString('base64url')
const RETO = retoDe(VERIFIER)
const CREDENCIAL = 'eyJhbGciOiJSUzI1NiJ9.cuerpo.firma'
const AHORA = 1_760_000_000_000

test('retoDe es S256 en base64url, igual que la app', () => {
  assert.equal(RETO, createHash('sha256').update(VERIFIER).digest('base64url'))
  assert.equal(RETO.length, 43)
})

test('el código se abre con el verifier de su reto', () => {
  const codigo = sellarTraspaso(CREDENCIAL, RETO, CLAVE, 120, AHORA)

  assert.match(codigo, /^[A-Za-z0-9_-]+$/)
  assert.ok(!codigo.includes(CREDENCIAL))
  assert.equal(abrirTraspaso(codigo, VERIFIER, CLAVE, AHORA + 60_000), CREDENCIAL)
})

test('otro verifier no abre el código', () => {
  const codigo = sellarTraspaso(CREDENCIAL, RETO, CLAVE, 120, AHORA)
  const otro = randomBytes(32).toString('base64url')

  assert.equal(abrirTraspaso(codigo, otro, CLAVE, AHORA), null)
  assert.equal(abrirTraspaso(codigo, RETO, CLAVE, AHORA), null)
})

test('el código vence', () => {
  const codigo = sellarTraspaso(CREDENCIAL, RETO, CLAVE, 120, AHORA)

  assert.equal(abrirTraspaso(codigo, VERIFIER, CLAVE, AHORA + 121_000), null)
})

test('un código manipulado, truncado o de otra clave no entrega nada', () => {
  const codigo = sellarTraspaso(CREDENCIAL, RETO, CLAVE, 120, AHORA)
  const medio = Math.floor(codigo.length / 2)
  const cambiado = codigo.slice(0, medio) + (codigo[medio] === 'A' ? 'B' : 'A') + codigo.slice(medio + 1)

  assert.equal(abrirTraspaso(cambiado, VERIFIER, CLAVE, AHORA), null)
  assert.equal(abrirTraspaso(codigo.slice(0, 30), VERIFIER, CLAVE, AHORA), null)
  assert.equal(abrirTraspaso(codigo, VERIFIER, claveTraspaso(randomBytes(32)), AHORA), null)
  assert.equal(abrirTraspaso('no es un código!', VERIFIER, CLAVE, AHORA), null)
  assert.equal(abrirTraspaso(codigo, 'corto', CLAVE, AHORA), null)
})

test('la clave del traspaso no es la de la cookie', () => {
  assert.equal(CLAVE.length, 32)
  assert.ok(!CLAVE.equals(CLAVE_SESION))
})

test('sellar exige credencial y un reto PKCE', () => {
  assert.throws(() => sellarTraspaso('  ', RETO, CLAVE, 120, AHORA), RangeError)
  assert.throws(() => sellarTraspaso(CREDENCIAL, 'reto-corto', CLAVE, 120, AHORA), RangeError)
})
