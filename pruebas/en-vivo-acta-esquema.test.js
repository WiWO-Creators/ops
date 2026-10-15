/**
 * Pruebas del esquema del Meeting Paper en edición conjunta.
 *
 * Lo que se protege: que el HTML del board pase a Yjs y vuelva sin perder ni deformar lo que el
 * editor sabe hacer, y que una segunda vuelta no cambie nada. Si esto se rompe, el servicio le
 * devolvería al board un acta distinta de la que se editó, o guardaría de nuevo sin que nadie
 * haya tocado nada.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlAYDoc, yDocAHtml } from '../servicios/en-vivo/adaptadores/acta.ts'

const ACTA = [
  '<h1>Reunión semanal</h1>',
  '<h2>Acuerdos</h2>',
  '<h3>Detalle</h3>',
  '<p>Texto con <strong>negrita</strong> y <a href="https://wiwo.me/ops">un enlace</a>.</p>',
  '<ul><li><p>Primero</p></li><li><p>Segundo</p></li></ul>',
  '<ol><li><p>Uno</p></li><li><p>Dos</p></li></ol>',
  '<blockquote><p>Cita textual</p></blockquote>',
  '<hr>',
  '<p>Cierre</p>'
].join('')

function vuelta (html) {
  return yDocAHtml(htmlAYDoc(html))
}

test('HTML → Y.Doc → HTML conserva títulos, listas, cita, regla, enlace y negrita', () => {
  const html = vuelta(ACTA)

  for (const fragmento of [
    '<h1>Reunión semanal</h1>',
    '<h2>Acuerdos</h2>',
    '<h3>Detalle</h3>',
    '<strong>negrita</strong>',
    'href="https://wiwo.me/ops"',
    '<ul><li><p>Primero</p></li><li><p>Segundo</p></li></ul>',
    '<ol><li><p>Uno</p></li><li><p>Dos</p></li></ol>',
    '<blockquote><p>Cita textual</p></blockquote>',
    '<hr>',
    '<p>Cierre</p>'
  ]) {
    assert.ok(html.includes(fragmento), `falta ${fragmento} en ${html}`)
  }
})

test('es estable: una segunda vuelta devuelve exactamente lo mismo', () => {
  const una = vuelta(ACTA)

  assert.equal(vuelta(una), una)
})

test('un acta vacía da un documento con un párrafo vacío y también es estable', () => {
  const una = vuelta('')

  assert.equal(una, '<p></p>')
  assert.equal(vuelta(una), una)
})

test('un enlace con protocolo peligroso no sobrevive al esquema', () => {
  const html = vuelta('<p><a href="javascript:alert(1)">peligro</a></p>')

  assert.ok(!html.includes('javascript:'), html)
  assert.ok(html.includes('peligro'))
})

test('dos documentos cargados del mismo HTML dicen lo mismo', () => {
  assert.equal(yDocAHtml(htmlAYDoc(ACTA)), yDocAHtml(htmlAYDoc(ACTA)))
})
