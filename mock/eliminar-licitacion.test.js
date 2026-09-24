/**
 * Pruebas de `DELETE /projects/{id}` sobre el Espacio de una licitacion.
 *
 * Es el boton Eliminar de la ficha de una licitacion: borrarla es borrar su Espacio, y despues de eso
 * la licitacion no tiene que salir ni en la ficha ni en el listado. Si el mock la dejara a la vista,
 * la ficha pasaria en local mostrando una licitacion que en produccion ya esta en la papelera.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { ESPACIOS_DE_LICITACION, LICITACIONES } from './datos.js'

let base
let token

// El fixture vive en memoria del modulo: se restaura al final para no moverle el suelo a nadie.
const LICITACIONES_ORIGINALES = [...LICITACIONES]
const ESPACIOS_ORIGINALES = [...ESPACIOS_DE_LICITACION]

/** Una llamada autenticada, con el estado y el cuerpo ya parseados. */
async function pedir (metodo, ruta) {
  const respuesta = await fetch(`${base}/${ruta}`, { method: metodo, headers: { authorization: `Bearer ${token}` } })

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
  LICITACIONES.splice(0, LICITACIONES.length, ...LICITACIONES_ORIGINALES)
  ESPACIOS_DE_LICITACION.splice(0, ESPACIOS_DE_LICITACION.length, ...ESPACIOS_ORIGINALES)
  await new Promise((resolver) => servidor.close(resolver))
})

test('eliminar el Espacio de una licitacion la saca de la ficha y del listado', async () => {
  const id = LICITACIONES[0].id

  const borrado = await pedir('DELETE', `projects/${id}`)
  assert.equal(borrado.estado, 200)
  assert.deepEqual(borrado.cuerpo.data, { estado: 'papelera', id, entidad: 'projects' })

  assert.equal((await pedir('GET', `licitaciones/${id}`)).estado, 404)
  const listado = await pedir('GET', 'licitaciones')
  assert.ok(!listado.cuerpo.data.some((fila) => fila.id === id))
  assert.ok(!ESPACIOS_DE_LICITACION.some((fila) => fila.id === id))
})

test('eliminar un id que no es de ninguna licitacion es 404', async () => {
  assert.equal((await pedir('DELETE', 'projects/999999')).estado, 404)
  assert.equal((await pedir('DELETE', 'projects/abc')).estado, 404)
})
