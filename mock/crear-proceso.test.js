/**
 * Pruebas de `POST /tasks` — el alta de un Proceso.
 *
 * Van contra el servidor de verdad y no contra la funcion, porque lo que hay que garantizar es la
 * forma de la respuesta HTTP: es contra eso que el frontend programa. Cubren sobre todo los dos
 * puntos donde un alta se rompe en silencio — un Proceso sin Espacio, que el contrato permite a
 * proposito, y un id que no existe, que tiene que fallar en vez de guardarse a medias.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { ESPACIOS, ESTADOS_PROCESO, STAFF } from './datos.js'

let base
let token

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  token = (await respuesta.json()).data.access_token
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Manda el alta y devuelve estado y cuerpo ya parseados. */
async function crear (cuerpo) {
  const respuesta = await fetch(`${base}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo)
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

test('con solo el nombre alcanza para crear', async () => {
  const { estado, cuerpo } = await crear({ name: 'Grilla Colbún septiembre' })
  const primera = [...ESTADOS_PROCESO].sort((a, b) => a.order - b.order)[0]

  assert.equal(estado, 201)
  assert.equal(cuerpo.data.name, 'Grilla Colbún septiembre')
  assert.equal(cuerpo.data.status, primera.id, 'nace en la primera columna del tablero')
  assert.equal(cuerpo.data.priority, 2)
  assert.equal(cuerpo.data.date_finished, null)
  assert.equal(cuerpo.data.timer_activo, null)
  assert.deepEqual(cuerpo.data.counts, { comments: 0, checklist: 0, checklist_done: 0, attachments: 0 })
})

test('un Proceso puede nacer SIN Espacio', async () => {
  const { estado, cuerpo } = await crear({ name: 'Anotar antes de decidir el proyecto' })

  assert.equal(estado, 201)
  assert.equal(cuerpo.data.rel_type, null)
  assert.equal(cuerpo.data.rel_id, null)
  assert.equal(cuerpo.data.project, null)
})

test('con Espacio valido, la ficha trae el bloque project resuelto', async () => {
  const espacio = ESPACIOS[0]
  const { estado, cuerpo } = await crear({
    name: 'Con espacio',
    rel_type: 'project',
    rel_id: espacio.id
  })

  assert.equal(estado, 201)
  assert.equal(cuerpo.data.rel_type, 'project')
  assert.deepEqual(cuerpo.data.project, { id: espacio.id, name: espacio.name })
})

test('el nombre es obligatorio y el error nombra el campo', async () => {
  const { estado, cuerpo } = await crear({ name: '   ' })

  assert.equal(estado, 422)
  assert.equal(cuerpo.error.code, 'validation_failed')
  assert.deepEqual(cuerpo.error.details.name, ['requerido'])
})

test('un Espacio inexistente falla en vez de guardar la tarea suelta', async () => {
  const { estado, cuerpo } = await crear({ name: 'X', rel_type: 'project', rel_id: 999999 })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.rel_id, ['no_existe'])
})

test('un asignado inexistente falla y no se descarta en silencio', async () => {
  const { estado, cuerpo } = await crear({ name: 'X', assignees: [999999] })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.assignees, ['no_existe'])
})

test('los asignados validos se resuelven a personas, sin repetidos', async () => {
  const persona = STAFF[0]
  const { estado, cuerpo } = await crear({ name: 'X', assignees: [persona.id, persona.id] })

  assert.equal(estado, 201)
  assert.equal(cuerpo.data.assignees.length, 1)
  assert.equal(cuerpo.data.assignees[0].full_name, persona.full_name)
})

test('una fecha con formato invalido no llega a guardarse', async () => {
  const { estado, cuerpo } = await crear({ name: 'X', due_date: '30-09-2026' })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.due_date, ['formato_invalido'])
})

test('una prioridad fuera del catalogo se rechaza', async () => {
  const { estado, cuerpo } = await crear({ name: 'X', priority: 99 })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.priority, ['no_valido'])
})

test('lo creado aparece despues en el listado', async () => {
  const nombre = `Buscable ${Date.now()}`
  const alta = await crear({ name: nombre })

  const respuesta = await fetch(`${base}/tasks?q=${encodeURIComponent(nombre)}`, {
    headers: { authorization: `Bearer ${token}` }
  })
  const listado = await respuesta.json()

  assert.equal(respuesta.status, 200)
  assert.ok(
    listado.data.some((p) => p.id === alta.cuerpo.data.id),
    'el Proceso recien creado tiene que salir en GET /tasks'
  )
})
