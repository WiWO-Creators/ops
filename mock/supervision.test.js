/**
 * Pruebas de la Supervisión diaria en el mock.
 *
 * Lo que se deja clavado es que el mock conteste lo mismo que la API, para que la pantalla se pueda
 * probar en local sin que pase de más:
 *
 *  1. **La hoja trae solo lo vencido a la fecha**, sin completadas, agrupado por cliente.
 *  2. **Solo el propio supervisor escribe**, y una hoja firmada es 409 para todo.
 *  3. **La compuerta del árbol**: la hoja ajena es 403 salvo que uno esté sobre esa persona.
 *  4. **Solo supervisa quien es lead o superior** (422), desde el cliente y desde la persona.
 */

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { reiniciarSupervision } from './supervision.js'

const FECHA = '2026-09-25'

let base
const sesiones = {}

/** Entra con una cuenta del fixture y devuelve su cabecera de autorización. */
async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  sesiones.ana = await entrar('ana@wiwo.me')
  sesiones.diego = await entrar('diego@wiwo.me')
  sesiones.elena = await entrar('elena@wiwo.me')
})

beforeEach(() => { reiniciarSupervision() })

after(() => {
  reiniciarSupervision()

  return new Promise((resolver) => servidor.close(resolver))
})

async function pedir (ruta, { como = 'ana', ...opciones } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...sesiones[como], 'content-type': 'application/json' }
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

async function hoja (como = 'ana', staffId = null) {
  const consulta = staffId === null ? '' : `&staff_id=${staffId}`

  return await pedir(`/supervision/hoja?fecha=${FECHA}${consulta}`, { como })
}

function revisar (cuerpo, como = 'ana') {
  return pedir(`/supervision/hoja/${FECHA}/revisiones`, { como, method: 'PUT', body: JSON.stringify(cuerpo) })
}

test('la hoja trae lo vencido a la fecha, sin completadas, por cliente', async () => {
  const { estado, cuerpo } = await hoja()

  assert.equal(estado, 200)
  assert.equal(cuerpo.data.puede_editar, true)
  assert.equal(cuerpo.data.firma, null)
  assert.ok(cuerpo.data.clientes.length > 0)

  const tareas = cuerpo.data.clientes.flatMap((c) => c.tareas)

  assert.equal(cuerpo.data.totales.tareas, tareas.length)
  assert.ok(tareas.every((t) => t.duedate <= FECHA && t.status !== 5))
  assert.ok(tareas.some((t) => t.dias_atraso === 0), 'hay alguna que vence hoy')
  assert.ok(tareas.some((t) => t.dias_atraso > 0), 'hay alguna atrasada')
  assert.deepEqual(cuerpo.data.clientes.map((c) => c.client_id).sort(), [1, 7])
})

test('marcar, desmarcar y la nota demasiado larga', async () => {
  const tarea = (await hoja()).cuerpo.data.clientes[0].tareas[0]

  const marcada = await revisar({ task_id: tarea.id, estado: 'ok', nota: '  bien  ' })
  assert.equal(marcada.estado, 200)
  assert.equal(marcada.cuerpo.data.estado, 'ok')
  assert.equal(marcada.cuerpo.data.nota, 'bien')
  assert.equal((await hoja()).cuerpo.data.totales.ok, 1)

  const borrada = await revisar({ task_id: tarea.id, estado: null })
  assert.equal(borrada.estado, 200)
  assert.equal(borrada.cuerpo.data, null)
  assert.equal((await hoja()).cuerpo.data.totales.revisadas, 0)

  const larga = await revisar({ task_id: tarea.id, estado: 'no_ok', nota: 'x'.repeat(501) })
  assert.equal(larga.estado, 422)
})

test('422 si la tarea no está en la hoja o el estado es inválido', async () => {
  const tarea = (await hoja()).cuerpo.data.clientes[0].tareas[0]

  assert.equal((await revisar({ task_id: 999999, estado: 'ok' })).estado, 422)
  assert.equal((await revisar({ task_id: tarea.id, estado: 'quizas' })).estado, 422)
  assert.equal((await pedir('/supervision/hoja?fecha=2026-02-31')).estado, 422)
})

