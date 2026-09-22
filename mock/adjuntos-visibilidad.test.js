/**
 * Visibilidad de un adjunto para el cliente — `PATCH /{tasks|projects}/{id}/files/{fileId}`.
 *
 * Van contra el servidor porque lo que el panel programa es el contrato: la fila de vuelta con la
 * forma del `GET`, el `404` de un adjunto que es de otra entidad y el `422` con la clave precisa.
 * Es el mismo orden de guardas que `Adjunto::cambiarVisibilidad()` en la API.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { ARCHIVOS, PROCESOS } from './datos.js'

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

/** Manda el PATCH y devuelve estado y cuerpo ya leidos. */
async function parchear (ruta, cuerpo) {
  const respuesta = await fetch(`${base}/${ruta}`, {
    method: 'PATCH',
    headers,
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

test('el adjunto de una tarea se publica y se oculta, y el GET lo refleja', async () => {
  const archivo = ARCHIVOS[0]
  const ruta = `tasks/${archivo.rel_id}/files/${archivo.id}`

  const publicado = await parchear(ruta, { visible_to_customer: true })
  assert.equal(publicado.estado, 200)
  assert.equal(publicado.cuerpo.data.id, archivo.id)
  assert.equal(publicado.cuerpo.data.visible_to_customer, true)

  const lista = (await (await fetch(`${base}/tasks/${archivo.rel_id}/files`, { headers })).json()).data
  assert.equal(lista.find((a) => a.id === archivo.id).visible_to_customer, true)

  const oculto = await parchear(ruta, { visible_to_customer: 0 })
  assert.equal(oculto.estado, 200)
  assert.equal(oculto.cuerpo.data.visible_to_customer, false)
})

test('el adjunto se cambia tambien desde el Espacio del que cuelga su tarea', async () => {
  const archivo = ARCHIVOS.find((a) => PROCESOS.find((p) => p.id === a.rel_id)?.project)
  const espacioId = PROCESOS.find((p) => p.id === archivo.rel_id).project.id

  const respuesta = await parchear(`projects/${espacioId}/files/${archivo.id}`, { visible_to_customer: true })
  assert.equal(respuesta.estado, 200)
  assert.equal(respuesta.cuerpo.data.visible_to_customer, true)

  await parchear(`projects/${espacioId}/files/${archivo.id}`, { visible_to_customer: false })
})

test('un adjunto de otra entidad o inexistente es 404', async () => {
  const archivo = ARCHIVOS[0]
  const otraTarea = PROCESOS.find((p) => p.id !== archivo.rel_id)

  assert.equal((await parchear(`tasks/${otraTarea.id}/files/${archivo.id}`, { visible_to_customer: true })).estado, 404)
  assert.equal((await parchear(`tasks/${archivo.rel_id}/files/999999`, { visible_to_customer: true })).estado, 404)
})

test('el cuerpo es estricto: sin la clave, con otra o con un valor no booleano es 422', async () => {
  const archivo = ARCHIVOS[0]
  const ruta = `tasks/${archivo.rel_id}/files/${archivo.id}`

  const vacio = await parchear(ruta, {})
  assert.equal(vacio.estado, 422)
  assert.deepEqual(vacio.cuerpo.error.details, { visible_to_customer: ['required'] })

  const texto = await parchear(ruta, { visible_to_customer: 'si', file_name: 'x' })
  assert.equal(texto.estado, 422)
  assert.deepEqual(texto.cuerpo.error.details, { file_name: ['no_editable'], visible_to_customer: ['invalid'] })

  assert.equal((await parchear(ruta, 'null')).estado, 400)
  assert.equal(ARCHIVOS[0].visible_to_customer, false)
})
