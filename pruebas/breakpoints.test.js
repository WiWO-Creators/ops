/**
 * Sincronia de los cortes entre CSS y JS.
 *
 * Parte del layout se decide en CSS (`@theme`) y parte en JS (`CORTES`). Si divergen, aparece una
 * franja de anchos donde la navegacion cree una cosa y el estilo otra. Es el tipo de bug que nadie
 * reproduce porque hay que tener la ventana en un ancho exacto.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CORTES, desde, hasta } from '../src/lib/breakpoints.ts'

const globals = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

/** Extrae los `--breakpoint-*` declarados en el `@theme` de globals.css. */
function cortesDelCss () {
  return Object.fromEntries(
    [...globals.matchAll(/--breakpoint-([a-z]+):\s*(\d+)px/g)].map(([, nombre, px]) => [nombre, Number(px)])
  )
}

test('CSS y JS declaran exactamente los mismos cortes', () => {
  assert.deepEqual(cortesDelCss(), { ...CORTES })
})

test('los cortes estan ordenados de menor a mayor', () => {
  const valores = Object.values(CORTES)
  assert.deepEqual(valores, [...valores].sort((a, b) => a - b))
})

test('desde() y hasta() no se solapan en el propio corte', () => {
  // En 1024 exacto, solo una de las dos consultas puede ser verdadera.
  assert.equal(desde('lg'), '(min-width: 1024px)')
  assert.equal(hasta('lg'), '(max-width: 1023px)')
})
