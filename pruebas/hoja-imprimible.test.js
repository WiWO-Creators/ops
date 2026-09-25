/**
 * Pruebas de la hoja de supervisión en papel.
 *
 * Lo que se clava: que ningún texto escrito por alguien llegue al documento como HTML vivo, que las
 * casillas salgan marcadas según la revisión digital, y que el pie lleve la firma y, si la hay, el
 * sello.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escaparHtml, htmlDeHojaImprimible } from '../src/dominio/hoja-imprimible.ts'

/** Una hoja con una Tarea marcada OK y otra sin marcar, con nombres hostiles. */
function hoja (firma = null) {
  return {
    fecha: '2026-09-25',
    puede_editar: false,
    supervisor: { staffid: 1, nombre: 'Ana <b>Ríos</b>', escalon: 'gerencia' },
    firma,
    totales: { tareas: 2, atrasadas: 1, revisadas: 1, ok: 1, no_ok: 0 },
    clientes: [{
      client_id: 1,
      company: 'Acme & "Cía"',
      tareas: [
        {
          id: 10,
          patente: 'ESP-001-01',
          name: '<img src=x onerror=alert(1)>',
          status: 1,
          duedate: '2026-09-20',
          dias_atraso: 5,
          proyecto: { id: 1, name: 'Web <script>' },
          asignados: [{ staffid: 2, nombre: "O'Brien" }],
          revision: { estado: 'ok', nota: 'revisada </td>', staffid: 1, nombre: 'Ana', marcado_en: '2026-09-25T12:00:00Z' }
        },
        {
          id: 11,
          patente: null,
          name: 'Otra',
          status: 1,
          duedate: '2026-09-25',
          dias_atraso: 0,
          proyecto: null,
          asignados: [],
          revision: null
        }
      ]
    }]
  }
}

test('escapa los cinco caracteres con significado en HTML', () => {
  assert.equal(escaparHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  assert.equal(escaparHtml(null), '')
  assert.equal(escaparHtml(3), '3')
})

test('ningún texto llega como HTML vivo', () => {
  const html = htmlDeHojaImprimible(hoja())

  assert.doesNotMatch(html, /<img/)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<b>Ríos/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /Acme &amp; &quot;Cía&quot;/)
  assert.match(html, /O&#39;Brien/)
  assert.match(html, /revisada &lt;\/td&gt;/)
})

test('las columnas, el atraso y las casillas según la revisión', () => {
  const html = htmlDeHojaImprimible(hoja())

  for (const columna of ['Tarea', 'Proyecto', 'Responsable', 'Vence', 'Atraso', 'Lista', 'No lista', 'Observaciones']) {
    assert.match(html, new RegExp(`<th[^>]*>${columna}</th>`))
  }

  assert.match(html, /5 días de atraso/)
  assert.match(html, /Vence hoy/)
  // Dos filas, dos casillas cada una: solo la "Lista" de la primera va marcada.
  assert.equal((html.match(/class="casilla marcada"/g) ?? []).length, 1)
  assert.equal((html.match(/class="casilla"/g) ?? []).length, 3)
  assert.match(html, /aria-label="Lista \(marcada\)"/)
  assert.match(html, /size: A4/)
})

test('el pie lleva la firma, y el sello solo si está firmada', () => {
  const abierta = htmlDeHojaImprimible(hoja())

  assert.match(abierta, /<p>Firma<\/p>/)
  assert.doesNotMatch(abierta, /Firmado digitalmente/)

  const firmada = htmlDeHojaImprimible(hoja({ staffid: 1, nombre: 'Ana Ríos', firmado_en: '2026-09-25T18:30:00-03:00' }))

  assert.match(firmada, /Firmado digitalmente por Ana Ríos el /)
})

test('una hoja sin clientes dice que no hay tareas', () => {
  const vacia = { ...hoja(), clientes: [], totales: { tareas: 0, atrasadas: 0, revisadas: 0, ok: 0, no_ok: 0 } }

  assert.match(htmlDeHojaImprimible(vacia), /Sin tareas por supervisar/)
})
