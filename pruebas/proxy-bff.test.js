/**
 * Piezas puras del proxy BFF: cabeceras que llegan al navegador en las descargas y lectura del
 * cuerpo de la peticion.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cabecerasDeSalida, esRutaDeDescarga, interpretarCuerpoJson } from '../src/datos/proxy-bff.ts'

/** Respuesta de la API con las cabeceras dadas. */
function respuestaCon (cabeceras) {
  return new Response('x', { headers: cabeceras })
}

test('una descarga reenvia content-disposition y nosniff de la API', () => {
  const salida = cabecerasDeSalida(
    respuestaCon({
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="a.pdf"',
      'x-content-type-options': 'nosniff'
    }),
    true
  )

  assert.equal(salida.get('content-disposition'), 'attachment; filename="a.pdf"')
  assert.equal(salida.get('x-content-type-options'), 'nosniff')
})

test('una descarga fuerza nosniff aunque la API no lo mande', () => {
  const salida = cabecerasDeSalida(respuestaCon({ 'content-type': 'text/html' }), true)

  assert.equal(salida.get('x-content-type-options'), 'nosniff')
})

test('una descarga copia content-length solo si el cuerpo no viene recodificado', () => {
  const plano = cabecerasDeSalida(respuestaCon({ 'content-length': '10' }), true)
  const comprimido = cabecerasDeSalida(
    respuestaCon({ 'content-length': '10', 'content-encoding': 'gzip' }),
    true
  )

  assert.equal(plano.get('content-length'), '10')
  assert.equal(comprimido.get('content-length'), null)
})

test('fuera de las descargas no se copia content-length ni se fuerza nosniff', () => {
  const salida = cabecerasDeSalida(respuestaCon({ 'content-length': '10' }))

  assert.equal(salida.get('content-length'), null)
  assert.equal(salida.get('x-content-type-options'), null)
})

test('solo el prefijo files es una descarga', () => {
  assert.equal(esRutaDeDescarga(['files', '7', 'download']), true)
  assert.equal(esRutaDeDescarga(['portal', 'files']), false)
  assert.equal(esRutaDeDescarga([]), false)
})

test('un cuerpo vacio es legible y sin contenido', () => {
  assert.deepEqual(interpretarCuerpoJson(''), { legible: true, cuerpo: undefined })
})

test('un cuerpo JSON valido se parsea', () => {
  assert.deepEqual(interpretarCuerpoJson('{"a":1}'), { legible: true, cuerpo: { a: 1 } })
})

test('un cuerpo que no es JSON es ilegible y no se confunde con vacio', () => {
  assert.deepEqual(interpretarCuerpoJson('{roto'), { legible: false })
})
