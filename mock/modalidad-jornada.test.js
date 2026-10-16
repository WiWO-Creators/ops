/**
 * La modalidad de la jornada contra el mock — `POST` y `PATCH /me/jornada`, y la fila de `GET /live`.
 *
 * Va contra el servidor y no contra las funciones porque lo que el panel programa es la forma de la
 * respuesta: `open.modalidad` en `null` mientras nadie la elige, el 422 de un valor fuera de la lista,
 * el PATCH que exige la clave (y que con `null` explícito la quita) y `jornada.modalidad` en cada fila
 * del tablero, que es lo que pinta «Teletrabajo» en las tarjetas del equipo.
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

/** Cierra la jornada que haya y abre otra con el cuerpo dado; devuelve la respuesta cruda. */
async function abrir (cuerpo) {
  await fetch(`${base}/me/jornada/cierre`, { method: 'POST', headers, body: '{}' })

  return await fetch(`${base}/me/jornada`, { method: 'POST', headers, body: JSON.stringify(cuerpo) })
}

/** Manda un PATCH a la jornada propia. */
async function parchear (cuerpo) {
  return await fetch(`${base}/me/jornada`, { method: 'PATCH', headers, body: JSON.stringify(cuerpo) })
}

test('abrir sin modalidad deja null, y con ella la devuelve', async () => {
  const sin = await abrir({})

  assert.equal(sin.status, 201)
  assert.equal((await sin.json()).data.open.modalidad, null)

  const con = await abrir({ modalidad: 'teletrabajo' })

  assert.equal(con.status, 201)
  assert.equal((await con.json()).data.open.modalidad, 'teletrabajo')
})

test('una modalidad fuera de la lista es 422 y no abre la jornada', async () => {
  await fetch(`${base}/me/jornada/cierre`, { method: 'POST', headers, body: '{}' })

  const respuesta = await fetch(`${base}/me/jornada`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ modalidad: 'remoto' })
  })

  assert.equal(respuesta.status, 422)

  const estado = await (await fetch(`${base}/me/jornada`, { headers })).json()

  assert.equal(estado.data.open, null, 'el 422 no deja una jornada a medias')
})

test('el PATCH cambia la modalidad con la jornada abierta y null la quita', async () => {
  await abrir({ modalidad: 'oficina' })

  const remota = await parchear({ modalidad: 'teletrabajo' })

  assert.equal(remota.status, 200)
  assert.equal((await remota.json()).data.open.modalidad, 'teletrabajo')

  const quitada = await parchear({ modalidad: null })

  assert.equal((await quitada.json()).data.open.modalidad, null)

  assert.equal((await parchear({ modalidad: 'hibrido' })).status, 422)
  assert.equal((await parchear({})).status, 422, 'sin ninguna clave sigue siendo el 422 del Cliente')
})

test('el PATCH con modalidad no pisa el Cliente si no lo manda', async () => {
  await abrir({ modalidad: 'oficina' })
  await parchear({ client_id: 1 })

  const estado = await (await parchear({ modalidad: 'teletrabajo' })).json()

  assert.equal(estado.data.open.modalidad, 'teletrabajo')
  assert.notEqual(estado.data.open.client, null, 'el Cliente sigue donde estaba')
})

test('sin jornada abierta el PATCH de modalidad es 409', async () => {
  await fetch(`${base}/me/jornada/cierre`, { method: 'POST', headers, body: '{}' })

  assert.equal((await parchear({ modalidad: 'oficina' })).status, 409)
})

test('el tablero publica jornada.modalidad en cada fila con jornada', async () => {
  await abrir({ modalidad: 'teletrabajo' })

  const tablero = (await (await fetch(`${base}/live`, { headers })).json()).data
  const conJornada = tablero.filter((fila) => fila.jornada !== null)

  assert.ok(conJornada.length > 0, 'el mock reparte jornadas al tablero')
  for (const fila of conJornada) {
    assert.ok(
      fila.jornada.modalidad === null || ['oficina', 'teletrabajo'].includes(fila.jornada.modalidad),
      'la clave existe y es una modalidad o null'
    )
  }
  assert.ok(conJornada.some((fila) => fila.jornada.modalidad === 'teletrabajo'), 'hay alguien en teletrabajo')
})
