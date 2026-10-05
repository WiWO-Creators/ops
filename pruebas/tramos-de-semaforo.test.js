/**
 * Pruebas de los nombres de los tramos del semaforo: un solo lugar los define y de ahi salen el
 * recuento escrito, las fichas y el resumen de la cabecera.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ORDEN_DE_TRAMOS, PALABRAS_DE_TRAMO, contarConPalabra, notaDePesos } from '../src/dominio/tramos-de-semaforo.ts'

test('ORDEN_DE_TRAMOS lista los cuatro tramos, del mas urgente al menos', () => {
  assert.deepEqual([...ORDEN_DE_TRAMOS], ['rojo', 'amarillo', 'verde', 'sin_datos'])
})

test('cada tramo del orden tiene sus palabras', () => {
  for (const tramo of ORDEN_DE_TRAMOS) {
    const palabras = PALABRAS_DE_TRAMO[tramo]

    assert.ok(palabras.singular !== '' && palabras.plural !== '' && palabras.deCuentas !== '')
  }
})

test('contarConPalabra concuerda el singular con una unidad y el plural con cero o varias', () => {
  assert.equal(contarConPalabra('rojo', 1), '1 crítico')
  assert.equal(contarConPalabra('rojo', 3), '3 críticos')
  assert.equal(contarConPalabra('rojo', 0), '0 críticos')
  assert.equal(contarConPalabra('verde', 2), '2 al día')
  assert.equal(contarConPalabra('sin_datos', 1), '1 sin datos')
})

test('las fichas de cuentas concuerdan en femenino: el rojo es "Críticas" y no "en rojo"', () => {
  assert.equal(PALABRAS_DE_TRAMO.rojo.deCuentas, 'Críticas')
})

/** Tres señales donde solo se declara cuáles tienen sub-score. */
function pesos (plazos, carga, vencimientos) {
  return { plazos: { score: plazos }, carga: { score: carga }, vencimientos: { score: vencimientos } }
}

test('notaDePesos nombra la única señal que cuenta cuando las otras no aplican', () => {
  assert.equal(
    notaDePesos(pesos(0, null, null)),
    'Solo cuenta Cumplimiento de plazos: las otras no tienen nada que medir.'
  )
})

test('notaDePesos nombra las dos que cuentan cuando una no aplica', () => {
  assert.equal(
    notaDePesos(pesos(40, 80, null)),
    'Solo cuentan Cumplimiento de plazos y Carga y actividad: la otra no tiene nada que medir.'
  )
})

test('notaDePesos calla cuando todas aplican o ninguna aplica', () => {
  assert.equal(notaDePesos(pesos(10, 20, 30)), null)
  assert.equal(notaDePesos(pesos(null, null, null)), null)
})
