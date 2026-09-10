/**
 * Pruebas de `GET|PUT /staff/{id}/nivel` — el escalón de la escalera de permisos.
 *
 * Van contra el servidor y no contra una función porque lo que importa es la puerta: quién puede
 * repartir el escalón y qué se rechaza. Tres cosas que, si se rompen, no se ven hasta producción:
 *
 *   1. Que **solo un superadministrador** reparta, y **nunca sobre su propia ficha**.
 *   2. Que `admin` y `superadmin` **no se puedan escribir por acá**. Salen de las banderas de Perfex,
 *      y esta puerta se saltea los guards que protegen al último superadministrador activo.
 *   3. Que `null` **devuelva a la persona al escalón de su rol**, que no es lo mismo que `usuario`.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { STAFF } from './datos.js'

let base
let tokenSuper
let tokenComun

// Ana es la única superadministradora del fixture; Carla es staff común (Bruno tiene 2FA y su login
// no devuelve token en un paso).
const ANA = STAFF[0]
const CARLA = STAFF[2]

async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return (await respuesta.json()).data.access_token
}

async function pedirNivel (token, staffId) {
  const respuesta = await fetch(`${base}/staff/${staffId}/nivel`, {
    headers: { authorization: `Bearer ${token}` }
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

async function ponerNivel (token, staffId, nivel) {
  const respuesta = await fetch(`${base}/staff/${staffId}/nivel`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ nivel })
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  tokenSuper = await entrar('ana@wiwo.me')
  tokenComun = await entrar('carla@wiwo.me')
})

after(async () => {
  // El override vive en memoria del módulo: dejarlo puesto le cambia el fixture a las demás pruebas.
  await ponerNivel(tokenSuper, CARLA.id, null)
  await new Promise((resolver) => servidor.close(resolver))
})

test('un staff común no reparte escalones', async () => {
  const { estado, cuerpo } = await ponerNivel(tokenComun, ANA.id, 'head')

  assert.equal(estado, 403)
  assert.equal(cuerpo.error.code, 'forbidden')
})

test('nadie se cambia el escalón a sí mismo', async () => {
  const { estado } = await ponerNivel(tokenSuper, ANA.id, 'head')

  assert.equal(estado, 409)
})

test('los dos escalones de arriba no se escriben por esta puerta', async () => {
  for (const nivel of ['admin', 'superadmin']) {
    const { estado, cuerpo } = await ponerNivel(tokenSuper, CARLA.id, nivel)

    assert.equal(estado, 422, nivel)
    assert.deepEqual(cuerpo.error.details.nivel, [`unknown:${nivel}`])
  }
})

test('poner un escalón y quitarlo devuelve a la persona a su rol', async () => {
  const heredado = (await pedirNivel(tokenSuper, CARLA.id)).cuerpo.data

  assert.equal(heredado.nivel_asignado, null, 'arranca heredando')

  const puesto = await ponerNivel(tokenSuper, CARLA.id, 'head')

  assert.equal(puesto.estado, 200)
  assert.deepEqual(puesto.cuerpo.data, { nivel: 'head', nivel_asignado: 'head' })
  assert.deepEqual((await pedirNivel(tokenSuper, CARLA.id)).cuerpo.data, puesto.cuerpo.data)

  const quitado = await ponerNivel(tokenSuper, CARLA.id, null)

  assert.equal(quitado.cuerpo.data.nivel_asignado, null)
  assert.equal(quitado.cuerpo.data.nivel, heredado.nivel, 'vuelve al de su rol, no a "usuario"')
})

test('las banderas de Perfex tapan el escalón de la tabla', async () => {
  // Ana es administradora y superadministradora: su escalón efectivo no lo decide esta tabla.
  const { cuerpo } = await pedirNivel(tokenSuper, ANA.id)

  assert.equal(cuerpo.data.nivel, 'superadmin')
})

test('una persona que no existe es 404', async () => {
  const { estado } = await pedirNivel(tokenSuper, 999999)

  assert.equal(estado, 404)
})
