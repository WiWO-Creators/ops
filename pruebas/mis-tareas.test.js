/**
 * Pruebas de "Mis Tareas": de donde viene cada Tarea de la lista.
 *
 * Una Licitacion ES un Espacio, asi que sus Tareas llegan indistinguibles de las de un Proyecto: lo
 * unico que las separa es el conjunto de ids que manda `GET /licitaciones`. Sin ese conjunto todo
 * tiene que leerse como Proyecto, nunca como "no se".
 *
 * Quien ve la entrada de Focals se prueba en `permisos-seccion.test.js`, con el resto de las reglas
 * que deciden que secciones se dibujan.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { origenDeTarea } from '../src/dominio/mis-tareas.ts'

/** Los ids de Espacio que son Licitaciones, como los arma la pantalla. */
const LICITACIONES = new Set([900073, 900075])

/** Una Tarea de `GET /tasks`, podada a lo que mira `origenDeTarea`. */
function tarea (campos) {
  return { id: 1, rel_type: 'project', project: null, ...campos }
}

test('una Tarea de un Espacio que es Licitacion se nombra Licitación', () => {
  const origen = origenDeTarea(tarea({ project: { id: 900073, name: 'Licitacion 1' } }), LICITACIONES)

  assert.equal(origen.clase, 'licitacion')
  assert.equal(origen.tipo, 'Licitación')
  assert.equal(origen.nombre, 'Licitacion 1')
  assert.equal(origen.href, '/licitaciones/900073')
})

test('una Tarea de cualquier otro Espacio se nombra Proyecto', () => {
  const origen = origenDeTarea(tarea({ project: { id: 12, name: 'Sitio Acme' } }), LICITACIONES)

  assert.equal(origen.clase, 'espacio')
  assert.equal(origen.tipo, 'Proyecto')
  assert.equal(origen.href, '/proyectos/12')
})

test('sin el catalogo de Licitaciones todo Espacio se lee como Proyecto', () => {
  const origen = origenDeTarea(tarea({ project: { id: 900073, name: 'Licitacion 1' } }), new Set())

  assert.equal(origen.clase, 'espacio')
  assert.equal(origen.tipo, 'Proyecto')
})

test('una Tarea sin relacion de ningun tipo es privada', () => {
  const origen = origenDeTarea(tarea({ rel_type: null }), LICITACIONES)

  assert.equal(origen.clase, 'privada')
  assert.equal(origen.nombre, null)
  assert.equal(origen.href, null)
})

test('una Tarea colgada de otra cosa que no es un Espacio no se llama privada', () => {
  const origen = origenDeTarea(tarea({ rel_type: 'customer' }), LICITACIONES)

  assert.equal(origen.clase, 'otro')
  assert.notEqual(origen.tipo, 'Privada')
})
