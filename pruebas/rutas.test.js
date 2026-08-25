/**
 * Pruebas de la lista blanca del BFF.
 *
 * El BFF reenvia con el token de la persona adosado: lo que pase esta lista queda alcanzable desde
 * el navegador. Lo importante no es que deje pasar lo permitido, sino que no deje pasar lo demas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

/**
 * El matcher del proxy, tal cual lo declara `proxy.ts`.
 *
 * Se lee del archivo en vez de copiarlo: una copia se desincroniza y la prueba pasaria verificando
 * una regla que ya no corre.
 */
function matcherDelProxy () {
  const fuente = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8')
  const [, literal] = fuente.match(/matcher:\s*\['([^']+)'\]/)
  // El archivo es TypeScript: lo que ahi es `\\.` vale `\.` una vez que el modulo se evalua.
  const patron = literal.replace(/\\\\/g, '\\')

  return new RegExp(`^${patron}$`)
}

test('el proxy protege el panel', () => {
  const matcher = matcherDelProxy()

  for (const ruta of ['/', '/procesos', '/espacios/44', '/clientes']) {
    assert.equal(matcher.test(ruta), true, `${ruta} tiene que pedir sesion`)
  }
})

test('el proxy deja pasar los estaticos y la pantalla de entrar', () => {
  // Un estatico detras del guardia se convierte en redireccion a `/entrar`, y ahi la pantalla de
  // entrar se queda sin su propio logotipo.
  const matcher = matcherDelProxy()

  for (const ruta of ['/entrar', '/icon.png', '/marca/wiwo-ops.png', '/fonts/neo/Outfit-100-900-latin.woff2', '/api/sesion']) {
    assert.equal(matcher.test(ruta), false, `${ruta} no puede pedir sesion`)
  }
})
