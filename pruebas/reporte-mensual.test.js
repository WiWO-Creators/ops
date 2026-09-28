/**
 * Pruebas de la lectura del reporte mensual del portal.
 *
 * Cubren lo que se lee mal sin dar error: una comparacion que dice «más» cuando bajo, un resumen
 * que llega como lista vacia, una tendencia que inventa una serie en cero para una pestaña que el
 * cliente no ve.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorProyecto, altoRelativo, enlaceAReunion, enlaceATarea, formatearHoras, frenteAlAnterior,
  leerTendenciaDelReporte, nombreDelMes, resumenDelReporte
} from '../src/dominio/reporte-mensual.ts'

const tarea = (id, proyecto) => ({
  id,
  name: `Tarea ${id}`,
  status: 5,
  due_date: null,
  completed_at: '2026-09-10T12:00:00Z',
  deliverable: false,
  deliverable_url: null,
  project: { id: proyecto, name: `Proyecto ${proyecto}` },
  milestone: null
})

test('el resumen vacio llega como lista y se lee como objeto sin claves', () => {
  assert.deepEqual(resumenDelReporte({ resumen: [] }), {})
  assert.deepEqual(resumenDelReporte({ resumen: { completadas: { actual: 1, anterior: 0 } } }), { completadas: { actual: 1, anterior: 0 } })
})

test('la comparacion contra el mes anterior dice subir, bajar o igual', () => {
  assert.equal(nombreDelMes('2026-08'), 'agosto')
  assert.equal(frenteAlAnterior({ actual: 7, anterior: 4 }, '2026-08'), '3 más que en agosto')
  assert.equal(frenteAlAnterior({ actual: 1, anterior: 4 }, '2026-08'), '3 menos que en agosto')
  assert.equal(frenteAlAnterior({ actual: 2, anterior: 2 }, '2026-08'), 'igual que en agosto')
  assert.equal(frenteAlAnterior({ actual: 7200, anterior: 3600 }, '2026-08', formatearHoras), '1 h más que en agosto')
})

test('las horas se escriben sin decimales y sin inventar horas en cero', () => {
  assert.equal(formatearHoras(0), '0 h')
  assert.equal(formatearHoras(-5), '0 h')
  assert.equal(formatearHoras(2700), '45 min')
  assert.equal(formatearHoras(3600), '1 h')
  assert.equal(formatearHoras(45000), '12 h 30 min')
})

test('agrupar por proyecto conserva el orden de llegada', () => {
  const grupos = agruparPorProyecto([tarea(1, 9), tarea(2, 3), tarea(3, 9)])

  assert.deepEqual(grupos.map((g) => g.proyecto.id), [9, 3])
  assert.deepEqual(grupos[0].tareas.map((t) => t.id), [1, 3])
})

test('los enlaces abren la ficha en su pestaña', () => {
  assert.equal(enlaceATarea(tarea(5, 2), 'tarea'), '/portal/proyectos/2?tab=tasks&tarea=5')
  assert.equal(enlaceAReunion({ id: 8, project: { id: 2, name: 'P' } }), '/portal/proyectos/2?tab=actas&acta=8')
})

test('la tendencia solo trae las series que llegaron', () => {
  assert.equal(leerTendenciaDelReporte(undefined), null)

  const sinReuniones = leerTendenciaDelReporte([
    { mes: '2026-08', completadas: 1, entregables: 0 },
    { mes: '2026-09', completadas: 7, entregables: 2 }
  ])
  assert.deepEqual(sinReuniones.series, ['completadas', 'entregables'])
  assert.equal(sinReuniones.maximo, 7)
  assert.equal(sinReuniones.vacia, false)
  assert.equal(sinReuniones.meses[1].rotulo, 'sep')

  const enCero = leerTendenciaDelReporte([{ mes: '2026-09', reuniones: 0 }])
  assert.deepEqual(enCero.series, ['reuniones'])
  assert.equal(enCero.vacia, true)
  assert.equal(enCero.maximo, 1)
})

test('una barra con valor se ve aunque sea chica, y el cero no se dibuja', () => {
  assert.equal(altoRelativo(0, 10), 0)
  assert.equal(altoRelativo(1, 100), 4)
  assert.equal(altoRelativo(10, 10), 100)
})
