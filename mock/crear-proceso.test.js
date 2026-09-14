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
import { ESPACIOS, ESTADOS_PROCESO, ETIQUETAS, HITOS, STAFF } from './datos.js'

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

test('orden de hitos persiste con filtros y rechaza ids invalidos o falta de permiso', async () => {
  const proyecto = ESPACIOS[0].id
  const hitos = HITOS.filter((hito) => hito.project_id === proyecto)
  const anterior = hitos.map((hito) => hito.milestone_order)
  const orden = hitos.map((hito) => hito.id).reverse()
  const ruta = `${base}/projects/${proyecto}/milestones`
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  try {
    const guardado = await fetch(`${ruta}/orden`, { method: 'PATCH', headers, body: JSON.stringify({ orden }) })
    assert.equal(guardado.status, 200)
    assert.deepEqual((await guardado.json()).data.map((hito) => hito.id), orden)
    for (const consulta of ['?vista=tablero', '?vista=tablero&filter[status]=5']) {
      const respuesta = await fetch(`${ruta}${consulta}`, { headers })
      const grupos = (await respuesta.json()).data.filter((grupo) => grupo.columna.id > 0)
      assert.deepEqual(grupos.map((grupo) => grupo.columna.id), orden)
      assert.deepEqual(grupos.map((grupo) => grupo.columna.order), [1, 2])
    }
    for (const invalido of [null, [], [0], [-1], [1.5], [orden[0], orden[0]], [HITOS.find((hito) => hito.project_id !== proyecto).id]]) {
      const rechazo = await fetch(`${ruta}/orden`, { method: 'PATCH', headers, body: JSON.stringify({ orden: invalido }) })
      assert.equal(rechazo.status, 422)
      await rechazo.arrayBuffer()
    }
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: STAFF[2].email, password: 'mock1234' })
    })
    const restringido = (await login.json()).data.access_token
    const denegado = await fetch(`${ruta}/orden`, {
      method: 'PATCH', headers: { ...headers, authorization: `Bearer ${restringido}` }, body: JSON.stringify({ orden })
    })
    assert.equal(denegado.status, 403)
    await denegado.arrayBuffer()
    assert.deepEqual(hitos.map((hito) => hito.milestone_order), [2, 1])
    for (const [permiso, estado] of [['edit', 403], ['edit_milestones', 200]]) {
      const cambio = await fetch(`${base}/staff/${STAFF[2].id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ permissions: { projects: ['view', permiso] } })
      })
      assert.equal(cambio.status, 200)
      await cambio.arrayBuffer()
      const resultado = await fetch(`${ruta}/orden`, {
        method: 'PATCH', headers: { ...headers, authorization: `Bearer ${restringido}` }, body: JSON.stringify({ orden })
      })
      assert.equal(resultado.status, estado, `Reordenar exige ${permiso === 'edit' ? 'más que editar el proyecto' : 'editar hitos'}`)
      await resultado.arrayBuffer()
    }
  } finally {
    hitos.forEach((hito, indice) => { hito.milestone_order = anterior[indice] })
    const restaurado = await fetch(`${base}/staff/${STAFF[2].id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ permissions: { projects: ['view'] } })
    })
    assert.equal(restaurado.status, 200)
    await restaurado.arrayBuffer()
  }
})

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