test('firmar cierra la hoja: 409 para revisar y para volver a firmar', async () => {
  const tarea = (await hoja()).cuerpo.data.clientes[0].tareas[0]
  await revisar({ task_id: tarea.id, estado: 'ok' })

  const firma = await pedir(`/supervision/hoja/${FECHA}/firma`, { method: 'POST', body: '{}' })
  assert.equal(firma.estado, 200)
  assert.equal(firma.cuerpo.data.staffid, 1)

  const despues = (await hoja()).cuerpo.data
  assert.equal(despues.puede_editar, false)
  assert.equal(despues.firma.nombre, 'Ana Ríos')

  assert.equal((await revisar({ task_id: tarea.id, estado: 'no_ok' })).estado, 409)
  assert.equal((await pedir(`/supervision/hoja/${FECHA}/firma`, { method: 'POST', body: '{}' })).estado, 409)
})

test('la hoja vacía no se firma', async () => {
  const { estado } = await pedir('/supervision/hoja/2020-01-01/firma', { method: 'POST', body: '{}' })

  assert.equal(estado, 422)
})

test('la hoja ajena: la jefatura la lee sin editar, quien no está sobre ella recibe 403', async () => {
  const deDiego = await hoja('ana', 4)
  assert.equal(deDiego.estado, 200)
  assert.equal(deDiego.cuerpo.data.puede_editar, false)

  assert.equal((await hoja('elena', 4)).estado, 403)

  const propia = await hoja('diego')
  assert.equal(propia.cuerpo.data.puede_editar, true)
  assert.deepEqual(propia.cuerpo.data.clientes.map((c) => c.client_id), [3])
})

test('supervisores visibles: la administración ve a todos, cada uno se ve a sí mismo', async () => {
  const deAna = await pedir('/supervision/supervisores')
  assert.deepEqual(deAna.cuerpo.data.map((s) => s.staffid).sort(), [1, 4])
  assert.equal(deAna.cuerpo.data.find((s) => s.staffid === 1).clientes, 2)

  const deDiego = await pedir('/supervision/supervisores', { como: 'diego' })
  assert.deepEqual(deDiego.cuerpo.data.map((s) => s.staffid), [4])
})

test('solo supervisa quien es lead o superior', async () => {
  const conStaff = await pedir('/clients/5/supervisores', { method: 'PUT', body: JSON.stringify({ staff_ids: [6] }) })
  assert.equal(conStaff.estado, 422)
  assert.deepEqual(conStaff.cuerpo.error.details, { staff_ids: ['invalid'] })

  const conLead = await pedir('/clients/5/supervisores', { method: 'PUT', body: JSON.stringify({ staff_ids: [5] }) })
  assert.equal(conLead.estado, 200)
  assert.deepEqual(conLead.cuerpo.data.map((s) => s.staffid), [5])

  const persona = await pedir('/staff/5/supervision')
  assert.deepEqual(persona.cuerpo.data, [{ client_id: 5, company: 'Costa Norte' }])

  const aStaff = await pedir('/staff/6/supervision', { method: 'PUT', body: JSON.stringify({ client_ids: [1] }) })
  assert.equal(aStaff.estado, 422)
})

test('la persona reemplaza sus clientes sin tocar a los otros supervisores', async () => {
  const guardado = await pedir('/staff/4/supervision', { method: 'PUT', body: JSON.stringify({ client_ids: [1, 3] }) })

  assert.equal(guardado.estado, 200)
  assert.deepEqual(guardado.cuerpo.data.map((c) => c.client_id), [1, 3])

  const delCliente = await pedir('/clients/1/supervisores')
  assert.deepEqual(delCliente.cuerpo.data.map((s) => s.staffid).sort(), [1, 4])

  const inexistente = await pedir('/staff/4/supervision', { method: 'PUT', body: JSON.stringify({ client_ids: [999] }) })
  assert.equal(inexistente.estado, 422)
})
