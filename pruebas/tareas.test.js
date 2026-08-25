/**
 * Pestaña de Tareas: fila vencida, columnas de campos personalizados y acciones masivas.
 *
 * Las tres se rompen en silencio: una fila vencida que no se marca no avisa de nada, una columna de
 * campo personalizado de mas llena la tabla de datos que el panel viejo nunca mostro, y una accion
 * masiva ofrecida sin permiso es un 403 con veinte tareas seleccionadas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accionesMasivasPermitidas,
  alternarSeleccion,
  camposDeTabla,
  estaVencida,
  valorDeAccionMasiva,
  valorDeCampo
} from '../src/componentes/proyecto/tareas.ts'

const HOY = new Date(2026, 1, 25)

test('una tarea vencida y no completa se marca', () => {
  assert.equal(estaVencida({ due_date: '2026-02-24', status: 4 }, HOY), true)
})

test('la que vence hoy todavia no esta vencida', () => {
  assert.equal(estaVencida({ due_date: '2026-02-25', status: 4 }, HOY), false)
})

test('una tarea completa nunca se marca, aunque haya vencido', () => {
  assert.equal(estaVencida({ due_date: '2020-01-01', status: 5 }, HOY), false)
})

test('sin fecha de vencimiento no hay marca', () => {
  assert.equal(estaVencida({ due_date: null, status: 4 }, HOY), false)
  assert.equal(estaVencida({ due_date: 'no es una fecha', status: 4 }, HOY), false)
})

const CAMPOS = [
  { id: 6, slug: 'tasks_link_de_drive', name: 'Link de Drive', type: 'link', options: null, required: false, order: 2, default_value: null, only_admin: false, show_on_table: false },
  { id: 3, slug: 'tasks_area_de_la_compania', name: 'Área de la compañía', type: 'multiselect', options: [], required: true, order: 1, default_value: null, only_admin: false, show_on_table: true },
  { id: 9, slug: 'tasks_tipo', name: 'Tipo', type: 'select', options: [], required: false, order: 1, default_value: null, only_admin: false, show_on_table: true }
]

test('solo los campos con show_on_table son columna, ordenados por order y nombre', () => {
  assert.deepEqual(camposDeTabla(CAMPOS).map((c) => c.slug), ['tasks_area_de_la_compania', 'tasks_tipo'])
})

test('un multiselect se muestra unido y un campo ausente no rompe la celda', () => {
  const proceso = {
    custom_fields: [
      { id: 3, slug: 'tasks_area_de_la_compania', name: 'Área', type: 'multiselect', value: ['Content Studio', 'Analytics'] },
      { id: 9, slug: 'tasks_tipo', name: 'Tipo', type: 'select', value: null }
    ]
  }

  assert.equal(valorDeCampo(proceso, 'tasks_area_de_la_compania'), 'Content Studio, Analytics')
  assert.equal(valorDeCampo(proceso, 'tasks_tipo'), '')
  assert.equal(valorDeCampo(proceso, 'no_existe'), '')
  assert.equal(valorDeCampo({}, 'tasks_tipo'), '')
})

test('eliminar en masa solo se ofrece con delete, el resto con edit', () => {
  assert.deepEqual(accionesMasivasPermitidas(['view']).map((a) => a.clave), [])
  assert.deepEqual(accionesMasivasPermitidas(['edit']).map((a) => a.clave),
    ['status', 'priority', 'assignees', 'milestone', 'billable', 'tags'])
  assert.deepEqual(accionesMasivasPermitidas(['delete']).map((a) => a.clave), ['delete'])
})

test('el valor de la accion masiva llega tipado como lo espera el contrato', () => {
  assert.equal(valorDeAccionMasiva('estado', '5'), 5)
  assert.equal(valorDeAccionMasiva('booleano', 'si'), true)
  assert.equal(valorDeAccionMasiva('booleano', 'no'), false)
  assert.deepEqual(valorDeAccionMasiva('personas', '12, 45'), [12, 45])
  assert.deepEqual(valorDeAccionMasiva('etiquetas', ' urgente , '), ['urgente'])
  assert.equal(valorDeAccionMasiva('ninguno', ''), null)
  assert.equal(valorDeAccionMasiva('estado', ''), null, 'sin elegir nada no hay nada que mandar')
})

test('alternarSeleccion no muta la seleccion anterior', () => {
  const antes = [1, 2]
  const despues = alternarSeleccion(antes, 3)

  assert.deepEqual(antes, [1, 2])
  assert.deepEqual(despues, [1, 2, 3])
  assert.deepEqual(alternarSeleccion(despues, 2), [1, 3])
})
