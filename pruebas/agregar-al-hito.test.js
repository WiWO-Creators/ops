/**
 * Pruebas del "+" de una columna del kanban de Hitos.
 *
 * Lo que se rompe en silencio aca son tres cosas: que el listado de candidatas pida `milestone_id=0`
 * —con cualquier otro valor trae tareas que YA tienen hito y "sumarlas" seria sacarlas del suyo—,
 * que el alta mande `milestone` en el mismo `POST` en vez de crear la tarea suelta, y que el
 * movimiento viaje con `columna_completa` vacia: una lista incompleta hace que el backend empuje al
 * fondo todo lo que no le mandaron.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuerpoDeAltaEnHito,
  filtrarCandidatas,
  movimientoAlHito,
  rutaTareasSinHito,
  validarAltaEnHito
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

test('el alta exige nombre y valida el formato de la fecha', () => {
  assert.equal(validarAltaEnHito({ nombre: '   ', prioridad: '2', vencimiento: '' }), 'La tarea necesita un nombre.')
  assert.equal(validarAltaEnHito({ nombre: 'Algo', prioridad: '2', vencimiento: '12-03-2026' }), 'Usa el formato AAAA-MM-DD en el vencimiento.')
  assert.equal(validarAltaEnHito({ nombre: 'Algo', prioridad: '2', vencimiento: '' }), null)
  assert.equal(validarAltaEnHito({ nombre: 'Algo', prioridad: '2', vencimiento: '2026-03-12' }), null)
})

test('el alta cuelga la tarea del hito y del Espacio en un solo POST', () => {
  const cuerpo = cuerpoDeAltaEnHito(
    { nombre: '  Revisar el contrato  ', prioridad: '3', vencimiento: '2026-03-12' },
    80,
    12
  )

  assert.deepEqual(cuerpo, {
    name: 'Revisar el contrato',
    rel_type: 'project',
    rel_id: 80,
    milestone: 12,
    priority: 3,
    due_date: '2026-03-12'
  })
})

test('el alta omite lo que no se completo en vez de mandar vacios', () => {
  const cuerpo = cuerpoDeAltaEnHito({ nombre: 'Algo', prioridad: '', vencimiento: '' }, 80, 12)

  assert.deepEqual(cuerpo, { name: 'Algo', rel_type: 'project', rel_id: 80, milestone: 12 })
})

test('sumar una tarea suelta la deja primera y no reordena la columna', () => {
  assert.deepEqual(movimientoAlHito(12), { columna: 12, posicion: 1, columna_completa: [] })
})
