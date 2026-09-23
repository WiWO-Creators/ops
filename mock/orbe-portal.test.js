/**
 * Pruebas del Thinking Orb del portal en el mock (`mock/orbe-portal.js`, contrato O1).
 *
 * El mock es con lo unico que se mira el orbe del portal antes del backend, asi que tiene que
 * portarse como la API: apagado de fabrica, `capacidades` sin 404, chat apagado en 404, Proyecto
 * ajeno en 404, SSE sin tarjetas de escritura y la opcion editable desde `PATCH /settings`.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let staff
let contacto

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const entrar = async (ruta, cuerpo) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })

    return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
  }

  staff = await entrar('/auth/login', { email: 'ana@wiwo.me', password: 'mock1234' })
  contacto = await entrar('/auth/portal/login', { email: 'clienta@acme.com', password: 'portal1234' })
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Escribe el interruptor como lo hace la pantalla de Administracion. */
async function interruptor (valor) {
  return await fetch(`${base}/settings`, {
    method: 'PATCH',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify({ wiwo_portal_ia_chat: valor })
  })
}

/** Pide algo del orbe como el contacto. */
async function orbe (ruta, opciones = {}) {
  return await fetch(`${base}/portal/ia/${ruta}`, { ...opciones, headers: { ...contacto, ...(opciones.headers ?? {}) } })
}

test('nace apagado: capacidades en false, sin 404, y el chat en 404', async () => {
  const capacidades = await orbe('capacidades')
  assert.equal(capacidades.status, 200)
  assert.deepEqual((await capacidades.json()).data, { habilitado: false })

  assert.equal((await orbe('chat')).status, 404)

  const ajustes = await (await fetch(`${base}/settings`, { headers: staff })).json()
  assert.deepEqual(ajustes.data.editable.wiwo_portal_ia_chat, { group: 'ia', type: 'bool', value: false })
})

test('PATCH /settings rechaza claves ajenas y valores no booleanos sin escribir', async () => {
  const ajena = await fetch(`${base}/settings`, {
    method: 'PATCH',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify({ wiwo_portal_ia_chat: true, otra_cosa: 1 })
  })
  assert.equal(ajena.status, 422)
  assert.equal((await interruptor('tal vez')).status, 422)
  assert.deepEqual((await (await orbe('capacidades')).json()).data, { habilitado: false })
})

test('encendido: conversa por SSE, guarda el hilo por Proyecto y lo borra', async () => {
  assert.equal((await interruptor(true)).status, 200)
  assert.deepEqual((await (await orbe('capacidades')).json()).data, { habilitado: true })

  const respuesta = await orbe('chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ mensaje: '¿Cómo va mi proyecto?', proyecto_id: 1 })
  })
  assert.equal(respuesta.status, 200)
  assert.match(respuesta.headers.get('content-type'), /text\/event-stream/)

  const stream = await respuesta.text()
  assert.match(stream, /event: delta/)
  assert.match(stream, /event: citas/)
  assert.match(stream, /event: fin/)
  assert.doesNotMatch(stream, /event: (propuesta|pregunta|navegar)/)

  const hilo = (await (await orbe('chat?proyecto_id=1')).json()).data
  assert.equal(hilo.mensajes.length, 2)
  assert.equal(hilo.mensajes[0].texto, '¿Cómo va mi proyecto?')
  for (const cita of hilo.mensajes[1].citas) {
    if (cita.tipo !== 'espacio') assert.equal(cita.espacio_id, 1)
  }

  // El hilo general es otro hilo.
  assert.equal((await (await orbe('chat')).json()).data.mensajes.length, 0)

  assert.equal((await orbe('chat?proyecto_id=1', { method: 'DELETE' })).status, 204)
  assert.equal((await (await orbe('chat?proyecto_id=1')).json()).data.mensajes.length, 0)
})

test('un Proyecto ajeno o invalido es 404 y un mensaje vacio es 422', async () => {
  assert.equal((await orbe('chat?proyecto_id=999')).status, 404)
  assert.equal((await orbe('chat?proyecto_id=abc')).status, 404)

  const ajeno = await orbe('chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensaje: 'hola', proyecto_id: 999 })
  })
  assert.equal(ajeno.status, 404)

  const vacio = await orbe('chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensaje: '   ' })
  })
  assert.equal(vacio.status, 422)
})

test('apagarlo de nuevo vuelve el chat a 404', async () => {
  assert.equal((await interruptor(false)).status, 200)
  assert.equal((await orbe('chat')).status, 404)
})
