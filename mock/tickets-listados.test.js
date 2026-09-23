/**
 * Listados de tickets del mock contra CONTRATO2 D, E y F: la forma de las dos rutas del equipo, sus
 * filtros, los contadores de la pestaña y la marca `no_leido` del portal.
 *
 * El mock es lo unico con lo que se mira una bandeja antes de mergearla: si publica de mas o filtra
 * distinto que la API, la pantalla pasa aca y se cae en produccion.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let admin
let noAdmin
let cliente

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  admin = await entrar('/auth/login', 'ana@wiwo.me', 'mock1234')
  noAdmin = await entrar('/auth/login', 'carla@wiwo.me', 'mock1234')
  cliente = await entrar('/auth/portal/login', 'clienta@acme.com', 'portal1234')
})

after(() => new Promise((resolver) => servidor.close(resolver)))

async function entrar (ruta, email, password) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  return (await respuesta.json()).data.access_token
}

/** @returns {Promise<{ estado: number, cuerpo: any }>} */
async function pedir (token, ruta) {
  const respuesta = await fetch(`${base}${ruta}`, { headers: { authorization: `Bearer ${token}` } })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

const ids = (cuerpo) => cuerpo.data.map((t) => t.id).sort((a, b) => a - b)

test('la bandeja global trae la forma v2 y excluye los hijos fusionados', async () => {
  const { estado, cuerpo } = await pedir(admin, '/tickets')

  assert.equal(estado, 200)
  assert.ok(!ids(cuerpo).includes(41), 'el hijo fusionado no se lista')

  const esperando = cuerpo.data.find((t) => t.id === 40)
  assert.equal(esperando.ultimo_de, 'cliente')
  assert.equal(esperando.espera_desde, '2026-09-22 18:30:00')
  assert.equal(esperando.adminread, 0)
  assert.equal(esperando.solicitante.tipo, 'contacto')

  const respondido = cuerpo.data.find((t) => t.id === 1)
  assert.equal(respondido.ultimo_de, 'equipo')
  assert.equal(respondido.espera_desde, null)
  assert.equal(respondido.adminread, 1)
})

test('filter[esperando]=equipo deja lo que el cliente escribio ultimo y no esta cerrado', async () => {
  const { cuerpo } = await pedir(admin, '/tickets?filter[esperando]=equipo')

  assert.deepEqual(ids(cuerpo), [2, 40])
})

test('filter[esperando] invalido es 422', async () => {
  const { estado } = await pedir(admin, '/tickets?filter[esperando]=nadie')

  assert.equal(estado, 422)
})

test('filter[project_id]=0 son los tickets sin Proyecto', async () => {
  const { cuerpo } = await pedir(admin, '/tickets?filter[project_id]=0')

  assert.deepEqual(ids(cuerpo), [3])
})

test('department y assigned son 422 para quien no administra', async () => {
  assert.equal((await pedir(noAdmin, '/tickets?filter[department]=1')).estado, 422)
  assert.equal((await pedir(noAdmin, '/tickets?filter[assigned]=2')).estado, 422)
  assert.equal((await pedir(admin, '/tickets?filter[department]=1')).estado, 200)
})

test('la pestaña del Proyecto tiene la misma forma, acotada y sin hijos', async () => {
  const { estado, cuerpo } = await pedir(admin, '/projects/1/tickets')

  assert.equal(estado, 200)
  assert.deepEqual(ids(cuerpo), [1, 40])
  assert.ok(cuerpo.data.every((t) => 'ultimo_de' in t && 'espera_desde' in t && 'adminread' in t && 'solicitante' in t))
})

test('los contadores del Proyecto cuentan abiertos, esperando al equipo y sin leer', async () => {
  const { estado, cuerpo } = await pedir(admin, '/projects/1/tickets/contadores')

  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data, { abiertos: 2, esperando_equipo: 1, sin_leer: 1 })
})

test('un Proyecto inexistente es 404 en la pestaña y en los contadores', async () => {
  assert.equal((await pedir(admin, '/projects/9999/tickets')).estado, 404)
  assert.equal((await pedir(admin, '/projects/9999/tickets/contadores')).estado, 404)
})

test('el listado del portal suma no_leido y excluye los hijos', async () => {
  const { estado, cuerpo } = await pedir(cliente, '/portal/tickets')

  assert.equal(estado, 200)
  assert.ok(!ids(cuerpo).includes(41))

  const porId = new Map(cuerpo.data.map((t) => [t.id, t]))
  assert.equal(porId.get(1).no_leido, true, 'lo ultimo es del equipo y el contacto no lo leyo')
  assert.equal(porId.get(40).no_leido, false, 'lo ultimo lo escribio el propio cliente')
  assert.equal(porId.get(3).no_leido, false, 'un cerrado no queda pendiente')
  assert.ok(!('adminread' in porId.get(1)), 'el portal no ve la lectura del equipo')
})

test('los filtros guardados existen en el mock y son privados por persona', async () => {
  const { estado, cuerpo } = await pedir(admin, '/filter-presets?board=tickets')

  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data, [])
  assert.equal((await pedir(admin, '/filter-presets?board=inventado')).estado, 422)
})

/** Una escritura del modal, con cuerpo JSON opcional. */
async function escribir (token, ruta, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })

  return respuesta.status
}

test('las acciones del modal mueven la lectura que leen los listados', async () => {
  const fila40 = async () => (await pedir(admin, '/projects/1/tickets')).cuerpo.data.find((t) => t.id === 40)
  const delPortal40 = async () => (await pedir(cliente, '/portal/tickets')).cuerpo.data.find((t) => t.id === 40)
  const contadores = async () => (await pedir(admin, '/projects/1/tickets/contadores')).cuerpo.data

  assert.equal(await escribir(admin, '/tickets/40/respuestas', { message: 'Ya lo miramos.' }), 201)
  assert.equal((await fila40()).adminread, 1)
  assert.equal((await fila40()).clientread, 0)
  assert.equal((await delPortal40()).no_leido, true, 'la respuesta del equipo queda sin leer para el cliente')
  assert.equal((await contadores()).esperando_equipo, 0)

  assert.equal(await escribir(cliente, '/portal/tickets/40/leido'), 204)
  assert.equal((await delPortal40()).no_leido, false, 'leido apaga la marca del portal')

  assert.equal(await escribir(cliente, '/portal/tickets/40/respuestas', { message: 'Gracias.' }), 201)
  assert.equal((await fila40()).adminread, 0, 'la respuesta del cliente queda sin leer para el equipo')
  assert.equal((await contadores()).sin_leer, 1)

  assert.equal(await escribir(cliente, '/portal/tickets/40/cerrar'), 200)
  assert.equal((await contadores()).abiertos, 1)
  assert.equal(await escribir(cliente, '/portal/tickets/40/reabrir'), 200)
  assert.equal((await fila40()).adminread, 0, 'reabrir lo deja nuevo para el equipo')
})
