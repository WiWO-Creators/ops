/**
 * `cn` tiene que conocer la escala propia de `globals.css`.
 *
 * `tailwind-merge` toma cualquier `text-*` que no sea un peldaño suyo por un color: sin declararlo,
 * `cn('text-menor', 'text-acento')` borra el tamaño y el rotulo sale al tamaño heredado sin que nada
 * falle. Se transpila `src/lib/clases.ts` real con sus dependencias reales.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

function cargarClases () {
  const salida = ts.transpileModule(leer('../src/lib/clases.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const sandbox = { exports: {}, require: createRequire(import.meta.url) }
  vm.runInNewContext(salida, sandbox)
  return sandbox.exports
}

const { cn, TAMANOS_DE_TEXTO, CAPAS_Z } = cargarClases()
const globals = leer('../src/app/globals.css')

test('un tamaño propio no se borra contra un color, ni al reves', () => {
  assert.equal(cn('text-menor', 'text-acento'), 'text-menor text-acento')
  assert.equal(cn('text-texto', 'text-titulo'), 'text-texto text-titulo')
  assert.equal(cn('text-cifra font-semibold', 'text-texto-peligro'), 'text-cifra font-semibold text-texto-peligro')
})

test('dos tamaños siguen resolviendose a favor del ultimo', () => {
  assert.equal(cn('text-xs', 'text-menor'), 'text-menor')
  assert.equal(cn('text-micro', 'text-sm'), 'text-sm')
})

test('las capas con nombre compiten con la escala numerica', () => {
  assert.equal(cn('z-10', 'z-superposicion'), 'z-superposicion')
})

test('cada --text-* y --z-index-* de globals.css esta declarado en cn', () => {
  const deFabrica = new Set(['xs', 'sm', 'base'])
  const tamanos = [...globals.matchAll(/^\s*--text-([a-z]+)\s*:/gm)].map(([, n]) => n).filter((n) => !deFabrica.has(n))
  assert.deepEqual([...new Set(tamanos)].sort(), [...TAMANOS_DE_TEXTO].sort())

  const capas = [...globals.matchAll(/^\s*--z-index-([a-z]+)\s*:/gm)].map(([, n]) => n)
  assert.deepEqual(capas.sort(), [...CAPAS_Z].sort())
})
