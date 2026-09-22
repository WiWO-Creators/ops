/**
 * Ventana por defecto del Gantt: hoy y las dos semanas que siguen.
 *
 * Se comprueban los bordes del corte —la tarea que empezo antes y sigue abierta, la que termina justo
 * el ultimo dia, la que empieza al dia siguiente— porque ahi un error de uno hace desaparecer trabajo
 * sin que la pantalla avise.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_VENTANA_GANTT,
  contarFueraDeVentanaDeGantt,
  diaDeFecha,
  recortarGanttAVentana,
  ventanaDeGantt
} from '../src/componentes/proyecto/gantt.ts'

function tarea (id, start, end) {
  return { id, name: `T${String(id)}`, start, end, progress: 0, status: 1, color: null, dependencies: [] }
}

function grupo (id, tareas) {
  return { id, nombre: id, grupo: true, start: null, end: null, tareas }
}

const HOY = '2026-09-22'

test('la ventana va de hoy a trece dias despues', () => {
  const ventana = ventanaDeGantt(HOY)

  assert.equal(DIAS_VENTANA_GANTT, 14)
  assert.equal(ventana.inicio, diaDeFecha(HOY))
  assert.equal(ventana.fin, diaDeFecha('2026-10-05'))
  assert.equal(ventana.dias, 14)
})

test('sin una fecha legible no hay ventana', () => {
  assert.equal(ventanaDeGantt(''), null)
  assert.equal(ventanaDeGantt('mañana'), null)
})

test('entran las tareas con algun dia dentro y salen las de antes, despues y sin fechas', () => {
  const ventana = ventanaDeGantt(HOY)
  const grupos = [
    grupo('a', [
      tarea(1, '2026-09-01', '2026-09-30'), // empezo antes y sigue abierta
      tarea(2, '2026-09-01', '2026-09-21'), // termino ayer
      tarea(3, '2026-10-05', '2026-10-20'), // empieza el ultimo dia
      tarea(4, '2026-10-06', '2026-10-20'), // empieza el dia siguiente
      tarea(5, null, null)
    ]),
    grupo('b', [tarea(6, null, '2026-12-01')])
  ]

  const visibles = recortarGanttAVentana(grupos, ventana)

  assert.deepEqual(visibles.map((g) => g.id), ['a'])
  assert.deepEqual(visibles[0].tareas.map((t) => t.id), [1, 3])
  assert.equal(contarFueraDeVentanaDeGantt(grupos, ventana), 4)
  // No muta la entrada.
  assert.equal(grupos[0].tareas.length, 5)
})

test('una tarea repetida en dos grupos cuenta una sola vez fuera de la ventana', () => {
  const ventana = ventanaDeGantt(HOY)
  const repetida = tarea(7, '2027-01-01', '2027-01-05')

  assert.equal(contarFueraDeVentanaDeGantt([grupo('x', [repetida]), grupo('y', [repetida])], ventana), 1)
  assert.deepEqual(recortarGanttAVentana([], ventana), [])
})