test('el alta completa guarda campos y usa los tipos del espacio', async () => {
  const espacio = ESPACIOS[0]
  const catalogo = await fetch(`${base}/projects/${espacio.id}/task-types`, {
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(catalogo.status, 200)
  const tipo = (await catalogo.json()).data.task_types[0]
  const hito = HITOS.find((h) => h.project_id === espacio.id)
  const { estado, cuerpo } = await crear({
    name: 'Todos los campos', rel_type: 'project', rel_id: espacio.id,
    milestone: hito.id, task_type: tipo.id, estimated_hours: 2.5,
    status: 5, start_date: '2020-01-01', completed_at: '2020-01-02T12:00:00Z',
    hourly_rate: 12.345, is_public: true, visible_to_client: true, billable: true,
    recurring: true, repeat_every: 2, recurring_type: 'week', cycles: 3
  })
  assert.equal(estado, 201)
  assert.equal(cuerpo.data.status, 5)
  assert.equal(cuerpo.data.date_finished, '2020-01-02T12:00:00.000Z')
  assert.equal(cuerpo.data.hourly_rate, 12.35)
  assert.equal(cuerpo.data.estimated_hours, 2.5)
  assert.deepEqual(cuerpo.data.milestone, { id: hito.id, name: hito.name })
  assert.equal(cuerpo.data.task_type.id, tipo.id)
  for (const clave of ['is_public', 'visible_to_client', 'billable', 'recurring']) assert.equal(cuerpo.data[clave], true)
  assert.equal(cuerpo.data.repeat_every, 2)
  assert.equal(cuerpo.data.recurring_type, 'week')
  assert.equal(cuerpo.data.cycles, 3)
})

test('el alta rechaza campos inválidos sin crear etiquetas y conserva defaults nulos', async () => {
  const etiquetasAntes = ETIQUETAS.length
  for (const entrada of [
    { status: 99 }, { status: true }, { hourly_rate: [] }, { hourly_rate: -1 }, { hourly_rate: 1000000000 },
    { is_public: 'sí' }, { visible_to_client: [] }, { estimated_hours: -2 },
    { milestone: 999999 }, { task_type: 999999 }, { billed: true },
    { completed_at: '2020-01-01T12:00:00Z' }, { status: 5, completed_at: '2999-01-01T12:00:00Z' },
    { recurring: true, repeat_every: 0, recurring_type: 'week' },
    { recurring: true, repeat_every: 1, recurring_type: 'week', cycles: 1.5 }
  ]) {
    const resultado = await crear({ name: 'Inválida', tags: ['No debe crearse'], ...entrada })
    assert.equal(resultado.estado, 422, JSON.stringify(entrada))
  }
  assert.equal(ETIQUETAS.length, etiquetasAntes)
  const { estado, cuerpo } = await crear({ name: 'Opcionales nulos', estimated_hours: null, hourly_rate: null, milestone: null, task_type: null })
  assert.equal(estado, 201)
  assert.equal(cuerpo.data.estimated_hours, null)
  assert.equal(cuerpo.data.hourly_rate, 0)
  assert.equal(cuerpo.data.milestone, null)
  assert.equal(cuerpo.data.task_type, null)
  assert.equal(cuerpo.data.recurring, false)
})


test('asignables carga personas activas con paginación y proyección mínima', async () => {
  const respuesta = await fetch(`${base}/staff/asignables?per_page=500`, {
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(respuesta.status, 200)
  const { data } = await respuesta.json()
  assert.equal(data.length, STAFF.filter((persona) => persona.active && !persona.is_not_staff).length)
  assert.deepEqual(Object.keys(data[0]).sort(), ['area_id', 'area_ids', 'cargo_id', 'full_name', 'id', 'profile_image_url'])
  const pagina = await fetch(`${base}/staff/asignables?per_page=1&page=2`, {
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(pagina.status, 200)
  assert.deepEqual((await pagina.json()).data, [data[1]])
  const extra = await fetch(`${base}/staff/asignables/1`, {
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(extra.status, 404)
})


test('tablero de hitos agrupa tareas y permite excluir completadas', async () => {
  const espacio = ESPACIOS[0]
  const hito = HITOS.find((h) => h.project_id === espacio.id)
  const alta = await crear({ name: 'En hito para tablero', rel_type: 'project', rel_id: espacio.id, milestone: hito.id })
  const cerrada = await crear({ name: 'Cerrada en hito', rel_type: 'project', rel_id: espacio.id, milestone: hito.id, status: 5 })
  assert.equal(alta.estado, 201)
  assert.equal(cerrada.estado, 201)
  const ruta = `${base}/projects/${espacio.id}/milestones?vista=tablero&sort=order&per_page=500`
  const respuesta = await fetch(`${ruta}&excluir_completadas=false`, {
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(respuesta.status, 200)
  const grupos = (await respuesta.json()).data
  const grupo = grupos.find((g) => g.columna.id === hito.id)
  assert.equal(grupo.columna.name, hito.name)
  assert.ok(grupo.tarjetas.some((t) => t.id === alta.cuerpo.data.id))
  assert.ok(grupo.tarjetas.some((t) => t.id === cerrada.cuerpo.data.id))
  assert.equal(grupo.pagination.total, grupo.tarjetas.length)
  assert.ok(grupos.find((g) => g.columna.id === 0).tarjetas.every((t) => t.milestone === null))
  const filtrada = await fetch(`${ruta}&excluir_completadas=true`, {
    headers: { authorization: `Bearer ${token}` }
  })
  assert.equal(filtrada.status, 200)
  assert.ok((await filtrada.json()).data.every((g) => g.tarjetas.every((t) => t.status !== 5)))
})
