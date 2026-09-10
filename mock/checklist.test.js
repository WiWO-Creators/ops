/**
 * Pruebas de la lista de control de un Proceso — `POST`, `PATCH` y `DELETE` de `/tasks/{id}/checklist`.
 *
 * Van contra el servidor y no contra las funciones porque lo que el panel programa es la forma de la
 * respuesta: el item creado con su `order`, el `finished` ya cambiado, el `204` sin cuerpo y el `422`
 * del texto vacio. Cubren tambien el `nl2br()` que la API aplica al guardar, que es la razon por la
 * que el panel pinta la descripcion con `aTextoPlano()` en vez de a secas.
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

test('un item se agrega al final, se tilda y se borra', async () => {
  const proceso = PROCESOS[0]
  const ruta = `${base}/tasks/${proceso.id}/checklist`
  const antes = (await (await fetch(ruta, { headers })).json()).data

  const alta = await fetch(ruta, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: 'Pedir la firma\nY archivarla' })
  })
  assert.equal(alta.status, 201)

  const item = (await alta.json()).data
  assert.equal(item.finished, false)
  assert.equal(item.order, antes.length + 1)
  assert.equal(item.task_id, proceso.id)
  // Los saltos vuelven como HTML, igual que en la API: `nl2br()` al guardar.
  assert.match(item.description, /<br \/>/)

  const lista = (await (await fetch(ruta, { headers })).json()).data
  assert.equal(lista.length, antes.length + 1)
  assert.equal(lista.at(-1).id, item.id)

  const tildado = await fetch(`${ruta}/${item.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ finished: true })
  })
  assert.equal(tildado.status, 200)
  assert.equal((await tildado.json()).data.finished, true)

  const borrado = await fetch(`${ruta}/${item.id}`, { method: 'DELETE', headers })
  assert.equal(borrado.status, 204)
  assert.equal((await borrado.text()).length, 0)

  const final = (await (await fetch(ruta, { headers })).json()).data
  assert.deepEqual(final.map((c) => c.id), antes.map((c) => c.id))
})

test('el texto vacio y el item inexistente no pasan', async () => {
  const ruta = `${base}/tasks/${PROCESOS[0].id}/checklist`

  for (const description of ['', '   ', '<b></b>', null]) {
    const respuesta = await fetch(ruta, { method: 'POST', headers, body: JSON.stringify({ description }) })
    assert.equal(respuesta.status, 422, `deberia rechazar ${JSON.stringify(description)}`)
  }

  const inexistente = await fetch(`${ruta}/999999`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ finished: true })
  })
  assert.equal(inexistente.status, 404)
})
