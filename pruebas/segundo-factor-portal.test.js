/**
 * Pruebas de las reglas del segundo paso del portal (codigo por correo).
 *
 * Lo que importa: que pegar el codigo con espacios no gaste un intento, que cada codigo de error de la
 * API lleve a la accion correcta, y que "el correo no salio" nunca se lea como "clave incorrecta".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoDeCodigoNoEnviado, esCodigoCompleto, interpretarErrorDeCodigo, LARGO_CODIGO, normalizarCodigo, notaDeEntrega
} from '../src/dominio/segundo-factor-portal.ts'

test('el codigo son seis digitos', () => {
  assert.equal(LARGO_CODIGO, 6)
})

test('normaliza lo que se pega desde el correo', () => {
  assert.equal(normalizarCodigo('123 456'), '123456')
  assert.equal(normalizarCodigo(' 123456\n'), '123456')
  assert.equal(normalizarCodigo('12-34-56'), '123456')
  assert.equal(normalizarCodigo('abc123def456'), '123456')
  assert.equal(normalizarCodigo('1234567890'), '123456', 'no pasa del largo')
  assert.equal(normalizarCodigo(''), '')
  assert.equal(normalizarCodigo('abc'), '')
})

test('solo un codigo completo se envia', () => {
  assert.equal(esCodigoCompleto('123456'), true)
  assert.equal(esCodigoCompleto('000000'), true, 'los ceros a la izquierda son un codigo valido')
  assert.equal(esCodigoCompleto('12345'), false)
  assert.equal(esCodigoCompleto('1234567'), false)
  assert.equal(esCodigoCompleto('12345a'), false)
  assert.equal(esCodigoCompleto(''), false)
})

test('cada error del contrato lleva a su accion', () => {
  assert.equal(interpretarErrorDeCodigo('invalid_code', 401, undefined).accion, 'reintentar')
  assert.equal(interpretarErrorDeCodigo('code_expired', 401, undefined).accion, 'pedir-otro')
  for (const codigo of ['challenge_exhausted', 'token_expired', 'token_revoked', 'unauthenticated']) {
    assert.equal(interpretarErrorDeCodigo(codigo, 401, undefined).accion, 'reiniciar', codigo)
  }
  assert.equal(interpretarErrorDeCodigo('resend_too_soon', 429, 'Espera 12 segundos.').accion, 'avisar')
  assert.equal(interpretarErrorDeCodigo('resend_too_soon', 429, 'Espera 12 segundos.').mensaje, 'Espera 12 segundos.')
  assert.equal(interpretarErrorDeCodigo('rate_limited', 429, undefined).accion, 'avisar')
})

test('un codigo de error desconocido no deja a la persona sin salida', () => {
  assert.equal(interpretarErrorDeCodigo(undefined, 401, undefined).accion, 'reiniciar')
  assert.equal(interpretarErrorDeCodigo('rarisimo', 500, 'Falló algo').mensaje, 'Falló algo')
  assert.equal(interpretarErrorDeCodigo('rarisimo', 500, undefined).accion, 'avisar')
})

test('el correo que no sale no se confunde con una clave mala', () => {
  assert.match(avisoDeCodigoNoEnviado('two_factor_unavailable', undefined) ?? '', /No pudimos enviar el código/)
  assert.equal(avisoDeCodigoNoEnviado('two_factor_unavailable', 'Texto de la API'), 'Texto de la API')
  assert.equal(avisoDeCodigoNoEnviado('unauthenticated', 'Credenciales inválidas.'), null)
  assert.equal(avisoDeCodigoNoEnviado(undefined, undefined), null)
  assert.equal(interpretarErrorDeCodigo('two_factor_unavailable', 503, undefined).accion, 'avisar')
})

test('avisa cuando el codigo fue a la casilla de pruebas', () => {
  assert.match(notaDeEntrega('prueba') ?? '', /pruebas/)
  assert.equal(notaDeEntrega('real'), null)
  assert.equal(notaDeEntrega(undefined), null)
})
