/**
 * Pruebas de la fecha de vencimiento por cliente en el mock: `GET|PUT
 * /clients/{id}/tareas-sin-vencimiento` y `GET /tasks/vencimiento-requerido`.
 *
 * Lo que se deja clavado es que el mock conteste lo mismo que la API, para que la ficha del cliente
 * y los formularios de tarea se puedan probar en local sin que pasen de mas:
 *
 *  1. **Todo cliente nace exigiendo fecha.** Un mock que naciera permisivo probaria siempre el caso
 *     que en produccion no existe.
 *  2. **El PUT sin booleano es 422**, no un "apagado" por omision.
 *  3. **La consulta sigue la relacion**: `project` mira el cliente del Proyecto, `customer` el
 *     cliente mismo, y lo demas no exige.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { CLIENTES_SIN_VENCIMIENTO, ESPACIOS } from './datos.js'

let base
let staff

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })

  staff = { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
})

after(() => {
  CLIENTES_SIN_VENCIMIENTO.clear()

  return new Promise((resolver) => servidor.close(resolver))
})

/** Un Proyecto con cliente, para consultar por `project`. */
function proyectoConCliente () {
  return ESPACIOS.find((e) => e.clientid > 0)
}

async function pedir (ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...staff, 'content-type': 'application/json', ...(opciones.headers ?? {}) }
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

async function requerido (relType, relId) {
  const { estado, cuerpo } = await pedir(`/tasks/vencimiento-requerido?rel_type=${relType}&rel_id=${relId}`)

  assert.equal(estado, 200)

  return cuerpo.data.requerido
}

test('todo cliente nace exigiendo fecha', async () => {
  const proyecto = proyectoConCliente()
  const { estado, cuerpo } = await pedir(`/clients/${proyecto.clientid}/tareas-sin-vencimiento`)

  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data, { sin_vencimiento: false })
  assert.equal(await requerido('project', proyecto.id), true)
  assert.equal(await requerido('customer', proyecto.clientid), true)
})

test('habilitar al cliente deja de exigir, por proyecto y por cliente', async () => {
  const proyecto = proyectoConCliente()
  const guardado = await pedir(`/clients/${proyecto.clientid}/tareas-sin-vencimiento`, {
    method: 'PUT',
    body: JSON.stringify({ sin_vencimiento: true })
  })

  assert.equal(guardado.estado, 200)
  assert.deepEqual(guardado.cuerpo.data, { sin_vencimiento: true })
  assert.equal(await requerido('project', proyecto.id), false)
  assert.equal(await requerido('customer', proyecto.clientid), false)

  await pedir(`/clients/${proyecto.clientid}/tareas-sin-vencimiento`, {
    method: 'PUT',
    body: JSON.stringify({ sin_vencimiento: false })
  })
  assert.equal(await requerido('project', proyecto.id), true)
})

test('el PUT sin booleano es 422', async () => {
  const proyecto = proyectoConCliente()
  const { estado, cuerpo } = await pedir(`/clients/${proyecto.clientid}/tareas-sin-vencimiento`, {
    method: 'PUT',
    body: JSON.stringify({ sin_vencimiento: 'si' })
  })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details, { sin_vencimiento: ['no_booleano'] })
})

test('sin cliente no se exige fecha', async () => {
  const interno = ESPACIOS.find((e) => e.clientid === 0)

  if (interno !== undefined) assert.equal(await requerido('project', interno.id), false)
  assert.equal(await requerido('lead', 3), false)
  assert.equal(await requerido('project', ''), false)
})
