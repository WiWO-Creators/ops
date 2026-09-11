/**
 * Pruebas del "+" de una columna del kanban de Hitos.
 *
 * Lo que se rompe en silencio aca son dos cosas: que el listado de candidatas pida `milestone_id=0`
 * —con cualquier otro valor trae tareas que YA tienen hito y "sumarlas" seria sacarlas del suyo—,
 * y que el movimiento viaje con `columna_completa` vacia: una lista incompleta hace que el backend
 * empuje al fondo todo lo que no le mandaron.
 *
 * El alta ya no se prueba aca: la hace `AltaRapidaProceso`, que es el unico camino de creacion y el
 * unico que exige la descripcion.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filtrarCandidatas,
  movimientoAlHito,
  rutaTareasSinHito
} from '../src/componentes/proyecto/agregar-al-hito.ts'

test('la ruta de candidatas acota al Espacio y pide solo las que no tienen hito', () => {
  const ruta = rutaTareasSinHito(80)

  assert.ok(ruta.startsWith('tasks?'))

  const params = new URLSearchParams(ruta.slice('tasks?'.length))

  assert.equal(params.get('filter[project_id]'), '80')
  assert.equal(params.get('filter[milestone_id]'), '0')
  assert.equal(params.get('per_page'), '100')
})

test('el buscador ignora mayusculas y acentos', () => {
  const tareas = [
    { id: 1, name: 'Rehacer la Gráfica de septiembre' },
    { id: 2, name: 'Llamar al cliente' }
  ]

  assert.deepEqual(filtrarCandidatas(tareas, 'grafica').map((t) => t.id), [1])
  assert.deepEqual(filtrarCandidatas(tareas, 'CLIENTE').map((t) => t.id), [2])
})

test('el buscador vacio o con espacios devuelve todas, sin copiar de mas', () => {
  const tareas = [{ id: 1, name: 'Una' }]

  assert.equal(filtrarCandidatas(tareas, ''), tareas)
  assert.equal(filtrarCandidatas(tareas, '   '), tareas)
})

test('el buscador sin coincidencias devuelve una lista vacia, no todas', () => {
  const tareas = [{ id: 1, name: 'Una' }]

  assert.deepEqual(filtrarCandidatas(tareas, 'zzz'), [])
})

test('sumar una tarea suelta la deja primera y no reordena la columna', () => {
  assert.deepEqual(movimientoAlHito(12), { columna: 12, posicion: 1, columna_completa: [] })
})
