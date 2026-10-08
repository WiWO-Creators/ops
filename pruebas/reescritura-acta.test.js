/**
 * Pruebas de la petición de reescritura del Meeting Paper.
 *
 * Lo que se protege: que el fragmento viaje como HTML (no se pierdan los rótulos que lee el parser de
 * acuerdos), que sin pedido válido no salga ninguna petición que gaste IA, y que los topes coincidan
 * con los de la API.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarReescritura,
  LARGO_MAXIMO_CONTEXTO,
  LARGO_MAXIMO_INSTRUCCION,
  textoDeFragmento
} from '../src/dominio/reescritura-acta.ts'

test('un atajo manda el fragmento en HTML con su acta', () => {
  const resultado = armarReescritura({ tipo: 'accion', accion: 'acortar' }, '<ul><li>Responsable: Ana</li></ul>', '', 7)

  assert.equal(resultado.ok, true)
  assert.deepEqual(resultado.cuerpo, { texto: '<ul><li>Responsable: Ana</li></ul>', acta_id: 7, accion: 'acortar' })
})

test('la instrucción libre viaja recortada y sin acción', () => {
  const resultado = armarReescritura({ tipo: 'instruccion', instruccion: '  hazlo más formal  ' }, '<p>Hola</p>', 'Sección', 3)

  assert.equal(resultado.ok, true)
  assert.equal(resultado.cuerpo.instruccion, 'hazlo más formal')
  assert.equal(resultado.cuerpo.accion, undefined)
  assert.equal(resultado.cuerpo.contexto, 'Sección')
})

test('sin texto, con instrucción vacía o demasiado larga no sale petición', () => {
  assert.equal(armarReescritura({ tipo: 'accion', accion: 'alargar' }, '<p> </p>', '', 1).ok, false)
  assert.equal(armarReescritura({ tipo: 'instruccion', instruccion: '   ' }, '<p>x</p>', '', 1).ok, false)
  assert.equal(
    armarReescritura({ tipo: 'instruccion', instruccion: 'a'.repeat(LARGO_MAXIMO_INSTRUCCION + 1) }, '<p>x</p>', '', 1).ok,
    false
  )
})

test('el contexto se recorta al tope de la API', () => {
  const resultado = armarReescritura({ tipo: 'accion', accion: 'resumir' }, '<p>x</p>', 'c'.repeat(LARGO_MAXIMO_CONTEXTO + 500), 1)

  assert.equal(resultado.cuerpo.contexto.length, LARGO_MAXIMO_CONTEXTO)
})

test('el texto del antes y después separa párrafos e ítems en líneas', () => {
  assert.equal(textoDeFragmento('<p>Uno &amp; dos</p><ul><li>A</li><li>B</li></ul>'), 'Uno & dos\nA\nB')
})
