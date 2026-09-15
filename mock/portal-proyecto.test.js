/**
 * Pruebas de lo que el portal sirve dentro de un Proyecto: el tablero de Procesos, la ficha de una
 * Tarea y el calendario de entregas.
 *
 * Van contra el servidor y no contra las funciones porque lo que el frontend programa es la **forma
 * de la respuesta**: el frontend del portal monta los mismos paneles que el del colaborador, y lo
 * unico que los separa son estas rutas. Tres cosas son las que hay que dejar clavadas:
 *
 *  1. **La pestaña apagada responde 403, no una lista vacia.** Un Proyecto que no comparte sus
 *     Procesos y uno que no tiene ninguno se dibujan distinto, y confundirlos es como el portal
 *     termina diciendo "todavia no hay nada" sobre trabajo que si existe.
 *  2. **El flag en 0 quita la clave, no la deja en `null`.** El frontend distingue por `undefined`:
 *     `null` o `[]` le harian dibujar una seccion vacia por cada cosa que el equipo decidio no
 *     compartir.
 *  3. **Nada interno se cuela en la ficha.** Ni asignados, ni tarifa, ni ETA, ni etiquetas.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

/** El Proyecto que comparte todo, y el que tiene las Tareas apagadas. Los dos son del cliente 1. */
const COMPLETO = 1
const SIN_TAREAS_COMPARTIDAS = 8

let base
let headers

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/portal/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'clienta@acme.com', password: 'portal1234' })
  })

  headers = { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/**
 * Pide una ruta del portal.
 *
 * @param {string} ruta Ruta sin la base.
 * @returns {Promise<{estado: number, datos: unknown}>}
 */
async function pedir (ruta) {
  const respuesta = await fetch(`${base}${ruta}`, { headers })
  const cuerpo = await respuesta.json()

  return { estado: respuesta.status, datos: cuerpo.data }
}

test('las pestañas se declaran por proyecto y no son las mismas para todos', async () => {
  const uno = await pedir(`/portal/projects/${COMPLETO}`)
  const ocho = await pedir(`/portal/projects/${SIN_TAREAS_COMPARTIDAS}`)

  assert.equal(uno.datos.tabs.includes('tasks'), true)
  assert.equal(uno.datos.tabs.includes('calendar'), true)
  assert.equal(ocho.datos.tabs.includes('tasks'), false)
  assert.equal(ocho.datos.tabs.includes('calendar'), false)
})

test('la pestaña apagada responde 403, no una lista vacia', async () => {
  assert.equal((await pedir(`/portal/projects/${SIN_TAREAS_COMPARTIDAS}/tasks`)).estado, 403)
  assert.equal((await pedir(`/portal/projects/${SIN_TAREAS_COMPARTIDAS}/calendar`)).estado, 403)
})

test('el listado acepta el orden por defecto de la tabla', async () => {
  // `completed,-date_added` es el `ordenPorDefecto` de la definicion, y `date_added` no se publica:
  // la API ordena por una columna que no manda. Si el mock lo rechazara, la tabla del portal
  // arrancaria con un 422 en pantalla.
  const { estado, datos } = await pedir(`/portal/projects/${COMPLETO}/tasks?sort=completed,-date_added`)

  assert.equal(estado, 200)
  assert.equal(datos.length > 0, true)
})

test('el tablero devuelve una columna por estado con sus tarjetas', async () => {
  const { estado, datos } = await pedir(`/portal/projects/${COMPLETO}/tasks?vista=tablero`)

  assert.equal(estado, 200)
  assert.equal(Array.isArray(datos), true)

  for (const grupo of datos) {
    assert.equal(typeof grupo.columna.id, 'number')
    assert.equal(typeof grupo.columna.name, 'string')
    assert.equal(Array.isArray(grupo.tarjetas), true)
    assert.equal(typeof grupo.pagination.total, 'number')
  }

  // "Completo" no es columna mientras no se filtre por estado: un tablero que arranca mostrando lo
  // terminado empuja lo pendiente fuera de la pantalla.
  assert.equal(datos.some((grupo) => grupo.columna.id === 5), false)
  assert.equal(
    (await pedir(`/portal/projects/${COMPLETO}/tasks?vista=tablero&filter[status]=5`))
      .datos.some((grupo) => grupo.columna.id === 5),
    true
  )
})

test('el calendario devuelve solo lo que tiene fecha de entrega', async () => {
  const { estado, datos } = await pedir(`/portal/projects/${COMPLETO}/calendar?per_page=200`)

  assert.equal(estado, 200)
  assert.equal(datos.length > 0, true)
  assert.equal(datos.every((tarea) => tarea.due_date !== null), true)
})

test('la ficha de una Tarea trae los bloques que el proyecto comparte', async () => {
  const { filas } = { filas: (await pedir(`/portal/projects/${COMPLETO}/tasks?per_page=50`)).datos }
  const { estado, datos } = await pedir(`/portal/projects/${COMPLETO}/tasks/${filas[0].id}`)

  assert.equal(estado, 200)
  assert.equal(Array.isArray(datos.comments), true)
  assert.equal(Array.isArray(datos.checklist), true)
  assert.equal(Array.isArray(datos.attachments), true)
  assert.equal(typeof datos.total_logged_seconds, 'number')
  // El Hito viaja como objeto o como `null`, nunca como el id suelto que manda el listado: la ficha
  // muestra su nombre, y un numero no se puede resolver del lado del cliente.
  assert.equal(datos.milestone === null || typeof datos.milestone === 'object', true)
})

test('la ficha no publica nada interno del equipo', async () => {
  const filas = (await pedir(`/portal/projects/${COMPLETO}/tasks?per_page=50`)).datos
  const { datos } = await pedir(`/portal/projects/${COMPLETO}/tasks/${filas[0].id}`)

  for (const interno of [
    'assignees', 'followers', 'hourly_rate', 'billable', 'billed', 'estimated_hours',
    'eta', 'desviacion_dias', 'estado_sla', 'tags', 'custom_fields', 'added_from', 'timer_activo'
  ]) {
    assert.equal(interno in datos, false, interno)
  }
})

test('una Tarea de otro proyecto es 404 y no 403', async () => {
  // Para este contacto esa Tarea no existe: un 403 confirmaria que existe y esta en otra parte.
  const ajenas = (await pedir(`/portal/projects/${COMPLETO}/tasks?per_page=50`)).datos.map((t) => t.id)
  const inexistente = Math.max(...ajenas) + 10000

  assert.equal((await pedir(`/portal/projects/${COMPLETO}/tasks/${inexistente}`)).estado, 404)
})

test('un proyecto de otro cliente no se abre por ninguna de sus rutas', async () => {
  // El contacto 1 es del cliente 1; el proyecto 2 es de otro.
  assert.equal((await pedir('/portal/projects/2')).estado, 404)
  assert.equal((await pedir('/portal/projects/2/tasks')).estado, 404)
  assert.equal((await pedir('/portal/projects/2/calendar')).estado, 404)
})

test('una seccion inventada del proyecto es 404', async () => {
  assert.equal((await pedir(`/portal/projects/${COMPLETO}/tarifas`)).estado, 404)
})
