/**
 * El BFF tiene que reenviar el `Origin` del navegador hacia la API tal cual, sin gatillo de
 * `PROXY_SECRETO`: es lo que la API necesita para abrir una sesión resumable de Drive con el origen
 * correcto, porque el `PUT` de los trozos lo hace el navegador directo contra Google y no pasa por
 * este proxy (ver `cabecerasDeEntrada` en `route.ts`).
 *
 * Se prueba la función aislada, con todas las dependencias del módulo mockeadas: lo que importa acá
 * es el reenvío de la cabecera, no el resto del proxy (ya cubierto en otras pruebas).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/** Cualquier propiedad que se lea de este objeto es una función que no hace nada. */
function moduloVacio () {
  return new Proxy({}, { get: () => () => {} })
}

function cargarCabecerasDeEntrada () {
  const fuente = ts.transpileModule(
    readFileSync(new URL('../src/app/api/bff/[...ruta]/route.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText

  const contexto = {
    exports: {},
    require: () => moduloVacio(),
    console
  }
  vm.runInNewContext(fuente, contexto)

  return contexto.exports.cabecerasDeEntrada
}

test('reenvía el Origin del navegador tal cual, y solo cuando vino', () => {
  const cabecerasDeEntrada = cargarCabecerasDeEntrada()

  assert.deepEqual(
    { ...cabecerasDeEntrada({ headers: new Headers({ origin: 'https://ops.wiwo.me' }) }) },
    { origin: 'https://ops.wiwo.me' }
  )
  assert.deepEqual({ ...cabecerasDeEntrada({ headers: new Headers() }) }, {})
})

test('combina el Origin con el Accept de streaming, sin que uno pise al otro', () => {
  const cabecerasDeEntrada = cargarCabecerasDeEntrada()

  const cabeceras = { ...cabecerasDeEntrada({
    headers: new Headers({ origin: 'https://ops.wiwo.me', accept: 'text/event-stream' })
  }) }

  assert.deepEqual(cabeceras, { origin: 'https://ops.wiwo.me', accept: 'text/event-stream' })
})

test('no reenvía un Accept que no sea el de streaming', () => {
  const cabecerasDeEntrada = cargarCabecerasDeEntrada()

  assert.deepEqual(
    { ...cabecerasDeEntrada({ headers: new Headers({ accept: 'text/html,application/xhtml+xml' }) }) },
    {}
  )
})
