/**
 * Pruebas de `POST /impersonate` — la sesión que un superadministrador abre como otra persona.
 *
 * Van contra el servidor y no contra una función porque lo que importa es la forma HTTP: el frontend
 * guarda cookies según eso. Lo que se cubre es la puerta, no el camino feliz: quién NO puede pedirla
 * y qué destinos se rechazan, que es donde un error se convierte en una sesión regalada.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { STAFF } from './datos.js'

let base
let tokenSuper
let tokenComun

/** Entra y devuelve el token de acceso. */
async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return (await respuesta.json()).data.access_token
}

/** Pide la suplantación con el token dado. */
async function suplantar (token, staffId) {
  const respuesta = await fetch(`${base}/impersonate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ staff_id: staffId })
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  // Ana es la única superadministradora del fixture; Carla es staff común (Bruno tiene 2FA y su
  // login no devuelve token en un paso).
  tokenSuper = await entrar('ana@wiwo.me')
  tokenComun = await entrar('carla@wiwo.me')
})

after(() => new Promise((resolver) => servidor.close(resolver)))

test('un superadministrador recibe una sesión de la otra persona', async () => {
  const { estado, cuerpo } = await suplantar(tokenSuper, STAFF[2].id)

  assert.equal(estado, 201)
  assert.equal(cuerpo.data.staff.id, STAFF[2].id)
  assert.ok(cuerpo.data.access_token)

  // La prueba real: el token prestado contesta `/me` como esa persona, no como quien lo pidió.
  const yo = await fetch(`${base}/me`, {
    headers: { authorization: `Bearer ${cuerpo.data.access_token}` }
  })

  assert.equal((await yo.json()).data.id, STAFF[2].id)
})

test('un staff común no puede suplantar a nadie', async () => {
  const { estado, cuerpo } = await suplantar(tokenComun, STAFF[3].id)

  assert.equal(estado, 403)
  assert.equal(cuerpo.error.code, 'forbidden')
})

test('sin token no hay suplantación', async () => {
  const respuesta = await fetch(`${base}/impersonate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ staff_id: STAFF[2].id })
  })

  assert.equal(respuesta.status, 401)
})

test('suplantarse a uno mismo se rechaza', async () => {
  const { estado } = await suplantar(tokenSuper, STAFF[0].id)

  assert.equal(estado, 422)
})

test('una cuenta dada de baja no se puede suplantar', async () => {
  const inactiva = STAFF.find((s) => !s.active)
  const { estado } = await suplantar(tokenSuper, inactiva.id)

  assert.equal(estado, 422)
})

test('un id que no es de nadie da 404', async () => {
  const { estado } = await suplantar(tokenSuper, 99999)

  assert.equal(estado, 404)
})

test('sin `staff_id` es un error de validación, no un 500', async () => {
  const respuesta = await fetch(`${base}/impersonate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenSuper}` },
    body: JSON.stringify({})
  })

  assert.equal(respuesta.status, 422)
})
