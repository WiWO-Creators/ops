/**
 * Pruebas de la marca de comentarios en línea y de las reglas puras del panel de hilos (fase 10).
 *
 * Lo que se protege: que `span[data-hilo]` sobreviva al viaje HTML → Y.Doc → HTML que hace el servicio
 * de edición conjunta (si no, el hilo quedaría colgando de la nada), que las actas sin marca no
 * cambien de forma por haberla sumado al esquema, y que una ancla que el board no aceptaría no
 * llegue a escribirse en el texto.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import { generateHTML, generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import { htmlAYDoc, yDocAHtml } from '../servicios/en-vivo/adaptadores/acta.ts'
import { extensionesDeActa } from '../src/lib/en-vivo/extensiones-acta.ts'
import { rangosDeComentario } from '../src/lib/en-vivo/marca-comentario.ts'
import {
  citaDeAncla,
  conHilo,
  esAnclaValida,
  nuevaAncla,
  repartirHilos,
  revisarComentario,
  sinComentario
} from '../src/dominio/comentarios-acta.ts'

const SIN_MARCA = [
  '<h1>Reunión semanal</h1>',
  '<p>Texto con <strong>negrita</strong> y <a href="https://wiwo.me/ops">un enlace</a>.</p>',
  '<ul><li><p>Primero</p></li><li><p>Segundo</p></li></ul>',
  '<blockquote><p>Cita textual</p></blockquote>',
  '<hr>',
  '<p>Cierre</p>'
].join('')

function vuelta (html) {
  return yDocAHtml(htmlAYDoc(html))
}

test('el span con data-hilo sobrevive al viaje HTML → Y.Doc → HTML', () => {
  const html = vuelta('<p>Se acordó <span data-hilo="abc_123-X">entregar el lunes</span> sin falta.</p>')

  assert.equal(html, '<p>Se acordó <span data-hilo="abc_123-X">entregar el lunes</span> sin falta.</p>')
})

test('la marca convive con la negrita y con un enlace dentro del fragmento', () => {
  const html = vuelta('<p><span data-hilo="h1">Ver <strong>esto</strong> y <a href="https://wiwo.me">aquello</a></span></p>')

  // ProseMirror parte la marca en un tramo por cada formato distinto: la ancla se repite en cada uno.
  assert.equal(html.split('data-hilo="h1"').length - 1, 4, html)
  assert.ok(html.includes('<strong><span data-hilo="h1">esto</span></strong>'), html)
  assert.ok(html.includes('href="https://wiwo.me"'), html)
  assert.equal(citaDeAncla(html, 'h1'), 'Ver esto y aquello')
})

test('dos hilos sobre el mismo texto se conservan los dos', () => {
  const html = vuelta('<p><span data-hilo="uno">Una frase con <span data-hilo="dos">una palabra</span> comentada</span>.</p>')

  assert.ok(html.includes('data-hilo="uno"'), html)
  assert.ok(html.includes('data-hilo="dos"'), html)
})

test('un fragmento que cruza dos párrafos mantiene la misma ancla en los dos', () => {
  const html = vuelta('<p><span data-hilo="dos_p">Primero</span></p><p><span data-hilo="dos_p">Segundo</span></p>')

  assert.equal(html.split('data-hilo="dos_p"').length - 1, 2, html)
})

test('es estable: una segunda vuelta con marcas devuelve exactamente lo mismo', () => {
  const una = vuelta('<p>A <span data-hilo="x1">b</span> c <span data-hilo="y2">d</span>.</p>')

  assert.equal(vuelta(una), una)
})

test('un acta sin marca queda igual que con el esquema de antes de sumarla', () => {
  const anterior = [StarterKit.configure({
    link: { openOnClick: false, protocols: ['http', 'https', 'mailto'] },
    undoRedo: false
  })]
  const comoAntes = generateHTML(generateJSON(SIN_MARCA, anterior), anterior)

  assert.equal(vuelta(SIN_MARCA), comoAntes)
  assert.ok(!vuelta(SIN_MARCA).includes('data-hilo'))
})

test('el esquema con historial (editor de siempre) también trae la marca', () => {
  const esquema = getSchema(extensionesDeActa({ conHistorial: true }))

  assert.ok(esquema.marks.comentario !== undefined)
  assert.ok(getSchema(extensionesDeActa()).marks.comentario !== undefined)
})

test('un data-hilo que el board no aceptaría no se reconoce y el texto queda corriente', () => {
  for (const malo of ['', 'con espacio', 'a'.repeat(65), 'ñandú', 'x"onload=1']) {
    const html = vuelta(`<p>Antes <span data-hilo="${malo.replace(/"/g, '&quot;')}">texto</span> después</p>`)

    assert.ok(!html.includes('data-hilo'), `${malo} → ${html}`)
    assert.ok(html.includes('texto'), html)
  }
})

test('rangosDeComentario encuentra los tramos de un hilo y ninguno de otro', () => {
  const esquema = getSchema(extensionesDeActa())
  const documento = esquema.nodeFromJSON(generateJSON('<p>a <span data-hilo="uno">b</span> c <span data-hilo="dos">d</span></p>', extensionesDeActa()))

  assert.equal(rangosDeComentario(documento, 'uno').length, 1)
  assert.equal(rangosDeComentario(documento, 'dos').length, 1)
  assert.equal(rangosDeComentario(documento, 'tres').length, 0)
})

test('nuevaAncla cumple el patrón del board y no se repite', () => {
  const vistas = new Set()

  for (let i = 0; i < 200; i++) {
    const ancla = nuevaAncla()

    assert.ok(esAnclaValida(ancla), ancla)
    vistas.add(ancla)
  }

  assert.equal(vistas.size, 200)
  assert.equal(nuevaAncla(() => 0), 'AAAAAAAAAAAA')
  assert.ok(esAnclaValida(nuevaAncla(() => 0.999999)))
})

test('esAnclaValida rechaza lo que HtmlSeguro borraría', () => {
  for (const malo of ['', ' ', 'a b', 'a'.repeat(65), 'á', '<x>', null, undefined, 7]) {
    assert.equal(esAnclaValida(malo), false, String(malo))
  }

  assert.equal(esAnclaValida('a'.repeat(64)), true)
  assert.equal(esAnclaValida('A_b-9'), true)
})

test('revisarComentario recorta, y rechaza vacío o pasado de 2000', () => {
  assert.deepEqual(revisarComentario('  hola  '), { ok: true, texto: 'hola' })
  assert.equal(revisarComentario('   ').ok, false)
  assert.equal(revisarComentario('a'.repeat(2000)).ok, true)
  assert.equal(revisarComentario('a'.repeat(2001)).ok, false)
})

const hilo = (id, resuelto = false, comentarios = [id]) => ({
  id,
  anchor: `a${id}`,
  resolved: resuelto,
  resolved_at: null,
  comments: comentarios.map((c) => ({
    id: c, staff_id: 1, staff_name: 'Ana', staff_image: null, content: 'x', mentions: [], mine: true, date_added: '2026-10-15T10:00:00Z', date_edited: null
  }))
})

test('repartirHilos separa abiertos y resueltos sin reordenar', () => {
  const { abiertos, resueltos } = repartirHilos([hilo(1), hilo(2, true), hilo(3)])

  assert.deepEqual(abiertos.map((h) => h.id), [1, 3])
  assert.deepEqual(resueltos.map((h) => h.id), [2])
})

test('conHilo reemplaza el existente o agrega el nuevo', () => {
  const base = [hilo(1), hilo(2)]

  assert.deepEqual(conHilo(base, hilo(2, true)).map((h) => h.resolved), [false, true])
  assert.deepEqual(conHilo(base, hilo(3)).map((h) => h.id), [1, 2, 3])
  assert.equal(base.length, 2)
})

test('sinComentario borra el hilo entero si es la raíz y solo la respuesta si no', () => {
  const base = [hilo(1, false, [1, 5, 6]), hilo(2)]

  assert.deepEqual(sinComentario(base, 1).map((h) => h.id), [2])
  assert.deepEqual(sinComentario(base, 5)[0].comments.map((c) => c.id), [1, 6])
})

test('citaDeAncla devuelve el texto comentado, con markup y entidades adentro', () => {
  const html = '<p>Hola <span data-hilo="k1">el <strong>plazo</strong> &amp; el <span data-hilo="k2">costo</span></span> final</p>'

  assert.equal(citaDeAncla(html, 'k1'), 'el plazo & el costo')
  assert.equal(citaDeAncla(html, 'k2'), 'costo')
})

test('citaDeAncla junta los tramos de un fragmento que cruza párrafos y devuelve null si no está', () => {
  const html = '<p><span data-hilo="z">Primero</span></p><p><span data-hilo="z">Segundo</span></p>'

  assert.equal(citaDeAncla(html, 'z'), 'Primero Segundo')
  assert.equal(citaDeAncla('<p><span data-hilo="z">ho</span><strong><span data-hilo="z">la</span></strong></p>', 'z'), 'hola')
  assert.equal(citaDeAncla(html, 'otra'), null)
  assert.equal(citaDeAncla(html, 'mala ancla'), null)
})
