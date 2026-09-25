/**
 * Pruebas de la logica de la pantalla de la Papelera.
 *
 * Lo que se cuida: que una vista inventada en la URL no llegue a la API como filtro, que la ultima
 * semana se pinte en rojo, y que la lista de lo que se lleva un borrado definitivo no muestre ceros
 * ni claves crudas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lineasDeCascada,
  nombreDeEntidad,
  paginaDePapelera,
  textoDeDiasRestantes,
  tonoDeDiasRestantes,
  vistaDePapelera
} from '../src/dominio/papelera.ts'

test('vistaDePapelera acepta solo las vistas conocidas', () => {
  assert.equal(vistaDePapelera('tasks'), 'tasks')
  assert.equal(vistaDePapelera(['projects', 'clients']), 'projects')
  assert.equal(vistaDePapelera(undefined), 'todo')
  assert.equal(vistaDePapelera(''), 'todo')
  assert.equal(vistaDePapelera('staff'), 'todo')
  assert.equal(vistaDePapelera('tasks]&filter[x'), 'todo')
})

test('paginaDePapelera cae a la primera ante basura', () => {
  assert.equal(paginaDePapelera('3'), 3)
  assert.equal(paginaDePapelera(undefined), 1)
  assert.equal(paginaDePapelera('-3'), 1)
  assert.equal(paginaDePapelera('hola'), 1)
  assert.equal(paginaDePapelera('1.5'), 1)
})

test('nombreDeEntidad usa el glosario', () => {
  assert.equal(nombreDeEntidad('tasks'), 'Tarea')
  assert.equal(nombreDeEntidad('projects', true), 'Proyectos')
  assert.equal(nombreDeEntidad('clients'), 'Cliente')
})

test('los dias restantes se leen y se pintan segun cuanto falta', () => {
  assert.equal(tonoDeDiasRestantes(30), 'neutro')
  assert.equal(tonoDeDiasRestantes(14), 'aviso')
  assert.equal(tonoDeDiasRestantes(7), 'peligro')
  assert.equal(tonoDeDiasRestantes(Number.NaN), 'peligro')
  assert.equal(textoDeDiasRestantes(0), 'Vence hoy')
  assert.equal(textoDeDiasRestantes(-2), 'Vence hoy')
  assert.equal(textoDeDiasRestantes(1), '1 día')
  assert.equal(textoDeDiasRestantes(12), '12 días')
})

test('lineasDeCascada ordena, traduce y descarta ceros', () => {
  assert.deepEqual(
    lineasDeCascada({ comentarios: 4, procesos: 12, adjuntos: 0, clave_nueva: 2 }),
    ['12 tareas', '4 comentarios', '2 clave nueva']
  )
  assert.deepEqual(lineasDeCascada({}), [])
  assert.deepEqual(lineasDeCascada(null), [])
  assert.deepEqual(lineasDeCascada(undefined), [])
})
