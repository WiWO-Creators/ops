/**
 * Pruebas de `procesosDelContacto`: la tabla de Procesos del equipo, acotada a lo que ve un cliente.
 *
 * La tabla, el tablero y el calendario de la pestaña Tareas son **los mismos componentes** en el
 * panel y en el portal. Lo unico que los separa es esta definicion, asi que es el unico lugar donde
 * se puede colar un dato interno o una columna que la API del contacto no manda.
 *
 * Por eso la prueba central no es de forma sino de ejecucion: se pinta cada columna contra una fila
 * **del contrato del portal** (`TareaPortal`, sin asignados, sin hito, sin ETA) y se exige que
 * ninguna lance. Una columna del equipo que se cuele lee un objeto que no llego y rompe la fila
 * entera, no solo su celda.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PORTAL_TAREAS, procesosDelContacto } from '../src/definiciones/portal-proyectos.ts'
import { procesosDelEspacio } from '../src/definiciones/procesos.ts'

const definicion = procesosDelContacto(8)

/**
 * Un Proceso tal como lo devuelve `GET /portal/projects/{id}/tasks`.
 *
 * Copiado del contrato y no de `Proceso`: lo que hace valer la prueba es justamente lo que **no**
 * tiene. `milestone` y `task_type` llegan como numero, no como objeto, que es el caso que hace
 * explotar una celda del equipo si se cuela.
 */
const FILA = {
  id: 512,
  patente: 'ESP-008-01',
  name: 'Revisar la pantalla de acceso',
  description: null,
  status: 4,
  priority: 1,
  start_date: '2026-08-08',
  due_date: '2026-09-08',
  date_finished: null,
  milestone: 0,
  milestone_order: 0,
  task_type: 0,
  tags: [],
  counts: {}
}

test('la ruta es la del portal: el BFF elige el sujeto por el primer segmento', () => {
  assert.equal(definicion.ruta.startsWith('portal/'), true)
  assert.equal(definicion.ruta, 'portal/projects/8/tasks')
})

test('cada columna se pinta sin lanzar contra una fila del portal', () => {
  for (const columna of definicion.columnas) {
    assert.doesNotThrow(() => columna.presentar(FILA), `columna ${columna.clave}`)
  }
})

test('ninguna columna lee una clave que el contacto no recibe', () => {
  const recibidas = Object.keys(FILA)

  for (const columna of definicion.columnas) {
    assert.equal(recibidas.includes(columna.clave), true, `columna ${columna.clave}`)
  }
})

test('no viajan las columnas internas del equipo', () => {
  const claves = definicion.columnas.map((c) => c.clave)

  // Asignados y seguidores son personas del equipo; el tipo, el ETA, la desviacion y el SLA son el
  // compromiso interno; las etiquetas son vocabulario interno, igual que en `proyectoDelPortal`.
  for (const prohibida of ['assignees', 'task_type', 'eta', 'desviacion', 'estado_sla', 'tags', 'milestone', 'project', 'date_added', 'iterations']) {
    assert.equal(claves.includes(prohibida), false, prohibida)
  }
})

test('los encabezados y el orden son los del panel', () => {
  // La misma columna no puede llamarse distinto segun de que lado se abra: los dos hablan por
  // telefono. Se deriva de una sola lista justamente para eso.
  const delPanel = procesosDelEspacio(8).columnas
  const rotuloDelPanel = new Map(delPanel.map((c) => [c.clave, c.encabezado]))
  const posicionEnPanel = delPanel.map((c) => c.clave)

  let anterior = -1

  for (const columna of definicion.columnas) {
    assert.equal(columna.encabezado, rotuloDelPanel.get(columna.clave), columna.clave)

    const posicion = posicionEnPanel.indexOf(columna.clave)
    assert.equal(posicion > anterior, true, `${columna.clave} cambio de lugar`)
    anterior = posicion
  }
})

test('solo sobreviven los filtros que el endpoint del portal declara', () => {
  const claves = definicion.filtros.map((f) => f.clave)

  assert.deepEqual(claves, PORTAL_TAREAS.filtros.map((f) => f.clave))
  // `assignee`, `project_id`, `area` y compañia no existen para un contacto: pedirlos da 422.
  assert.equal(claves.includes('assignee'), false)
  assert.equal(claves.includes('project_id'), false)
})

test('el contacto no ejecuta ninguna accion sobre un Proceso', () => {
  // Dos acciones del equipo —arrancar y detener el cronometro— no piden capacidad, asi que
  // `capacidades={[]}` no alcanzaba para podarlas: el cliente veia un menu por fila que solo podia
  // devolver 404. La accion no existe para este sujeto, y con la lista vacia la columna desaparece.
  assert.deepEqual(definicion.acciones, [])
  assert.equal(procesosDelEspacio(8).acciones.length > 0, true, 'el panel perdio sus acciones')
})

test('no se piden campos personalizados: el contacto no los tiene', () => {
  assert.deepEqual(definicion.incluirSiempre, [])
  assert.deepEqual(definicion.includes, [])
})

test('ninguna columna ofrece ordenar por algo que el portal no ordena', () => {
  for (const columna of definicion.columnas) {
    if (columna.ordenPor === undefined) continue

    assert.equal(definicion.ordenables.includes(columna.ordenPor), true, columna.clave)
  }
})
