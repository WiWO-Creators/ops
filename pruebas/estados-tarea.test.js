/**
 * Pruebas de la resolucion del estado de una Tarea.
 *
 * Lo que se prueba aca no es el formato de la insignia, es que **donde haya una Tarea se vea su
 * estado**: el catalogo llega en dos formas distintas segun la pantalla, puede llegar vacio, y el
 * `status` puede ser uno que Perfex agrego despues de que el navegador cargo el catalogo. Los tres
 * casos tienen que terminar en un texto legible y no en un hueco.
 *
 * El catalogo de los casos es el real de `GET /lookups` (seis estados, con sus colores y su `order`,
 * que no coincide con el `id`).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesDeEstados, resolverEstado } from '../src/dominio/estados-tarea.ts'

/** `task_statuses` tal como los devuelve `GET /lookups` en produccion. */
const LOOKUP = [
  { id: 1, name: 'Por iniciar', color: '#f97316', order: 1 },
  { id: 4, name: 'En progreso', color: '#eab308', order: 2 },
  { id: 3, name: 'Testear', color: '#0284c7', order: 3 },
  { id: 2, name: 'Espera de respuesta', color: '#84cc16', order: 4 },
  { id: 6, name: 'Cambios', color: '#a855f7', order: 5 },
  { id: 5, name: 'Completo', color: '#22c55e', order: 100 }
]

/** El mismo catalogo despues de pasar por `opcionesDeFiltros`, que es como lo recibe la tabla. */
const OPCIONES = opcionesDeEstados(LOOKUP)

test('resuelve nombre y color desde el catalogo de /lookups', () => {
  const estado = resolverEstado(4, LOOKUP)

  assert.equal(estado.etiqueta, 'En progreso')
  assert.equal(estado.color, '#eab308')
  assert.equal(estado.desconocido, false)
})

test('resuelve igual con el catalogo ya convertido a opciones de filtro', () => {
  assert.deepEqual(resolverEstado(4, OPCIONES), resolverEstado(4, LOOKUP))
})

test('la conversion conserva id, nombre y color', () => {
  assert.deepEqual(OPCIONES[0], { valor: '1', etiqueta: 'Por iniciar', color: '#f97316' })
  assert.equal(OPCIONES.length, LOOKUP.length)
})

test('un estado sin color no inventa uno', () => {
  const estado = resolverEstado(9, [{ id: 9, name: 'Sin pintar' }])

  assert.equal(estado.etiqueta, 'Sin pintar')
  assert.equal(estado.color, undefined)
  assert.equal(estado.desconocido, false)
})

test('el estado Completo se resuelve como cualquier otro', () => {
  const estado = resolverEstado(5, LOOKUP)

  assert.equal(estado.etiqueta, 'Completo')
  assert.equal(estado.color, '#22c55e')
  assert.equal(estado.desconocido, false)
})

test('el status que llega como texto —de la URL— resuelve igual que el numero', () => {
  assert.deepEqual(resolverEstado('5', LOOKUP), resolverEstado(5, LOOKUP))
})

test('un status que el catalogo no conoce se muestra como id, nunca vacio', () => {
  const estado = resolverEstado(7, LOOKUP)

  assert.equal(estado.etiqueta, '#7')
  assert.equal(estado.desconocido, true)
  assert.equal(estado.color, undefined)
})

test('un catalogo vacio o ausente no deja la Tarea sin estado visible', () => {
  for (const catalogo of [[], undefined]) {
    const estado = resolverEstado(5, catalogo)

    assert.equal(estado.etiqueta, '#5', 'sin catalogo se lee el id, no un hueco')
    assert.equal(estado.desconocido, true)
  }
})

test('una Tarea sin status se dice con palabras, no con un id', () => {
  for (const vacio of [null, undefined, '']) {
    assert.equal(resolverEstado(vacio, LOOKUP).etiqueta, 'Sin estado')
    assert.equal(resolverEstado(vacio, LOOKUP).desconocido, true)
  }
})

test('el orden del catalogo no cambia la resolucion', () => {
  const alreves = [...LOOKUP].reverse()

  assert.deepEqual(resolverEstado(3, alreves), resolverEstado(3, LOOKUP))
})
