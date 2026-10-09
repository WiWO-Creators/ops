/**
 * Pruebas del mock del seguimiento de actividad: el contrato HTTP que consume el panel.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let tokenPortal
let tokenStaff
const SESION = '0f8fad5b-d9cb-469f-a165-70867728950e'

async function entrar (email, password, ruta = '/auth/login') {
  const r = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  return (await r.json()).data.access_token
}

const pedir = async (ruta, token, opciones = {}) => {
  const r = await fetch(`${base}${ruta}`, { ...opciones, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } })

  return { estado: r.status, cuerpo: r.status === 204 ? null : await r.json() }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
    tokenPortal = await entrar('clienta@acme.com', 'portal1234', '/auth/portal/login')
  tokenStaff = await entrar('ana@wiwo.me', 'mock1234')
})

after(() => new Promise((resolver) => servidor.close(resolver)))

test('el contacto manda un lote y responde 204; /portal/me dice que se rastrea', async () => {
  const lote = { session: SESION, device: 'movil', events: [{ type: 'vista', route: '/portal/proyectos/12', duration_ms: 4200 }, { type: 'click', route: '/portal', target: 'tablero.aprobar' }] }
  const r = await pedir('/portal/actividad', tokenPortal, { method: 'POST', body: JSON.stringify(lote) })

  assert.equal(r.estado, 204)
  assert.equal((await pedir('/portal/me', tokenPortal)).cuerpo.data.rastreo, true)
})

test('un evento con ruta fuera del portal o con query es 422 y no se guarda', async () => {
  for (const route of ['/clientes/1', '/portal/proyectos?q=x']) {
    const r = await pedir('/portal/actividad', tokenPortal, { method: 'POST', body: JSON.stringify({ session: SESION, events: [{ type: 'vista', route }] }) })

    assert.equal(r.estado, 422)
  }
})

test('el equipo lee el resumen del cliente con la forma que pinta el panel', async () => {
  const r = await pedir('/clients/1/portal-activity', tokenStaff)

  assert.equal(r.estado, 200)
  const d = r.cuerpo.data

  assert.ok(d.kpis.sesiones > 0)
  assert.ok(Array.isArray(d.por_dia) && Array.isArray(d.vistas) && Array.isArray(d.clicks) && Array.isArray(d.contactos))
  assert.ok(Array.isArray(d.proyectos) && d.proyectos.every((p) => typeof p.id === 'number' && p.visitas > 0))
  assert.ok(d.contactos.every((c) => typeof c.nombre === 'string' && typeof c.segundos === 'number'))
})

test('lo que hizo el equipo con "Ver como cliente" queda fuera salvo que se pida', async () => {
  const sin = (await pedir('/clients/1/portal-activity', tokenStaff)).cuerpo.data.kpis.sesiones
  const con = (await pedir('/clients/1/portal-activity?suplantadas=1', tokenStaff)).cuerpo.data.kpis.sesiones

  assert.ok(con > sin)
})

test('el detalle de un contacto trae sus sesiones con pasos y paginacion', async () => {
  const r = await pedir('/contacts/1/portal-activity', tokenStaff)

  assert.equal(r.estado, 200)
  assert.ok(r.cuerpo.data.length > 0)
  assert.ok(r.cuerpo.data[0].pasos.length > 0)
  assert.equal(r.cuerpo.meta.por_pagina, 15)
})

test('un contacto no puede leer la actividad: es del equipo', async () => {
  assert.notEqual((await pedir('/clients/1/portal-activity', tokenPortal)).estado, 200)
})
