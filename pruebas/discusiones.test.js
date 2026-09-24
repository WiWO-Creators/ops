/**
 * Hilo de comentarios de una Tarea y Discusiones del Proyecto.
 *
 * Lo que se prueba es lo que se rompe en silencio: una respuesta que se pierde porque su padre no
 * llego, el HTML de Perfex pintado como texto con sus etiquetas a la vista, la marca de adjunto
 * colada en la vista previa, y lo que se escribe viajando sin escapar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarHilos,
  autorBreve,
  extractoDeComentario,
  htmlDeComentario,
  textoDeComentario
} from '../src/componentes/proyecto/discusiones.ts'
import { comentarioParaMostrar } from '../src/componentes/proyecto/tareas.ts'

function comentario (id, parentId = null, extra = {}) {
  return {
    id,
    task_id: 7,
    parent_id: parentId,
    content: `<p>Comentario ${id}</p>`,
    date_added: '2026-09-24T12:00:00Z',
    staff: { id: 1, full_name: 'Grecia Vallenilla' },
    contact: null,
    ...extra
  }
}

test('las respuestas quedan debajo de su raiz y en su orden', () => {
  const hilos = armarHilos([comentario(1), comentario(2), comentario(3, 1), comentario(4, 1), comentario(5, 2)])

  assert.deepEqual(hilos.map((h) => h.raiz.id), [1, 2])
  assert.deepEqual(hilos[0].respuestas.map((c) => c.id), [3, 4])
  assert.deepEqual(hilos[1].respuestas.map((c) => c.id), [5])
})

test('una respuesta sin su padre se muestra como raiz, no se pierde', () => {
  const hilos = armarHilos([comentario(1), comentario(9, 404)])

  assert.deepEqual(hilos.map((h) => h.raiz.id), [1, 9])
})

test('una respuesta a una respuesta no se cuelga de nadie invisible', () => {
  const hilos = armarHilos([comentario(1), comentario(2, 1), comentario(3, 2)])

  assert.deepEqual(hilos.map((h) => h.raiz.id), [1, 3])
  assert.deepEqual(hilos[0].respuestas.map((c) => c.id), [2])
})

test('sin comentarios no hay hilos', () => {
  assert.deepEqual(armarHilos([]), [])
})

test('el HTML de Perfex se lee como texto, con las menciones y sin la marca de adjunto', () => {
  const html = '<p>Holaa adjunto <span class="mention" data-mention-id="16">@Renata Valenzuela</span>&nbsp;</p>[task_attachment]'

  assert.deepEqual(textoDeComentario(html), { texto: 'Holaa adjunto @Renata Valenzuela', conAdjunto: true })
  assert.deepEqual(textoDeComentario('<p>Uno</p><p>Dos</p>'), { texto: 'Uno\n\nDos', conAdjunto: false })
})

test('las entidades numericas de html_purify se leen como letras, sin decodificar dos veces', () => {
  assert.equal(textoDeComentario('<p>segunda l&#237;nea &#xE9; &amp;lt;b&amp;gt;</p>').texto, 'segunda línea é &lt;b&gt;')
  assert.equal(textoDeComentario('<p>&noexiste; &#0;</p>').texto, '&noexiste; &#0;')
})

test('el extracto va en una linea y se corta con puntos suspensivos', () => {
  assert.equal(extractoDeComentario('<p>Uno</p><p>Dos</p>'), 'Uno Dos')
  assert.equal(extractoDeComentario(`<p>${'a'.repeat(200)}</p>`, 20), `${'a'.repeat(19)}…`)
  assert.equal(extractoDeComentario('[task_attachment]'), 'Adjuntó un archivo')
  assert.equal(extractoDeComentario(''), '')
})

test('lo que se escribe viaja escapado, con parrafos y saltos', () => {
  assert.equal(htmlDeComentario('  hola <b>equipo</b> & "cliente"  '), '<p>hola &lt;b&gt;equipo&lt;/b&gt; &amp; &quot;cliente&quot;</p>')
  assert.equal(htmlDeComentario('uno\ndos\n\n\ntres'), '<p>uno<br>dos</p><p>tres</p>')
  assert.equal(htmlDeComentario('a\r\nb'), '<p>a<br>b</p>')
  assert.equal(htmlDeComentario('   \n  '), '')
})

test('ida y vuelta: lo que se escribe se lee igual', () => {
  const escrito = 'Revisé el <informe>.\nFalta la firma.\n\nOk & listo'

  assert.equal(textoDeComentario(htmlDeComentario(escrito)).texto, escrito)
})

test('el autor breve es el nombre de pila, del equipo o del cliente', () => {
  assert.equal(autorBreve({ staff: { id: 1, full_name: 'Grecia Vallenilla' }, contact: null }), 'Grecia')
  assert.equal(autorBreve({ staff: null, contact: { id: 3, full_name: 'Carla' } }), 'Carla')
  assert.equal(autorBreve({ staff: null, contact: null }), null)
  assert.equal(autorBreve({ staff: { id: 1, full_name: '  ' }, contact: null }), null)
})

test('la tarjeta recibe texto legible y sabe si habia adjunto', () => {
  const tarjeta = comentarioParaMostrar(comentario(1, null, { content: '<p>Listo</p>[task_attachment]' }))

  assert.equal(tarjeta.content, 'Listo')
  assert.equal(tarjeta.con_adjunto, true)
  assert.equal(tarjeta.author.es_cliente, false)
})
