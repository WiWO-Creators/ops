/**
 * El BFF reenvia las cabeceras que hacen seguro un reintento (`Idempotency-Key`) y una escritura
 * condicionada (`If-Match`), y devuelve al navegador la version (`ETag`) y la marca de repeticion.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { cabecerasDeSalida } from '../src/datos/proxy-bff.ts'

function cargarCabecerasDeEntrada () {
  const fuente = ts.transpileModule(
    readFileSync(new URL('../src/app/api/bff/[...ruta]/route.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const contexto = { exports: {}, require: () => new Proxy({}, { get: () => () => {} }), console }

  vm.runInNewContext(fuente, contexto)

  return contexto.exports.cabecerasDeEntrada
}

test('reenvia Idempotency-Key e If-Match solo cuando vienen', () => {
  const cabecerasDeEntrada = cargarCabecerasDeEntrada()

  const con = cabecerasDeEntrada({ headers: new Headers({ 'idempotency-key': 'k-1', 'if-match': '"v3"' }) })
  assert.equal(con['idempotency-key'], 'k-1')
  assert.equal(con['if-match'], '"v3"')

  const sin = cabecerasDeEntrada({ headers: new Headers() })
  assert.equal(Object.keys(sin).length, 0)
})

test('devuelve ETag e Idempotent-Replayed de la API al navegador', () => {
  const respuesta = new Response('{}', { headers: { etag: '"v4"', 'idempotent-replayed': 'true' } })
  const salida = cabecerasDeSalida(respuesta)

  assert.equal(salida.get('etag'), '"v4"')
  assert.equal(salida.get('idempotent-replayed'), 'true')
})
