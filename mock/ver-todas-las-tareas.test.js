/**
 * WIW-0415: el Espacio decide si dentro se ven todas las Tareas o solo las propias.
 *
 * La regla vive en el backend (`Acceso\Visibilidad::procesosDelPanel`, migracion `0390`) y aca se
 * prueba lo unico que el frontend necesita del contrato: que el dato viaje con el Espacio —listado
 * y ficha— y que el `PATCH` lo invierta y lo rechace cuando no es un booleano.
 */
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

/** Cambia la apertura de un Espacio y devuelve su sobre HTTP. */
async function escribir (id, cuerpo) {
  const respuesta = await fetch(`${base}/projects/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })
  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

/** Lee la ficha de un Espacio. */
async function leer (id) {
  const respuesta = await fetch(`${base}/projects/${id}`, { headers })
  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

test('el listado publica ver_todos_los_procesos en cada Espacio', async () => {
  const respuesta = await fetch(`${base}/projects`, { headers })
  assert.equal(respuesta.status, 200)

  const { data } = await respuesta.json()
  assert.ok(data.length > 0)
  assert.ok(data.every((espacio) => typeof espacio.ver_todos_los_procesos === 'boolean'))
  // El fixture nace desparejo a proposito: si todos valieran lo mismo, el rotulo invertido del
  // item del menu "Mas" no se podria ver nunca contra el mock.
  assert.ok(data.some((espacio) => espacio.ver_todos_los_procesos))
  assert.ok(data.some((espacio) => !espacio.ver_todos_los_procesos))
})

test('la ficha lo trae y el PATCH lo invierte en los dos sentidos', async () => {
  const inicial = await leer(2)
  assert.equal(inicial.estado, 200)
  assert.equal(inicial.cuerpo.data.ver_todos_los_procesos, false)

  const abierto = await escribir(2, { ver_todos_los_procesos: true })
  assert.equal(abierto.estado, 200)
  assert.equal(abierto.cuerpo.data.ver_todos_los_procesos, true)
  assert.equal((await leer(2)).cuerpo.data.ver_todos_los_procesos, true)

  const cerrado = await escribir(2, { ver_todos_los_procesos: false })
  assert.equal(cerrado.estado, 200)
  assert.equal(cerrado.cuerpo.data.ver_todos_los_procesos, false)
  assert.equal((await leer(2)).cuerpo.data.ver_todos_los_procesos, false)
})

test('abrir un Espacio ya abierto es idempotente', async () => {
  await escribir(3, { ver_todos_los_procesos: true })
  const segunda = await escribir(3, { ver_todos_los_procesos: true })

  assert.equal(segunda.estado, 200)
  assert.equal(segunda.cuerpo.data.ver_todos_los_procesos, true)

  await escribir(3, { ver_todos_los_procesos: false })
})

test('un valor que no es booleano es 422 y no cambia nada', async () => {
  const antes = (await leer(4)).cuerpo.data.ver_todos_los_procesos

  for (const valor of ['1', 1, null, {}]) {
    const { estado, cuerpo } = await escribir(4, { ver_todos_los_procesos: valor })
    assert.equal(estado, 422)
    assert.deepEqual(cuerpo.error.details.ver_todos_los_procesos, ['invalid'])
  }

  assert.equal((await leer(4)).cuerpo.data.ver_todos_los_procesos, antes)
})

test('un cuerpo vacío es 422, no un 200 que no escribió nada', async () => {
  const { estado, cuerpo } = await escribir(4, {})

  assert.equal(estado, 422)
  assert.equal(cuerpo.error.code, 'validation_failed')
})

test('una clave que la API no acepta es 422 con esa clave nombrada', async () => {
  const { estado, cuerpo } = await escribir(4, { clientid: 3 })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.clientid, ['invalid'])
})

test('un Espacio que no existe es 404 antes de mirar el cuerpo', async () => {
  const { estado } = await escribir(999999, { ver_todos_los_procesos: true })

  assert.equal(estado, 404)
})
