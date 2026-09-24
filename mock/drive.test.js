/**
 * Pruebas del árbol de Drive en el mock, contra el servidor.
 *
 * Queda clavado el contrato de los ajustes: `can_write` y `locked` en la lectura, el alta de
 * carpetas, el `PATCH` que renombra y mueve con sus `404`/`409`/`403`/`422`, y el borrado que manda
 * a la papelera también las carpetas no bloqueadas.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { reiniciarDrive } from './drive.js'

let base
let staff

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  staff = (await respuesta.json()).data.access_token
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/**
 * Pide una ruta con la sesión del staff.
 *
 * @returns {Promise<{ estado: number, cuerpo: any }>}
 */
async function pedir (ruta, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${staff}`, 'content-type': 'application/json' },
    ...(datos === undefined ? {} : { body: JSON.stringify(datos) })
  })

  return { estado: respuesta.status, cuerpo: respuesta.status === 204 ? null : await respuesta.json() }
}

/** La carpeta raíz del Proyecto 1, con la semilla fresca. */
async function raiz () {
  reiniciarDrive()
  const { cuerpo } = await pedir('/projects/1/drive')
  const porNombre = (nombre) => cuerpo.data.folder.children.find((hijo) => hijo.name === nombre)
  return { folder: cuerpo.data.folder, porNombre }
}

test('la lectura trae can_write en la carpeta y locked en cada hijo', async () => {
  const { folder, porNombre } = await raiz()

  assert.equal(folder.can_write, true)
  assert.equal(porNombre('01_Bases').locked, false)
  assert.equal(porNombre('ACM-001-01 Diseño de la oferta').locked, true)
  assert.equal(porNombre('propuesta.pdf').locked, false)

  const { cuerpo } = await pedir(`/drive/${porNombre('Solo lectura').id}`)
  assert.equal(cuerpo.data.can_write, false)
})

test('crear una carpeta devuelve el nodo y valida el nombre', async () => {
  const { folder } = await raiz()

  const creada = await pedir(`/drive/${folder.id}/folders`, 'POST', { name: '  07_Anexos ' })
  assert.equal(creada.estado, 201)
  assert.equal(creada.cuerpo.data.name, '07_Anexos')
  assert.equal(creada.cuerpo.data.is_folder, true)
  assert.equal(creada.cuerpo.data.locked, false)

  for (const name of ['', 'a/b', 'a'.repeat(256)]) {
    assert.equal((await pedir(`/drive/${folder.id}/folders`, 'POST', { name })).estado, 422)
  }
})

test('renombrar y mover con el PATCH', async () => {
  const { folder, porNombre } = await raiz()
  const bases = porNombre('01_Bases')
  const oferta = porNombre('03_Oferta_Tecnica')

  const renombrada = await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { name: '01_Bases_v2' })
  assert.equal(renombrada.estado, 200)
  assert.equal(renombrada.cuerpo.data.name, '01_Bases_v2')

  const movida = await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: oferta.id })
  assert.equal(movida.estado, 200)
  assert.deepEqual((await pedir(`/drive/${oferta.id}`)).cuerpo.data.children.map((h) => h.name), ['01_Bases_v2'])

  // Ya no es hijo directo de la raíz.
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { name: 'x' })).estado, 404)
})

test('el PATCH rechaza locked, destino propio o descendiente y destino sin permiso', async () => {
  const { folder, porNombre } = await raiz()
  const bases = porNombre('01_Bases')
  const tarea = porNombre('ACM-001-01 Diseño de la oferta')

  assert.equal((await pedir(`/drive/${folder.id}/files/${tarea.id}`, 'PATCH', { name: 'x' })).estado, 409)
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: bases.id })).estado, 422)

  const hija = (await pedir(`/drive/${bases.id}/folders`, 'POST', { name: 'hija' })).cuerpo.data
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: hija.id })).estado, 422)
  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'PATCH', { parent_id: porNombre('Solo lectura').id })).estado, 403)
})

test('borrar manda a la papelera una carpeta con su contenido, pero no una locked', async () => {
  const { folder, porNombre } = await raiz()
  const bases = porNombre('01_Bases')
  const tarea = porNombre('ACM-001-01 Diseño de la oferta')
  await pedir(`/drive/${bases.id}/folders`, 'POST', { name: 'hija' })

  assert.equal((await pedir(`/drive/${folder.id}/files/${bases.id}`, 'DELETE')).estado, 204)
  assert.equal((await pedir(`/drive/${bases.id}`)).estado, 404)
  assert.equal((await pedir(`/drive/${folder.id}/files/${tarea.id}`, 'DELETE')).estado, 409)
})
