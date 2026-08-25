/**
 * Pruebas de la lista blanca del BFF.
 *
 * El BFF reenvia con el token de la persona adosado: lo que pase esta lista queda alcanzable desde
 * el navegador. Lo importante no es que deje pasar lo permitido, sino que no deje pasar lo demas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rutaPermitida } from '../src/datos/rutas.ts'

test('deja pasar los recursos del nucleo', () => {
  for (const ruta of [['me'], ['lookups'], ['tasks'], ['tasks', '512', 'comments'], ['projects', '44', 'milestones']]) {
    assert.equal(rutaPermitida(ruta), true, ruta.join('/'))
  }
})

test('auth NO pasa: los tokens solo los ve /api/sesion', () => {
  assert.equal(rutaPermitida(['auth', 'login']), false)
  assert.equal(rutaPermitida(['auth', 'refresh']), false)
})

test('un recurso fuera de la lista no pasa', () => {
  assert.equal(rutaPermitida(['invoices']), false)
  assert.equal(rutaPermitida(['verificacion', 'permisos']), false)
})

test('una ruta vacia no pasa', () => {
  assert.equal(rutaPermitida([]), false)
})

test('no se puede escalar fuera de la lista con .. ni con segmentos vacios', () => {
  assert.equal(rutaPermitida(['tasks', '..', 'auth', 'login']), false)
  assert.equal(rutaPermitida(['tasks', '', 'comments']), false)
  assert.equal(rutaPermitida(['tasks', '.']), false)
})
