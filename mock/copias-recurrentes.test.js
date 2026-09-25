/**
 * Pruebas del historial de copias de una recurrencia en el mock: `/copias`, el `usage` de cada regla,
 * `/limpiar` y la constancia en `GET /tasks/{id}`.
 *
 * Contra el servidor, como `recurrentes.test.js`: lo que se rompe en silencio es la forma y los
 * codigos, no la aritmetica.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let admin
let noAdmin

/** Entra con un usuario y devuelve sus cabeceras. */
async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return { 'content-type': 'application/json', authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  admin = await entrar('ana@wiwo.me')
  noAdmin = await entrar('carla@wiwo.me')
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Un pedido con JSON de ida y vuelta. */
async function pedir (ruta, { metodo = 'GET', cuerpo, cabeceras = admin } = {}) {
  const respuesta = await fetch(`${base}/${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })

  return { estado: respuesta.status, cuerpo: respuesta.status === 204 ? null : await respuesta.json() }
}

const regla = async (id) => (await pedir('tasks/recurrentes')).cuerpo.data.find((r) => r.id === id)

test('la regla sembrada sin uso trae su racha, y la mixta no', async () => {
  const sinUso = await regla(502)
  assert.deepEqual(Object.keys(sinUso.usage).sort(), ['alerted_at', 'streak', 'untouched_count', 'unused'])
  assert.equal(sinUso.usage.streak, 4)
  assert.equal(sinUso.usage.untouched_count, 4)
  assert.equal(sinUso.usage.unused, true)
  assert.equal(typeof sinUso.usage.alerted_at, 'string')

  const mixta = await regla(503)
  assert.equal(mixta.usage.streak, 0, 'La copia evaluable mas reciente se completo')
  assert.equal(mixta.usage.unused, false)
  assert.equal(mixta.usage.untouched_count, 1)
  assert.equal(mixta.usage.alerted_at, null)
})

test('las copias salen de la mas nueva a la mas vieja, con sus motivos, la vigente y la papelera', async () => {
  const { estado, cuerpo } = await pedir('tasks/recurrentes/503/copias')
  assert.equal(estado, 200)
  const claves = ['created_at', 'deleted', 'due_date', 'evaluable', 'id', 'name', 'start_date', 'status', 'touched', 'touched_reasons']
  for (const copia of cuerpo.data) assert.deepEqual(Object.keys(copia).sort(), claves)
  assert.equal(cuerpo.meta.total, cuerpo.data.length)

  const porId = Object.fromEntries(cuerpo.data.map((c) => [c.id, c]))
  assert.equal(cuerpo.data[0].id, 9013)
  assert.equal(porId[9013].evaluable, false, 'La vigente todavia no termina su ciclo')
  assert.deepEqual(porId[9012].touched_reasons, ['estado'])
  assert.equal(porId[9011].touched, false)
  assert.ok(porId[522].touched_reasons.includes('comentario'))

  const papelera = (await pedir('tasks/recurrentes/502/copias')).cuerpo.data.find((c) => c.id === 9005)
  assert.equal(papelera.deleted, true)

  assert.equal((await pedir('tasks/recurrentes/500/copias')).estado, 404, 'La 500 no es recurrente')
})

test('la ficha de una copia dice de que regla es, y la de una madre cuantas copias tiene', async () => {
  const copia = (await pedir('tasks/9001')).cuerpo.data
  assert.deepEqual(copia.recurring_from, { id: 502, name: copia.name })
  const madre = (await pedir('tasks/502')).cuerpo.data
  assert.equal(madre.recurring_from, null)
  assert.equal(madre.recurring_copies_count, 5, 'Cuenta tambien la que esta en la papelera')

  const lista = (await pedir('tasks?per_page=200')).cuerpo.data
  assert.ok(lista.every((t) => Object.hasOwn(t, 'recurring_from_id')))
})

test('limpiar es solo para administradores', async () => {
  const { estado, cuerpo } = await pedir('tasks/recurrentes/502/limpiar', { metodo: 'POST', cuerpo: { modo: 'validar' }, cabeceras: noAdmin })
  assert.equal(estado, 403)
  assert.equal(cuerpo.error.code, 'solo_administradores')
})

test('validar separa candidatas y conservadas, con la vigente marcada', async () => {
  const { estado, cuerpo } = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'validar' } })
  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data.candidatas.map((c) => [c.id, c.vigente === true]), [[9013, true], [9011, false]])
  assert.deepEqual(cuerpo.data.conservadas.map((c) => c.id).sort(), [522, 9012])
  assert.ok(cuerpo.data.conservadas.every((c) => c.touched_reasons.length > 0))
})

test('aplicar rechaza ids ajenos y omite la copia que alguien toco despues de validar', async () => {
  const ajeno = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [9011, 9001] } })
  assert.equal(ajeno.estado, 422)
  assert.deepEqual(ajeno.cuerpo.error.details, { ids: ['no_candidata'] })
  assert.deepEqual((await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: 'todas' } })).cuerpo.error.details, { ids: ['invalid'] })
  assert.deepEqual((await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [9011], detener: 'borrar' } })).cuerpo.error.details, { detener: ['invalid'] })

  // Entre validar y aplicar, alguien comenta la 9013.
  await pedir('tasks/9013/comments', { metodo: 'POST', cuerpo: { content: 'La reviso hoy' } })

  const { estado, cuerpo } = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [9011, 9013] } })
  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data, { eliminadas: [9011], omitidas: [{ id: 9013, motivo: 'tocada' }], detenida: null })
  assert.equal((await pedir('tasks/9011')).estado, 404, 'Salio de la lista viva')
  const copias = (await pedir('tasks/recurrentes/503/copias')).cuerpo.data
  assert.equal(copias.find((c) => c.id === 9011).deleted, true)
})

test('una copia que otro ya movio vuelve como ya_no_disponible, y ids vacio sin detener no hace nada', async () => {
  const otraVez = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [9011] } })
  assert.equal(otraVez.estado, 200)
  assert.deepEqual(otraVez.cuerpo.data, { eliminadas: [], omitidas: [{ id: 9011, motivo: 'ya_no_disponible' }], detenida: null })

  const nada = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [] } })
  assert.equal(nada.estado, 200)
  assert.deepEqual(nada.cuerpo.data, { eliminadas: [], omitidas: [], detenida: null })
})

test('solo detener: ids vacio deja de repetir, y detener otra vez es sin_recurrencia', async () => {
  const deja = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [], detener: 'dejar_de_repetir' } })
  assert.equal(deja.estado, 200)
  assert.deepEqual(deja.cuerpo.data, { eliminadas: [], omitidas: [], detenida: 'dejar_de_repetir' })
  assert.equal((await pedir('tasks/503')).cuerpo.data.recurring, false)

  const otra = await pedir('tasks/recurrentes/503/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [], detener: 'pausar' } })
  assert.equal(otra.estado, 422)
  assert.deepEqual(otra.cuerpo.error.details, { detener: ['sin_recurrencia'] })
  assert.equal((await pedir('tasks/recurrentes/503/copias')).estado, 200, 'El historial sigue disponible')
})

test('aplicar con detener pausa la regla y deja la racha en cero', async () => {
  const { cuerpo } = await pedir('tasks/recurrentes/502/limpiar', { metodo: 'POST', cuerpo: { modo: 'aplicar', ids: [9001, 9002, 9003, 9004], detener: 'pausar' } })
  assert.deepEqual(cuerpo.data, { eliminadas: [9001, 9002, 9003, 9004], omitidas: [], detenida: 'pausar' })

  const despues = await regla(502)
  assert.equal(despues.state, 'pausada')
  assert.equal(despues.usage.streak, 0)
  assert.equal(despues.usage.unused, false)
})

test('una regla pausada es pausada aunque ya haya cumplido su fin', async () => {
  assert.equal((await regla(510)).state, 'terminada')
  await pedir('tasks/510', { metodo: 'PATCH', cuerpo: { recurring_paused: true } })
  assert.equal((await regla(510)).state, 'pausada')
})

test('editar una copia la marca con movimiento', async () => {
  await pedir('tasks/520', { metodo: 'PATCH', cuerpo: { priority: 3 } })
  const copia = (await pedir('tasks/recurrentes/501/copias')).cuerpo.data.find((c) => c.id === 520)
  assert.ok(copia.touched_reasons.includes('edicion'))
})
