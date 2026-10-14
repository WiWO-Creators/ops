/**
 * Pruebas de la edicion de Tareas por contactos del cliente en el mock: `PATCH /portal/tasks/{id}`.
 *
 * Se deja clavado que el mock se porte como el contrato:
 *
 *  1. **Mismo interruptor que el alta**: apagado es 404; sin la pestaña de Tareas es 403; una Tarea de
 *     otro cliente es 404, nunca 403.
 *  2. **Lista blanca**: solo nombre, descripcion (con `format`), vencimiento, prioridad y estado. Lo
 *     demas es 422 `no_editable`, y un cuerpo vacio tambien es 422.
 *  3. **Estado**: solo 11 (cancelar una abierta) o 1 (reabrir una Cancelada). Otro valor es 422; cancelar
 *     una cerrada, reabrir una que no esta Cancelada o editar campos de una cerrada es 409.
 *  4. **Vencimiento**: `null` es 422 si el cliente lo exige; una fecha pasada solo se rechaza si cambio.
 */

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { CLIENTES_CREAN_TAREAS, CLIENTES_SIN_VENCIMIENTO, PROCESOS } from './datos.js'
import { reiniciarTareasDelPortal } from './tareas-del-portal.js'

let base
let staff
let clienta

/** Entra como staff o como contacto y devuelve la cabecera de autorizacion. */
async function entrar (ruta, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })

  return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  staff = await entrar('/auth/login', { email: 'ana@wiwo.me', password: 'mock1234' })
  clienta = await entrar('/auth/portal/login', { email: 'clienta@acme.com', password: 'portal1234' })
})

afterEach(() => {
  CLIENTES_CREAN_TAREAS.clear()
  CLIENTES_SIN_VENCIMIENTO.clear()
  reiniciarTareasDelPortal()
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Pide como el actor que se indique. */
async function pedir (actor, ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...actor, 'content-type': 'application/json' },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body)
  })
  const texto = await respuesta.text()

  return { estado: respuesta.status, cuerpo: texto === '' ? null : JSON.parse(texto) }
}

/** Enciende el interruptor del cliente 1 (Acme), como la ficha del cliente. */
async function encender () {
  return await pedir(staff, '/clients/1/portal-crea-tareas', { method: 'PUT', body: { habilitado: true } })
}

/** `PATCH /portal/tasks/{id}` como la clienta. */
async function editar (id, cuerpo) {
  return await pedir(clienta, `/portal/tasks/${id}`, { method: 'PATCH', body: cuerpo })
}

/** Crea una Tarea del portal en el Proyecto 1 y devuelve su id. */
async function nuevaTarea () {
  await encender()

  const creada = await pedir(clienta, '/portal/projects/1/tasks', {
    method: 'POST',
    body: { name: `Tarea de prueba ${PROCESOS.length}`, due_date: '2027-03-15' }
  })

  assert.equal(creada.estado, 201)

  return creada.cuerpo.data.id
}

test('apagado, editar es 404 aunque la Tarea sea del Proyecto', async () => {
  const id = await nuevaTarea()

  CLIENTES_CREAN_TAREAS.clear()

  assert.equal((await editar(id, { name: 'Otro' })).estado, 404)
})

test('edita nombre, descripcion en HTML, vencimiento y prioridad, y devuelve la ficha', async () => {
  const id = await nuevaTarea()
  const respuesta = await editar(id, {
    name: '  Nuevo nombre  ',
    description: '<p>Con <strong>detalle</strong></p>',
    format: 'html',
    due_date: '2027-05-20',
    priority: 4
  })

  assert.equal(respuesta.estado, 200)
  assert.equal(respuesta.cuerpo.data.name, 'Nuevo nombre')
  assert.equal(respuesta.cuerpo.data.description_html, '<p>Con <strong>detalle</strong></p>')
  assert.match(respuesta.cuerpo.data.description, /Con detalle/)
  assert.equal(respuesta.cuerpo.data.due_date, '2027-05-20')
  assert.equal(respuesta.cuerpo.data.priority, 4)
})

test('una clave que no se edita desde el portal es 422 no_editable, y un cuerpo vacio tambien', async () => {
  const id = await nuevaTarea()
  const ajena = await editar(id, { billable: true, name: 'X' })

  assert.equal(ajena.estado, 422)
  assert.deepEqual(ajena.cuerpo.error.details.billable, ['no_editable'])
  assert.equal((await editar(id, {})).estado, 422)
})

