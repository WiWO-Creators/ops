/**
 * Pruebas del contrato de Organización en el mock (`docs/contrato-organizacion.md`).
 *
 * El mock es el contrato ejecutable con el que se construye la pantalla; si se aparta de la API, la
 * pantalla funciona acá y se rompe al integrar. Se protege:
 *
 *   1. Los campos aditivos: `is_admin`/`is_superadmin` en la persona y `en_tareas` en el área.
 *   2. Que el historial registre **una fila por campo que cambió de verdad**, con los textos
 *      legibles, y el rol de sistema escrito por `PATCH /staff`.
 *   3. Los filtros del historial y su 422.
 *   4. La forma del alcance y su 404, y que todo exija superadministrador.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { STAFF } from './datos.js'

let base
let tokenSuper
let tokenComun

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

/** Una petición autenticada, con el estado y el cuerpo ya parseados. */
async function pedir (ruta, { metodo = 'GET', cuerpo, token = tokenSuper } = {}) {
  const respuesta = await fetch(`${base}/${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })
  const texto = await respuesta.text()

  return { estado: respuesta.status, cuerpo: texto === '' ? null : JSON.parse(texto) }
}

let original

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  tokenSuper = await entrar('ana@wiwo.me')
  tokenComun = await entrar('carla@wiwo.me')
  original = { escalon: CARLA.escalon, jefe_staffid: CARLA.jefe_staffid ?? null, is_admin: CARLA.is_admin === true }
})

after(async () => {
  // El fixture vive en memoria del módulo: dejarlo movido le cambia el árbol a las demás pruebas.
  await pedir(`accesos/personas/${CARLA.id}`, { metodo: 'PUT', cuerpo: { escalon: original.escalon, jefe_staffid: original.jefe_staffid } })
  await pedir(`staff/${CARLA.id}`, { metodo: 'PATCH', cuerpo: { is_admin: original.is_admin } })
  await new Promise((resolver) => servidor.close(resolver))
})

test('la persona trae sus banderas de rol y el área su cruce con los Procesos', async () => {
  const personas = await pedir('accesos/personas?per_page=500')
  const ana = personas.cuerpo.data.find((una) => una.staffid === ANA.id)

  assert.equal(ana.is_superadmin, true)
  assert.equal(ana.is_admin, true, 'un superadministrador también es administrador')

  const catalogo = await pedir('accesos/catalogo')

  assert.ok(catalogo.cuerpo.data.areas.every((area) => typeof area.en_tareas === 'boolean'))
})

test('el historial registra una fila por campo que cambió, con textos legibles', async () => {
  const destino = original.escalon === 'lead' ? 'director' : 'lead'
  const escritura = await pedir(`accesos/personas/${CARLA.id}`, {
    metodo: 'PUT',
    cuerpo: { escalon: destino, jefe_staffid: original.jefe_staffid }
  })

  assert.equal(escritura.estado, 200)

  const { cuerpo } = await pedir(`accesos/historial?persona=${CARLA.id}`)
  const [ultimo] = cuerpo.data

  assert.equal(ultimo.campo, 'escalon', 'el jefe no cambió, así que no deja fila')
  assert.equal(ultimo.despues, destino === 'lead' ? 'Lead' : 'Director')
  assert.equal(ultimo.autor.staffid, ANA.id)
  assert.equal(ultimo.entidad_nombre, CARLA.full_name)
})

test('el rol de sistema escrito por la ficha también queda en el historial', async () => {
  await pedir(`staff/${CARLA.id}`, { metodo: 'PATCH', cuerpo: { is_admin: !original.is_admin } })

  const { cuerpo } = await pedir(`accesos/historial?persona=${CARLA.id}&per_page=1`)

  assert.equal(cuerpo.data[0].campo, 'rol_sistema')
  assert.equal(cuerpo.data[0].despues, original.is_admin ? 'Usuario' : 'Administrador')
  assert.equal(cuerpo.meta.pagination.per_page, 1)
})

test('los filtros del historial validan lo que reciben', async () => {
  assert.equal((await pedir('accesos/historial?entidad=otra')).estado, 422)
  assert.equal((await pedir('accesos/historial?persona=abc')).estado, 422)

  const areas = await pedir('accesos/historial?entidad=area')
  assert.ok(areas.cuerpo.data.every((fila) => fila.entidad === 'area'))
})

test('el alcance explica de dónde sale lo que alguien ve', async () => {
  const { estado, cuerpo } = await pedir(`accesos/personas/${ANA.id}/alcance`)

  assert.equal(estado, 200)
  assert.equal(cuerpo.data.motivo_ve_todo, 'superadmin')
  assert.equal(cuerpo.data.total_alcanzados, cuerpo.data.alcanzados.length)
  assert.ok(cuerpo.data.alcanzados.every((uno) => uno.via === 'cadena' || uno.via === 'area'))

  assert.equal((await pedir('accesos/personas/999999/alcance')).estado, 404)
})

test('historial y alcance exigen superadministrador', async () => {
  assert.equal((await pedir('accesos/historial', { token: tokenComun })).estado, 403)
  assert.equal((await pedir(`accesos/personas/${ANA.id}/alcance`, { token: tokenComun })).estado, 403)
})
