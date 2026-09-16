/**
 * Pruebas de la poda de la tarjeta del tablero (`podarParaTarjeta`).
 *
 * La tarjeta del kanban la pintan dos vistas —el tablero global y la pestaña Tareas de un Espacio— y
 * la abren dos sujetos: el equipo y, desde el portal, el contacto del cliente. Lo unico que separa
 * una tarjeta de la otra es esta funcion, asi que es el unico lugar donde se puede colar un dato que
 * el contrato del contacto no manda.
 *
 * Tres cosas se prueban porque se rompen en silencio:
 *
 *  1. Un campo cuya columna no esta en la definicion sale `undefined`, no `null`: la tarjeta no lo
 *     menciona en vez de dibujar un hueco.
 *  2. Una columna `ocultaPorDefecto` deja su campo apagado. Es lo que evita que la tarjeta se sature
 *     con los cinco datos nuevos a la vez.
 *  3. Una Tarea sin hito, sin seguidores y sin fechas se poda sin lanzar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podarParaTarjeta } from '../src/componentes/proyecto/tarjeta-tarea.ts'
import { clavesVisiblesPorDefecto } from '../src/componentes/datos/tabla.ts'
import { procesosDelEspacio } from '../src/definiciones/procesos.ts'
import { procesosDelContacto } from '../src/definiciones/portal-proyectos.ts'

/** Una Tarea del equipo con todos los campos que la tarjeta sabe pintar. */
function tareaCompleta () {
  return {
    id: 7,
    name: 'Redactar el informe',
    status: 2,
    patente: 'PAT-001-07',
    start_date: '2026-09-01',
    due_date: '2026-09-20',
    milestone: { id: 3, name: 'Cierre de etapa' },
    followers: [
      { id: 11, full_name: 'Ana Díaz', profile_image_url: null },
      { id: 12, full_name: 'Beto Ruiz', profile_image_url: null }
    ],
    assignees: [{ id: 21, full_name: 'Caro Soto', profile_image_url: null }],
    tags: [{ id: 5, name: 'urgente' }],
    counts: { comments: 1, checklist: 4, checklist_done: 2, attachments: 0 }
  }
}

/** Una Tarea recien creada: sin hito, sin seguidores, sin fechas y sin identificador asignado. */
function tareaPelada () {
  return {
    id: 8,
    name: 'Tarea nueva',
    status: 1,
    patente: null,
    start_date: null,
    due_date: null,
    milestone: null,
    followers: [],
    assignees: [],
    tags: [],
    counts: { comments: 0, checklist: 0, checklist_done: 0, attachments: 0 }
  }
}

test('un campo sin columna en la definicion queda undefined, no null', () => {
  const podado = podarParaTarjeta(tareaCompleta(), ['patente', 'due_date'])

  assert.equal(podado.milestone, undefined)
  assert.equal(podado.followers, undefined)
  assert.equal(podado.start_date, undefined)
  assert.equal(podado.assignees, undefined)
  assert.equal(podado.tags, undefined)
  assert.equal(podado.patente, 'PAT-001-07')
})

test('el esqueleto de la tarjeta sobrevive a cualquier poda', () => {
  const podado = podarParaTarjeta(tareaCompleta(), [])

  assert.equal(podado.id, 7)
  assert.equal(podado.name, 'Redactar el informe')
  assert.equal(podado.status, 2)
  assert.equal(podado.due_date, '2026-09-20')
  assert.deepEqual(podado.counts, { comments: 1, checklist: 4, checklist_done: 2, attachments: 0 })
})

test('un campo con columna pero sin dato queda en null o lista vacia, que si se pinta', () => {
  const claves = ['patente', 'start_date', 'milestone', 'followers', 'assignees', 'tags']
  const podado = podarParaTarjeta(tareaPelada(), claves)

  assert.equal(podado.patente, null)
  assert.equal(podado.start_date, null)
  assert.equal(podado.milestone, null)
  assert.deepEqual(podado.followers, [])
  assert.deepEqual(podado.assignees, [])
  assert.deepEqual(podado.tags, [])
})

test('la definicion del equipo enciende patente e hito, y deja inicio y seguidores apagados', () => {
  const visibles = clavesVisiblesPorDefecto(procesosDelEspacio(80).columnas)
  const podado = podarParaTarjeta(tareaCompleta(), visibles)

  assert.equal(podado.patente, 'PAT-001-07')
  assert.deepEqual(podado.milestone, { id: 3, name: 'Cierre de etapa' })
  assert.equal(podado.start_date, undefined, 'la fecha de inicio es columna ocultaPorDefecto')
  assert.equal(podado.followers, undefined, 'los seguidores son columna ocultaPorDefecto')
})

test('la definicion del contacto apaga todo lo que el contrato del portal no emite', () => {
  const visibles = clavesVisiblesPorDefecto(procesosDelContacto(80).columnas)
  // Tal como baja del portal: sin hito, sin seguidores, sin asignados y sin etiquetas.
  const delPortal = {
    id: 9,
    name: 'Revisión de diseño',
    status: 3,
    patente: 'PAT-001-09',
    start_date: '2026-09-02',
    due_date: '2026-09-25'
  }

  const podado = podarParaTarjeta(delPortal, visibles)

  assert.equal(podado.patente, 'PAT-001-09')
  assert.equal(podado.milestone, undefined)
  assert.equal(podado.followers, undefined)
  assert.equal(podado.assignees, undefined)
  assert.equal(podado.tags, undefined)
  assert.equal(podado.due_date, '2026-09-25')
})

test('encender la columna de seguidores los trae a la tarjeta', () => {
  const columnas = procesosDelEspacio(80).columnas
  const seguidores = columnas.find((columna) => columna.clave === 'followers')

  assert.ok(seguidores !== undefined, 'Seguidores tiene que ser columna para poder encenderse')
  assert.equal(seguidores.ocultaPorDefecto, true)

  const podado = podarParaTarjeta(tareaCompleta(), [...clavesVisiblesPorDefecto(columnas), 'followers'])

  assert.equal(podado.followers.length, 2)
})
