/**
 * Pruebas de `/upsells` en el mock: la ficha, la edicion de lo propio y el borrado de su Espacio.
 *
 * El mock tiene que rechazar lo mismo que la API: si aceptara una probabilidad de 150 o dejara editar
 * un Espacio archivado, el formulario de edicion pasaria en local y fallaria en produccion.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { ESPACIOS_DE_UPSELL, UPSELLS } from './datos.js'

let base
let token

// El fixture vive en memoria del modulo: se restaura al final para no moverle el suelo a nadie.
const UPSELLS_ORIGINALES = structuredClone(UPSELLS)
const ESPACIOS_ORIGINALES = structuredClone(ESPACIOS_DE_UPSELL)

/** Una llamada autenticada, con el estado y el cuerpo ya parseados. */
async function pedir (metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${base}/${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  token = (await respuesta.json()).data.access_token
})

after(async () => {
  UPSELLS.splice(0, UPSELLS.length, ...UPSELLS_ORIGINALES)
  ESPACIOS_DE_UPSELL.splice(0, ESPACIOS_DE_UPSELL.length, ...ESPACIOS_ORIGINALES)
  await new Promise((resolver) => servidor.close(resolver))
})

test('la ficha trae el Espacio completo y el cliente', async () => {
  const { estado, cuerpo } = await pedir('GET', 'upsells/111')

  assert.equal(estado, 200)
  assert.equal(cuerpo.data.espacio.name, 'Rediseño del sitio 2027')
  assert.equal(cuerpo.data.espacio.archived, false)
  assert.equal(cuerpo.data.client.id, 1)
  assert.equal('nombre' in cuerpo.data, false)
})

test('el listado filtra por estado y busca por el nombre del Espacio', async () => {
  const abiertas = await pedir('GET', 'upsells?filter[estado]=abierta')
  assert.deepEqual(abiertas.cuerpo.data.map((fila) => fila.id), [111])

  const buscadas = await pedir('GET', 'upsells?q=verano')
  assert.deepEqual(buscadas.cuerpo.data.map((fila) => fila.id), [112])
})

test('el parche escribe lo propio, tambien sobre una oportunidad cerrada', async () => {
  const abierta = await pedir('PATCH', 'upsells/111', { probabilidad: 80, moneda_id: 2 })
  assert.equal(abierta.estado, 200)
  assert.equal(abierta.cuerpo.data.probabilidad, 80)
  assert.equal(abierta.cuerpo.data.moneda_id, 2)

  const perdida = await pedir('PATCH', 'upsells/112', { motivo: '  Eligió otra agencia por precio.  ', monto_estimado: null })
  assert.equal(perdida.estado, 200)
  assert.equal(perdida.cuerpo.data.motivo, 'Eligió otra agencia por precio.')
  assert.equal(perdida.cuerpo.data.monto_estimado, null)
})

test('el parche rechaza lo que la API rechaza', async () => {
  for (const cuerpo of [{ probabilidad: 150 }, { probabilidad: 12.5 }, { monto_estimado: -1 }, { moneda_id: 0 }, { motivo: 'x'.repeat(256) }]) {
    assert.equal((await pedir('PATCH', 'upsells/111', cuerpo)).estado, 422, JSON.stringify(cuerpo))
  }

  const ajena = await pedir('PATCH', 'upsells/111', { name: 'Otro' })
  assert.equal(ajena.estado, 422)
  assert.equal(ajena.cuerpo.error.code, 'no_editable')
})

test('el Espacio archivado de un upsell perdido no se edita', async () => {
  assert.equal((await pedir('PATCH', 'projects/112', { name: 'Otro nombre' })).estado, 422)
  assert.equal((await pedir('PATCH', 'projects/111', { name: 'Rediseño 2027', estimated_hours: 50 })).estado, 200)
})

test('eliminar el Espacio de un upsell lo saca de la ficha y del listado', async () => {
  const borrado = await pedir('DELETE', 'projects/112')
  assert.equal(borrado.estado, 200)

  assert.equal((await pedir('GET', 'upsells/112')).estado, 404)
  assert.ok(!(await pedir('GET', 'upsells')).cuerpo.data.some((fila) => fila.id === 112))
})
