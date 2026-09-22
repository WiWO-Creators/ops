/** Regresión HTTP WIW-0362: completados visibles sin columnas vacías delante. */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

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
  assert.equal(respuesta.status, 201)
  headers = { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Solicita el tablero con filtros reales y devuelve su sobre HTTP. */
async function tablero (filtros = {}) {
  const params = new URLSearchParams({ vista: 'tablero', ...filtros })
  const respuesta = await fetch(`${base}/tasks?${params}`, { headers })
  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

test('status=5 y completed=1 muestran solo Completado con sus tarjetas', async () => {
  for (const filtros of [
    { 'filter[status]': '5' },
    { 'filter[status__eq]': '5' },
    { 'filter[completed]': '1' },
    { 'filter[completed__eq]': '1' }
  ]) {
    const { estado, cuerpo } = await tablero(filtros)
    assert.equal(estado, 200)
    assert.deepEqual(cuerpo.data.map((grupo) => grupo.columna.id), [5])
    assert.ok(cuerpo.data[0].tarjetas.length > 0)
    assert.ok(cuerpo.data[0].tarjetas.every((tarjeta) => tarjeta.status === 5))
    assert.ok(cuerpo.data[0].pagination.total >= cuerpo.data[0].tarjetas.length)
  }
})

test('sin filtro y completed=0 conservan los cuatro estados abiertos', async () => {
  for (const filtros of [{}, { 'filter[completed]': '0' }]) {
    const { estado, cuerpo } = await tablero(filtros)
    assert.equal(estado, 200)
    assert.deepEqual(cuerpo.data.map((grupo) => grupo.columna.id), [1, 4, 2, 6])
    assert.ok(cuerpo.data.every((grupo) => grupo.tarjetas.every((tarjeta) => tarjeta.status !== 5)))
  }
})

test('filtros contradictorios o estado inexistente devuelven tablero vacío', async () => {
  for (const filtros of [
    { 'filter[status]': '5', 'filter[completed]': '0' },
    { 'filter[status]': '999' }
  ]) {
    const { estado, cuerpo } = await tablero(filtros)
    assert.equal(estado, 200)
    assert.deepEqual(cuerpo.data, [])
  }
})

test('búsqueda sin coincidencias mantiene Completado visible sin tarjetas', async () => {
  const { estado, cuerpo } = await tablero({ 'filter[status]': '5', q: 'sin-coincidencias-WIW-0362' })
  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data.map((grupo) => grupo.columna.id), [5])
  assert.deepEqual(cuerpo.data[0].tarjetas, [])
  assert.equal(cuerpo.data[0].pagination.total, 0)
})

test('valida filtros incluso cuando el estado no existe en el catálogo', async () => {
  const { estado } = await tablero({ 'filter[status]': '999', 'filter[completed__desconocido]': '1' })
  assert.equal(estado, 422)
})
