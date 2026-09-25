/**
 * Pruebas del tono con el que se pinta una prioridad.
 *
 * Lo que se prueba acá no es que salga un color bonito: es que la escala **no mienta**. Una
 * prioridad es una escala de urgencia, y las dos formas de arruinarla son pintar de rojo algo que
 * no es urgente y pintar de gris algo que sí. Por eso los casos fijan los dos extremos de cada
 * catálogo y, sobre todo, que las dos escalas NO son la misma: la `3` de un ticket es su máximo,
 * la `3` de una Tarea todavía tiene `Urgente` encima.
 *
 * El otro caso que importa es el id desconocido. `ticket_priorities` y `task_priorities` los
 * administra Perfex: alguien puede agregar una prioridad nueva, y ese id tiene que salir por el
 * camino del catálogo —sin tono inventado— y no elegir un color al azar sobre una escala de
 * urgencia.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pintarPrioridad } from '../src/dominio/prioridades.ts'

test('la escala de Tarea va de sin relleno a peligro', () => {
  assert.equal(pintarPrioridad(1, 'task_priorities').tono, 'contorno')
  assert.equal(pintarPrioridad(2, 'task_priorities').tono, 'acento')
  assert.equal(pintarPrioridad(3, 'task_priorities').tono, 'aviso')
  assert.equal(pintarPrioridad(4, 'task_priorities').tono, 'peligro')
})

test('la escala de ticket llega a su máximo en 3, no en 4', () => {
  assert.equal(pintarPrioridad(3, 'ticket_priorities').tono, 'peligro')
  assert.equal(pintarPrioridad(4, 'ticket_priorities'), null)
})

test('el mismo número significa cosas distintas en cada escala', () => {
  // Es el error que este mapa existe para evitar: con una sola tabla, el ticket más urgente que
  // existe quedaría pintado de ámbar.
  assert.notEqual(
    pintarPrioridad(3, 'task_priorities').tono,
    pintarPrioridad(3, 'ticket_priorities').tono
  )
})

test('las etiquetas salen en español, también las de ticket', () => {
  // `ticket_priorities` llega de la API como Low/Medium/High: son las de fábrica de Perfex, que
  // nadie tradujo. El mapa las reemplaza sin depender de que alguien entre al panel.
  assert.equal(pintarPrioridad(1, 'ticket_priorities').etiqueta, 'Baja')
  assert.equal(pintarPrioridad(2, 'ticket_priorities').etiqueta, 'Media')
  assert.equal(pintarPrioridad(3, 'ticket_priorities').etiqueta, 'Alta')
  assert.equal(pintarPrioridad(4, 'task_priorities').etiqueta, 'Urgente')
})

test('un id que la escala no conoce no se pinta', () => {
  assert.equal(pintarPrioridad(9, 'task_priorities'), null)
  assert.equal(pintarPrioridad(0, 'task_priorities'), null)
  assert.equal(pintarPrioridad(-1, 'task_priorities'), null)
})

test('el valor ausente o ilegible tampoco se pinta', () => {
  assert.equal(pintarPrioridad(null, 'task_priorities'), null)
  assert.equal(pintarPrioridad(undefined, 'task_priorities'), null)
  assert.equal(pintarPrioridad('', 'task_priorities'), null)
  assert.equal(pintarPrioridad('alta', 'task_priorities'), null)
  assert.equal(pintarPrioridad(2.5, 'task_priorities'), null)
})

test('el número que llega como texto se lee igual', () => {
  // La URL trae los filtros como texto, y la tabla pinta la misma insignia con ese valor.
  assert.equal(pintarPrioridad('4', 'task_priorities').tono, 'peligro')
  assert.equal(pintarPrioridad('1', 'ticket_priorities').etiqueta, 'Baja')
})