test('el nombre vacio o pasado de largo es 422', async () => {
  const id = await nuevaTarea()

  assert.deepEqual((await editar(id, { name: '   ' })).cuerpo.error.details.name, ['requerido'])
  assert.deepEqual((await editar(id, { name: 'a'.repeat(192) })).cuerpo.error.details.name, ['demasiado_largo'])
})

test('quitar el vencimiento es 422 si el cliente lo exige, y se permite si no', async () => {
  const id = await nuevaTarea()

  assert.deepEqual((await editar(id, { due_date: null })).cuerpo.error.details.due_date, ['requerido_por_cliente'])

  CLIENTES_SIN_VENCIMIENTO.add(1)

  const respuesta = await editar(id, { due_date: null })

  assert.equal(respuesta.estado, 200)
  assert.equal(respuesta.cuerpo.data.due_date, null)
})

test('una fecha anterior a hoy se rechaza solo si cambio', async () => {
  const id = await nuevaTarea()

  assert.deepEqual((await editar(id, { due_date: '2020-01-01' })).cuerpo.error.details.due_date, ['anterior_al_inicio'])

  PROCESOS.find((p) => p.id === id).due_date = '2020-01-01'

  assert.equal((await editar(id, { due_date: '2020-01-01', name: 'Sigue igual' })).estado, 200)
})

test('cancelar y reabrir: 11 cierra la Tarea y 1 la devuelve a Por iniciar', async () => {
  const id = await nuevaTarea()
  const cancelada = await editar(id, { status: 11 })

  assert.equal(cancelada.estado, 200)
  assert.equal(cancelada.cuerpo.data.status, 11)
  assert.equal(cancelada.cuerpo.data.date_finished, null)

  const reabierta = await editar(id, { status: 1 })

  assert.equal(reabierta.estado, 200)
  assert.equal(reabierta.cuerpo.data.status, 1)
})

test('409: cancelar una cerrada, reabrir una abierta y editar campos de una Cancelada', async () => {
  const id = await nuevaTarea()
  const tarea = PROCESOS.find((p) => p.id === id)

  assert.equal((await editar(id, { status: 1 })).estado, 409, 'reabrir una que no esta Cancelada')

  await editar(id, { status: 11 })

  assert.equal((await editar(id, { status: 11 })).estado, 409, 'cancelar la ya cancelada')
  assert.equal((await editar(id, { name: 'Tarde' })).estado, 409, 'editar una Cancelada')

  tarea.status = 5

  assert.equal((await editar(id, { status: 11 })).estado, 409, 'cancelar una completa')
  assert.equal((await editar(id, { name: 'Tarde' })).estado, 409, 'editar una completa')
})

test('cualquier otro estado es 422', async () => {
  const id = await nuevaTarea()

  for (const status of [2, 5, 9, 10, 'x']) {
    assert.deepEqual((await editar(id, { status })).cuerpo.error.details.status, ['no_valido'], String(status))
  }
})

test('una Tarea de otro cliente es 404 y un Proyecto sin la pestaña de Tareas es 403', async () => {
  await encender()

  const ajena = PROCESOS.find((p) => p.rel_type === 'project' && p.rel_id === 2)
  const sinPestania = PROCESOS.find((p) => p.rel_type === 'project' && p.rel_id === 8)

  assert.equal((await editar(ajena.id, { name: 'X' })).estado, 404)
  assert.equal((await editar(sinPestania.id, { name: 'X' })).estado, 403)
  assert.equal((await editar(999999, { name: 'X' })).estado, 404)
})

test('el alta acepta `format` y guarda la descripcion como HTML', async () => {
  await encender()

  const creada = await pedir(clienta, '/portal/projects/1/tasks', {
    method: 'POST',
    body: { name: 'Con formato', due_date: '2027-03-15', description: '<p>Hola <em>equipo</em></p>', format: 'html' }
  })

  assert.equal(creada.estado, 201)

  const ficha = await pedir(clienta, `/portal/projects/1/tasks/${creada.cuerpo.data.id}`)

  assert.equal(ficha.cuerpo.data.description_html, '<p>Hola <em>equipo</em></p>')
  assert.match(ficha.cuerpo.data.description, /Hola equipo/)
})
