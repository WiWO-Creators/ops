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
 *  2. `camposPorDefectoDeTarjeta` interseca lo que la tarjeta sabe pintar con lo que la definicion
 *     vigente declara. Es lo que le da al equipo los seis campos y al contacto solo los suyos, sin
 *     una lista de excepciones escrita a mano al lado de la definicion.
 *  3. Una Tarea sin hito, sin seguidores y sin fechas se poda sin lanzar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAMPOS_DE_TARJETA, camposPorDefectoDeTarjeta, podarParaTarjeta } from '../src/componentes/proyecto/tarjeta-tarea.ts'
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

test('la tarjeta del equipo arranca con los seis campos, inicio y seguidores incluidos', () => {
  const campos = camposPorDefectoDeTarjeta(procesosDelEspacio(80).columnas)
  const podado = podarParaTarjeta(tareaCompleta(), campos)

  assert.deepEqual(campos, CAMPOS_DE_TARJETA, 'la definicion del equipo declara los seis como columna')
  assert.equal(podado.patente, 'PAT-001-07')
  assert.deepEqual(podado.milestone, { id: 3, name: 'Cierre de etapa' })
  assert.equal(podado.start_date, '2026-09-01', 'la fecha de inicio se pinta junto al vencimiento')
  assert.equal(podado.followers.length, 2, 'los seguidores se cuentan en la fila de contadores')
})

test('la definicion del contacto apaga todo lo que el contrato del portal no emite', () => {
  const visibles = clavesVisiblesPorDefecto(procesosDelContacto(80).columnas)
  // Tal como baja del portal: sin seguidores, sin asignados y sin etiquetas. El hito SI baja, y
  // como objeto: `FormasDelPortal::PROCESOS` lo declara recortado a `{id, name}`.
  const delPortal = {
    id: 9,
    name: 'Revisión de diseño',
    status: 4,
    patente: 'PAT-001-09',
    start_date: '2026-09-02',
    due_date: '2026-09-25',
    milestone: { id: 4, name: 'Diseño aprobado' }
  }

  const podado = podarParaTarjeta(delPortal, visibles)

  assert.equal(podado.patente, 'PAT-001-09')
  assert.deepEqual(podado.milestone, { id: 4, name: 'Diseño aprobado' })
  assert.equal(podado.followers, undefined)
  assert.equal(podado.assignees, undefined)
  assert.equal(podado.tags, undefined)
  assert.equal(podado.due_date, '2026-09-25')
})

test('apagar seguidores en el menu los saca de la tarjeta sin tocar el resto', () => {
  const campos = camposPorDefectoDeTarjeta(procesosDelEspacio(80).columnas)
  const podado = podarParaTarjeta(tareaCompleta(), campos.filter((campo) => campo !== 'followers'))

  assert.equal(podado.followers, undefined, 'apagado es undefined: la tarjeta ni lo menciona')
  assert.equal(podado.start_date, '2026-09-01')
  assert.deepEqual(podado.assignees, [{ id: 21, full_name: 'Caro Soto', profile_image_url: null }])
})

test('la definicion del contacto solo ofrece los campos que declara como columna', () => {
  const campos = camposPorDefectoDeTarjeta(procesosDelContacto(80).columnas)

  // De los seis que la tarjeta sabe pintar, el contacto tiene tres: identificador, inicio e hito.
  // Asignados, seguidores y etiquetas no bajan en su contrato, asi que el menu del tablero del
  // portal tampoco los puede encender. El hito si baja, y el dia que dejo de estar en la tabla del
  // cliente tambien desaparecio de su tablero sin que nadie lo decidiera: son la misma lista.
  assert.deepEqual(campos, ['patente', 'start_date', 'milestone'])
})
