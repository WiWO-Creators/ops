/**
 * Pruebas de los tramos de reemplazo del Meeting Paper (`src/dominio/tramos-acta.ts`).
 *
 * Lógica pura: se parte el HTML en bloques de primer nivel y se comprueba que los tramos, aplicados
 * en orden sobre los bloques del acta actual, dejan exactamente los bloques del acta nueva.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITES_REPRODUCCION } from '../src/dominio/diff-acta.ts'
import { bloquesComoHtml, tramosDeReemplazo } from '../src/dominio/tramos-acta.ts'

/** Aplica los tramos sobre los bloques del acta actual, como lo hace el servicio, y devuelve el HTML. */
function aplicar (actual, tramos) {
  const bloques = bloquesComoHtml(actual)

  for (const tramo of tramos) {
    bloques.splice(tramo.desde, tramo.borrar, ...bloquesComoHtml(tramo.html))
    assert.equal(bloquesComoHtml(tramo.html).length, tramo.insertados)
  }

  return bloques.join('')
}

const BASE = '<h1>Acta</h1><p>Uno</p><ul><li><p>a</p></li><li><p>b</p></li></ul><p>Cierre</p>'

test('bloquesComoHtml parte por bloques de primer nivel, con listas, vacíos y filetes', () => {
  assert.deepEqual(bloquesComoHtml(BASE), ['<h1>Acta</h1>', '<p>Uno</p>', '<ul><li><p>a</p></li><li><p>b</p></li></ul>', '<p>Cierre</p>'])
  assert.deepEqual(bloquesComoHtml('<p></p><hr><p>x<br>y</p>'), ['<p></p>', '<hr>', '<p>x<br>y</p>'])
  assert.deepEqual(bloquesComoHtml('<blockquote><p>cita</p><p>más</p></blockquote>'), ['<blockquote><p>cita</p><p>más</p></blockquote>'])
})

test('bloquesComoHtml tolera atributos con «>», texto suelto, cierres huérfanos y entradas inválidas', () => {
  assert.deepEqual(bloquesComoHtml('<p><a href="https://x.cl/?a=1&b>2">enlace</a></p>'), ['<p><a href="https://x.cl/?a=1&b>2">enlace</a></p>'])
  assert.deepEqual(bloquesComoHtml('suelto<p>uno</p>'), ['<p>suelto</p>', '<p>uno</p>'])
  assert.deepEqual(bloquesComoHtml('</p><p>uno</p>'), ['<p>uno</p>'])
  assert.deepEqual(bloquesComoHtml('<p>sin cierre'), ['<p>sin cierre'])
  assert.deepEqual(bloquesComoHtml(''), [])
  assert.deepEqual(bloquesComoHtml(undefined), [])
})

test('sin diferencias no hay tramos', () => {
  assert.deepEqual(tramosDeReemplazo(BASE, BASE), [])
  assert.deepEqual(tramosDeReemplazo('', ''), [])
})

test('cambiar un bloque da un tramo que lo reemplaza', () => {
  const nuevo = BASE.replace('<p>Uno</p>', '<p>Uno corregido</p>')
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.deepEqual(tramos, [{ desde: 1, borrar: 1, html: '<p>Uno corregido</p>', insertados: 1 }])
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('insertar al final y al principio no borra nada', () => {
  const alFinal = `${BASE}<p>Extra</p>`
  const alInicio = `<p>Antes</p>${BASE}`

  assert.deepEqual(tramosDeReemplazo(BASE, alFinal), [{ desde: 4, borrar: 0, html: '<p>Extra</p>', insertados: 1 }])
  assert.deepEqual(tramosDeReemplazo(BASE, alInicio), [{ desde: 0, borrar: 0, html: '<p>Antes</p>', insertados: 1 }])
})

test('borrar bloques da un tramo sin HTML', () => {
  const nuevo = '<h1>Acta</h1><p>Cierre</p>'
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.deepEqual(tramos, [{ desde: 1, borrar: 2, html: '', insertados: 0 }])
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('cambios separados dan tramos separados y sus posiciones cuentan los anteriores', () => {
  const nuevo = '<h1>Acta nueva</h1><p>Intro</p><p>Intro 2</p><p>Uno</p><ul><li><p>a</p></li></ul><p>Cierre</p><p>Fin</p>'
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.ok(tramos.length >= 3, 'al menos tres huecos separados')
  assert.deepEqual(tramos.map((t) => t.desde), [...tramos.map((t) => t.desde)].sort((a, b) => a - b))
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('un cambio de formato sin cambio de texto también es un tramo', () => {
  const nuevo = BASE.replace('<p>Uno</p>', '<p><strong>Uno</strong></p>')
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.equal(tramos.length, 1)
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('vaciar o llenar un acta entero funciona', () => {
  assert.deepEqual(tramosDeReemplazo(BASE, ''), [{ desde: 0, borrar: 4, html: '', insertados: 0 }])
  assert.deepEqual(tramosDeReemplazo('', '<p>Hola</p>'), [{ desde: 0, borrar: 0, html: '<p>Hola</p>', insertados: 1 }])
})

test('bloques repetidos no confunden la comparación', () => {
  const actual = '<p>x</p><p>x</p><p>y</p><p>x</p>'
  const nuevo = '<p>x</p><p>y</p><p>x</p><p>x</p>'

  assert.equal(aplicar(actual, tramosDeReemplazo(actual, nuevo)), nuevo)
})

test('aplicar los tramos siempre da el acta nueva (barrido de variantes)', () => {
  const piezas = ['<h1>T</h1>', '<p>a</p>', '<p>b</p>', '<hr>', '<ul><li><p>i</p></li></ul>', '<p></p>', '<blockquote><p>c</p></blockquote>']
  let semilla = 7
  const azar = (tope) => { semilla = (semilla * 1103515245 + 12345) % 2_147_483_648; return semilla % tope }
  const secuencia = () => Array.from({ length: azar(7) }, () => piezas[azar(piezas.length)]).join('')

  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const actual = secuencia()
    const nuevo = secuencia()

    assert.equal(aplicar(actual, tramosDeReemplazo(actual, nuevo)), nuevo, `${actual} -> ${nuevo}`)
  }
})

test('con una tabla de comparación demasiado grande se reemplaza todo lo distinto de una vez', () => {
  const lado = Math.ceil(Math.sqrt(LIMITES_REPRODUCCION.maxCeldasLcs)) + 10
  const actual = Array.from({ length: lado }, (_, i) => `<p>a${i}</p>`).join('')
  const nuevo = Array.from({ length: lado }, (_, i) => `<p>b${i}</p>`).join('')
  const tramos = tramosDeReemplazo(actual, nuevo)

  assert.equal(tramos.length, 1)
  assert.equal(tramos[0].borrar, lado)
  assert.equal(tramos[0].insertados, lado)
  assert.equal(aplicar(actual, tramos), nuevo)
})
