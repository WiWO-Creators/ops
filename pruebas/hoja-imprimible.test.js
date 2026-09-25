/**
 * Pruebas de la hoja de supervisión en papel.
 *
 * Lo que se clava: que ningún texto escrito por alguien llegue al documento como HTML vivo, que las
 * casillas salgan marcadas según la revisión digital, que la columna "Revisión equipo" aparezca solo
 * cuando hace falta, que la agrupación elegida se respete, y que el pie lleve las dos firmas y, si los
 * hay, sus sellos.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escaparHtml, htmlDeHojaImprimible } from '../src/dominio/hoja-imprimible.ts'

/** Una hoja con una Tarea marcada OK y otra sin marcar, con nombres hostiles. */
function hoja (firma = null, confirmacion = null) {
  return {
    fecha: '2026-09-25',
    puede_editar: false,
    puede_confirmar: false,
    supervisor: { staffid: 1, nombre: 'Ana <b>Ríos</b>', escalon: 'gerencia' },
    firma,
    confirmacion,
    totales: { tareas: 2, atrasadas: 1, completadas: 0, revisadas: 1, ok: 1, no_ok: 0 },
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
          completada: false,
          completada_en: null,
          origen: ['cliente'],
          proyecto: { id: 1, name: 'Web <script>' },
          asignados: [{ staffid: 2, nombre: "O'Brien" }],
          revision: { estado: 'ok', nota: 'revisada </td>', staffid: 1, nombre: 'Ana', marcado_en: '2026-09-25T12:00:00Z' },
          revisiones_equipo: []
        },
        {
          id: 11,
          patente: null,
          name: 'Otra',
          status: 1,
          duedate: '2026-09-25',
          dias_atraso: 0,
          completada: false,
          completada_en: null,
          origen: ['equipo'],
          proyecto: null,
          asignados: [],
          revision: null,
          revisiones_equipo: []
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

  assert.match(abierta, /<p>Firma del supervisor<\/p>/)
  assert.match(abierta, /<p>Confirmación del jefe<\/p>/)
  assert.doesNotMatch(abierta, /Firmado digitalmente/)
  assert.doesNotMatch(abierta, /Confirmado digitalmente/)

  const firma = { staffid: 1, nombre: 'Ana Ríos', firmado_en: '2026-09-25T18:30:00-03:00' }
  const firmada = htmlDeHojaImprimible(hoja(firma))

  assert.match(firmada, /Firmado digitalmente por Ana Ríos el /)

  const confirmada = htmlDeHojaImprimible(hoja(firma, {
    estado: 'confirmada', staffid: 9, nombre: 'Bruno <i>Cabral</i>', nota: null, en: '2026-09-25T19:00:00-03:00'
  }))

  assert.match(confirmada, /Confirmado digitalmente por Bruno &lt;i&gt;Cabral&lt;\/i&gt; el /)

  const devuelta = htmlDeHojaImprimible(hoja(null, {
    estado: 'devuelta', staffid: 9, nombre: 'Bruno Cabral', nota: 'Falta', en: '2026-09-25T19:00:00-03:00'
  }))

  assert.doesNotMatch(devuelta, /Confirmado digitalmente/)
})

test('la columna Revisión equipo aparece solo si alguna Tarea la trae, escapada', () => {
  assert.doesNotMatch(htmlDeHojaImprimible(hoja()), /Revisión equipo/)

  const conEquipo = hoja()
  conEquipo.clientes[0].tareas[0].revisiones_equipo = [
    { staffid: 4, nombre: 'Diego <u>Sosa</u>', estado: 'no_ok', nota: 'falta <b>anexo</b>' }
  ]
  const html = htmlDeHojaImprimible(conEquipo)

  assert.match(html, /<th class="equipo">Revisión equipo<\/th>/)
  assert.match(html, /✘ No OK · Diego &lt;u&gt;Sosa&lt;\/u&gt;/)
  assert.match(html, /falta &lt;b&gt;anexo&lt;\/b&gt;/)
  // La fila sin revisiones del equipo lleva su celda igual, con un guion.
  assert.equal((html.match(/<td class="equipo">/g) ?? []).length, 2)
})

test('la completada dice "Completada" con la hora en la columna del atraso', () => {
  const conCerrada = hoja()
  Object.assign(conCerrada.clientes[0].tareas[1], { completada: true, completada_en: '2026-09-25 11:40:00', status: 5 })

  assert.match(htmlDeHojaImprimible(conCerrada), /<td class="atraso">Completada 11:40<\/td>/)
})

test('una Tarea con origen vacío se imprime sin romperse', () => {
  const conHuerfana = hoja()
  conHuerfana.clientes[0].tareas[0].origen = []

  const html = htmlDeHojaImprimible(conHuerfana, 'persona')

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /undefined|null/)
})

test('respeta la agrupación elegida: por persona, con Sin asignar al final', () => {
  const html = htmlDeHojaImprimible(hoja(), 'persona')
  const titulos = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1])

  assert.deepEqual(titulos, ['O&#39;Brien', 'Sin asignar'])
  assert.match(html, /Agrupada por persona/)
  assert.match(htmlDeHojaImprimible(hoja()), /Agrupada por cliente/)
})

test('una hoja sin clientes dice que no hay tareas', () => {
  const vacia = { ...hoja(), clientes: [], totales: { tareas: 0, atrasadas: 0, completadas: 0, revisadas: 0, ok: 0, no_ok: 0 } }

  assert.match(htmlDeHojaImprimible(vacia), /Sin tareas por supervisar/)
})
