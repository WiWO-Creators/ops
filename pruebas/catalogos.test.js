/**
 * Pruebas del orden de las columnas del tablero.
 *
 * El backend devuelve `task_statuses` ordenado por su campo `order`, NO por `id`: el orden real en
 * produccion es 1, 4, 3, 2, 5. Ordenar por id da un tablero equivocado, y es el error mas facil de
 * cometer — por eso tiene prueba propia.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnasDelTablero, listaDe, nombreDe, opcionesDeFiltros } from '../src/datos/catalogos.ts'

const LOOKUPS = {
  task_statuses: [
    { id: 1, name: 'Por iniciar', order: 1 },
    { id: 4, name: 'En progreso', order: 2 },
    { id: 3, name: 'Testear', order: 3 },
    { id: 2, name: 'Espera de respuesta', order: 4 },
    { id: 5, name: 'Completo', order: 5 }
  ]
}

test('las columnas salen por order, no por id', () => {
  const ids = columnasDelTablero(LOOKUPS, 'task_statuses').map((c) => c.id)

  assert.deepEqual(ids, [1, 4, 3, 2, 5])
})

test('una lista desordenada se ordena por order', () => {
  const revueltas = { task_statuses: [...LOOKUPS.task_statuses].reverse() }

  assert.deepEqual(columnasDelTablero(revueltas, 'task_statuses').map((c) => c.id), [1, 4, 3, 2, 5])
})

test('sin campo order se respeta el orden en que vino', () => {
  const sinOrder = { estados: [{ id: 9, name: 'B' }, { id: 2, name: 'A' }] }

  assert.deepEqual(columnasDelTablero(sinOrder, 'estados').map((c) => c.id), [9, 2])
})

test('una clave inexistente da lista vacia, no una pantalla rota', () => {
  assert.deepEqual(listaDe(LOOKUPS, 'no_existe'), [])
  assert.deepEqual(columnasDelTablero(LOOKUPS, 'no_existe'), [])
})

test('un id sin correspondencia se muestra como tal', () => {
  assert.equal(nombreDe(LOOKUPS.task_statuses, 4), 'En progreso')
  assert.equal(nombreDe(LOOKUPS.task_statuses, 99), '#99')
})

test('las opciones de filtro salen de lookups, con el id como valor', () => {
  const definicion = {
    filtros: [
      { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'task_statuses' },
      { clave: 'project_id', etiqueta: 'Espacio', tipo: 'seleccion' }
    ]
  }

  const mapa = opcionesDeFiltros(definicion, LOOKUPS)

  assert.deepEqual(Object.keys(mapa), ['task_statuses'], 'un filtro sin desdeLookup no genera entrada')
  assert.deepEqual(mapa.task_statuses[0], { valor: '1', etiqueta: 'Por iniciar' })
  assert.equal(mapa.task_statuses.length, 5)
})

test('un desdeLookup que no existe da lista vacia en vez de romper', () => {
  const definicion = { filtros: [{ clave: 'x', etiqueta: 'X', tipo: 'seleccion', desdeLookup: 'no_existe' }] }

  assert.deepEqual(opcionesDeFiltros(definicion, LOOKUPS).no_existe, [])
})
