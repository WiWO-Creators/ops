/**
 * Pruebas de los comentarios de un Proceso y de las Discusiones de su Proyecto.
 *
 * `POST`/`DELETE` de `/tasks/{id}/comments` y `GET /projects/{id}/discussions`. Van contra el
 * servidor porque lo que el panel programa es la forma de la respuesta y, sobre todo, que las dos
 * rutas cuenten la misma conversacion: lo que se comenta en la Tarea sube su discusion al primer
 * lugar del Proyecto.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { PROCESOS } from './datos.js'

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

/** Una Tarea con Proyecto: las sueltas no tienen Discusiones donde aparecer. */
function tareaConProyecto () {
  return PROCESOS.find((p) => p.project !== null && p.project !== undefined)
}

async function discusiones (proyectoId, consulta = '') {
  const respuesta = await fetch(`${base}/projects/${proyectoId}/discussions${consulta}`, { headers })
  assert.equal(respuesta.status, 200)
  return await respuesta.json()
}

test('comentar en una Tarea la sube al primer lugar de las Discusiones del Proyecto', async () => {
  const proceso = tareaConProyecto()
  const ruta = `${base}/tasks/${proceso.id}/comments`

  const alta = await fetch(ruta, { method: 'POST', headers, body: JSON.stringify({ content: '<p>Revisado</p>' }) })
  assert.equal(alta.status, 201)

  const comentario = (await alta.json()).data
  assert.equal(comentario.task_id, proceso.id)
  assert.equal(comentario.parent_id, null)
  assert.notEqual(comentario.staff, null)

  const { data, meta } = await discusiones(proceso.project.id)
  assert.equal(data[0].task.id, proceso.id)
  assert.equal(data[0].last_comment.id, comentario.id)
  assert.ok(data[0].participants.some((p) => p.id === comentario.staff.id && p.is_client === false))
  assert.equal(typeof meta.pagination.total, 'number')
})

test('una respuesta cuelga de su raiz y borrar la raiz se la lleva', async () => {
  const proceso = tareaConProyecto()
  const ruta = `${base}/tasks/${proceso.id}/comments`

  const raiz = (await (await fetch(ruta, { method: 'POST', headers, body: JSON.stringify({ content: '<p>Raiz</p>' }) })).json()).data
  const respuesta = await fetch(ruta, { method: 'POST', headers, body: JSON.stringify({ content: '<p>Hija</p>', parent: raiz.id }) })
  assert.equal(respuesta.status, 201)

  const hija = (await respuesta.json()).data
  assert.equal(hija.parent_id, raiz.id)

  const nieta = await fetch(ruta, { method: 'POST', headers, body: JSON.stringify({ content: '<p>Nieta</p>', parent: hija.id }) })
  assert.equal(nieta.status, 422, 'la API anida un solo nivel')

  const borrado = await fetch(`${ruta}/${raiz.id}`, { method: 'DELETE', headers })
  assert.equal(borrado.status, 204)

  const hilo = (await (await fetch(ruta, { headers })).json()).data
  assert.ok(!hilo.some((c) => c.id === raiz.id || c.id === hija.id))
})

test('un comentario vacio se rechaza con 422 y no se guarda', async () => {
  const proceso = tareaConProyecto()
  const ruta = `${base}/tasks/${proceso.id}/comments`
  const antes = (await (await fetch(ruta, { headers })).json()).data.length

  const vacio = await fetch(ruta, { method: 'POST', headers, body: JSON.stringify({ content: '   ' }) })
  assert.equal(vacio.status, 422)
  assert.deepEqual((await vacio.json()).error.details, { content: ['required'] })

  const despues = (await (await fetch(ruta, { headers })).json()).data.length
  assert.equal(despues, antes)
})

test('la busqueda filtra por nombre de la Tarea y por texto del comentario', async () => {
  const proceso = tareaConProyecto()
  await fetch(`${base}/tasks/${proceso.id}/comments`, {
    method: 'POST', headers, body: JSON.stringify({ content: '<p>palabra-unica-xyz</p>' })
  })

  const porTexto = await discusiones(proceso.project.id, '?q=palabra-unica-xyz')
  assert.deepEqual(porTexto.data.map((c) => c.task.id), [proceso.id])

  const nada = await discusiones(proceso.project.id, '?q=no-existe-en-ninguna-parte')
  assert.equal(nada.data.length, 0)
  assert.equal(nada.meta.pagination.total, 0)
})

test('borrar un comentario que no existe es un 404', async () => {
  const proceso = tareaConProyecto()
  const respuesta = await fetch(`${base}/tasks/${proceso.id}/comments/999999`, { method: 'DELETE', headers })
  assert.equal(respuesta.status, 404)
})
