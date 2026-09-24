/**
 * Fijados, recientes y busqueda global contra el mock: `/me/fijados`, `/me/recientes` y `/search`.
 *
 * Va contra el servidor porque lo que la paleta, el menu y la estrella de las fichas programan es la
 * forma de la respuesta y los codigos de rechazo, los mismos que `pruebas/fijados_y_recientes.php`
 * fija del lado de wiwo-board. Si el mock contesta distinto que la API, la pantalla pasa en local y
 * se cae en produccion.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const { servidor } = await import('./servidor.js')

let base
let headers

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })

  headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${(await respuesta.json()).data.access_token}`
  }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Llama a la API del mock y devuelve estado y cuerpo. */
async function llamar (ruta, metodo = 'GET', cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })
  const texto = await respuesta.text()
  return { estado: respuesta.status, cuerpo: texto === '' ? null : JSON.parse(texto) }
}

test('fijar es idempotente, devuelve la lista y respeta el orden de alta', async () => {
  assert.deepEqual((await llamar('/me/fijados')).cuerpo.data, [])

  await llamar('/me/fijados/project/1', 'PUT')
  await llamar('/me/fijados/client/1', 'PUT')
  const repetido = await llamar('/me/fijados/project/1', 'PUT')

  assert.equal(repetido.estado, 200)
  assert.deepEqual(repetido.cuerpo.data.map((f) => `${f.type}:${f.id}`), ['project:1', 'client:1'])
  assert.deepEqual(repetido.cuerpo.data.map((f) => f.position), [0, 1])
  assert.equal(typeof repetido.cuerpo.data[0].client.company, 'string', 'el Proyecto trae su cliente')
})

test('los rechazos: tipo invalido 422, inexistente 404, quitar lo no fijado 404, orden que no coincide 422', async () => {
  assert.equal((await llamar('/me/fijados/ticket/1', 'PUT')).estado, 422)
  assert.equal((await llamar('/me/fijados/project/99999', 'PUT')).estado, 404)
  assert.equal((await llamar('/me/fijados/project/abc', 'PUT')).estado, 404)
  assert.equal((await llamar('/me/fijados/project/2', 'DELETE')).estado, 404)
  assert.equal((await llamar('/me/fijados', 'PUT', { items: [{ type: 'project', id: 1 }] })).estado, 422)
  assert.equal((await llamar('/me/fijados', 'PUT', { items: 'x' })).estado, 422)
})

test('reordenar y quitar', async () => {
  const orden = await llamar('/me/fijados', 'PUT', { items: [{ type: 'client', id: 1 }, { type: 'project', id: 1 }] })
  assert.deepEqual(orden.cuerpo.data.map((f) => `${f.type}:${f.id}`), ['client:1', 'project:1'])

  const quitado = await llamar('/me/fijados/client/1', 'DELETE')
  assert.deepEqual(quitado.cuerpo.data.map((f) => `${f.type}:${f.id}`), ['project:1'])
})

test('los recientes se deduplican y van del mas nuevo al mas viejo', async () => {
  assert.equal((await llamar('/me/recientes', 'POST', { type: 'project', id: 2 })).estado, 204)
  await llamar('/me/recientes', 'POST', { type: 'client', id: 3 })
  await llamar('/me/recientes', 'POST', { type: 'project', id: 2 })

  const recientes = (await llamar('/me/recientes')).cuerpo.data
  assert.deepEqual(recientes.map((r) => `${r.type}:${r.id}`), ['project:2', 'client:3'])
  assert.equal(typeof recientes[0].viewed_at, 'string')

  assert.equal((await llamar('/me/recientes', 'POST', { type: 'task', id: 2 })).estado, 422)
  assert.equal((await llamar('/me/recientes', 'POST', { type: 'project', id: 'x' })).estado, 422)
  assert.equal((await llamar('/me/recientes', 'POST', { type: 'project', id: 99999 })).estado, 404)
})

test('la busqueda encuentra Tareas y Proyectos por su patente, como la API', async () => {
  const global = (await llamar('/search?q=esp-003&per_type=25')).cuerpo.data
  assert.ok(global.projects.items.some((e) => e.patente === 'ESP-003'), 'el Proyecto por su patente')
  assert.ok(global.tasks.items.length > 0 && global.tasks.items.every((p) => p.patente.startsWith('ESP-003-')),
    'las Tareas de ese Proyecto por su patente')

  const proyectos = (await llamar('/projects?q=ESP-003')).cuerpo.data
  assert.deepEqual(proyectos.map((e) => e.patente), ['ESP-003'])
  const tareas = (await llamar('/tasks?q=ESP-003-01')).cuerpo.data
  assert.deepEqual(tareas.map((p) => p.patente), ['ESP-003-01'])
})

test('la busqueda devuelve un bloque por tipo y valida el termino', async () => {
  const { estado, cuerpo } = await llamar('/search?q=ac&per_type=3')

  assert.equal(estado, 200)
  for (const tipo of ['tasks', 'projects', 'clients']) {
    assert.ok(Array.isArray(cuerpo.data[tipo].items), `${tipo} trae items`)
    assert.ok(cuerpo.data[tipo].items.length <= 3, `${tipo} respeta per_type`)
  }
  assert.ok(cuerpo.data.clients.items.some((c) => c.company === 'Acme SRL'))
  assert.equal(cuerpo.meta.query, 'ac')

  assert.equal((await llamar('/search?q=a')).estado, 422)
  assert.equal((await llamar('/search')).estado, 422)
  assert.equal((await llamar('/search?q=ac&per_type=x')).estado, 422)
})
