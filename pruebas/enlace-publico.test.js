/**
 * Pruebas del enlace publico de una Tarea.
 *
 * Cubren las dos cosas que fallan en silencio: una URL mal armada se copia, se manda por chat y
 * recien revienta del otro lado; y un `percent` en `null` mostrado como cero convierte "esta Tarea no
 * tiene lista de control" en "no se hizo nada", que es lo contrario de lo que pasa.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alternarSeccion,
  avancePublico,
  mismasSecciones,
  SECCIONES_ENLACE,
  SECCIONES_POR_DEFECTO,
  tiempoLegible,
  urlDeEnlacePublico
} from '../src/lib/enlace-publico.ts'

const TOKEN = 'a1b2c3d4e5f6'

test('arma la URL absoluta a partir del origen y el token', () => {
  assert.equal(
    urlDeEnlacePublico('https://ops.wiwo.me', TOKEN),
    `https://ops.wiwo.me/tarea/${TOKEN}`
  )
})

test('recorta las barras finales del origen', () => {
  assert.equal(
    urlDeEnlacePublico('https://ops.wiwo.me///', TOKEN),
    `https://ops.wiwo.me/tarea/${TOKEN}`
  )
})

test('codifica el token en vez de pegarlo crudo', () => {
  assert.equal(urlDeEnlacePublico('https://ops.wiwo.me', 'a/b c'), 'https://ops.wiwo.me/tarea/a%2Fb%20c')
})

test('sin origen o sin token no hay URL, y no una a medias', () => {
  assert.equal(urlDeEnlacePublico('', TOKEN), null)
  assert.equal(urlDeEnlacePublico('   ', TOKEN), null)
  assert.equal(urlDeEnlacePublico('https://ops.wiwo.me', ''), null)
  assert.equal(urlDeEnlacePublico('https://ops.wiwo.me', '   '), null)
})

test('con lista de control muestra el porcentaje y cuantos items van', () => {
  const avance = avancePublico({ checklist_total: 4, checklist_done: 1, percent: 25 })

  assert.equal(avance.porcentaje, 25)
  assert.equal(avance.detalle, '1 de 4 ítems de la lista de control')
})

test('un solo item se dice en singular', () => {
  const avance = avancePublico({ checklist_total: 1, checklist_done: 0, percent: 0 })

  assert.equal(avance.detalle, '0 de 1 ítem de la lista de control')
})

test('sin lista de control y sin cerrar, el porcentaje es null y no cero', () => {
  const avance = avancePublico({ checklist_total: 0, checklist_done: 0, percent: null })

  assert.equal(avance.porcentaje, null)
  assert.equal(avance.detalle, 'Sin lista de control')
})

test('sin lista de control pero completada, el 100 se muestra y se explica', () => {
  const avance = avancePublico({ checklist_total: 0, checklist_done: 0, percent: 100 })

  assert.equal(avance.porcentaje, 100)
  assert.equal(avance.detalle, 'Sin lista de control · marcada como terminada')
})

// Copia literal de `SeccionesEnlacePublico::OPCIONALES` de la API: si alguien agrega una seccion de
// un solo lado, el dialogo manda una clave que la API rechaza con 422, o la API ofrece una que nadie
// puede marcar.
const CATALOGO_DE_LA_API = [
  'description', 'project', 'assignees', 'tags', 'custom_fields',
  'logged_time', 'checklist', 'attachments', 'comments'
]

test('el catalogo de secciones coincide con el de la API, en el mismo orden', () => {
  assert.deepEqual(SECCIONES_ENLACE.map((opcion) => opcion.clave), CATALOGO_DE_LA_API)
})

test('lo marcado por defecto no incluye secciones delicadas', () => {
  const delicadas = new Set(SECCIONES_ENLACE.filter((o) => o.delicada).map((o) => o.clave))

  assert.ok(SECCIONES_POR_DEFECTO.length > 0)
  assert.ok(SECCIONES_POR_DEFECTO.every((clave) => !delicadas.has(clave)))
})

test('comentarios y asignados se advierten como delicados', () => {
  const delicada = (clave) => SECCIONES_ENLACE.find((o) => o.clave === clave)?.delicada

  assert.equal(delicada('comments'), true)
  assert.equal(delicada('assignees'), true)
})

test('alternar deja la eleccion en el orden del catalogo y sin repetidos', () => {
  assert.deepEqual(alternarSeccion(['comments'], 'description', true), ['description', 'comments'])
  assert.deepEqual(alternarSeccion(['description', 'comments'], 'description', true), ['description', 'comments'])
  assert.deepEqual(alternarSeccion(['description', 'comments'], 'comments', false), ['description'])
  assert.deepEqual(alternarSeccion([], 'tags', false), [])
})

test('dos elecciones iguales en otro orden son la misma', () => {
  assert.equal(mismasSecciones(['comments', 'description'], ['description', 'comments']), true)
  assert.equal(mismasSecciones([], []), true)
  assert.equal(mismasSecciones(['description'], ['description', 'tags']), false)
  assert.equal(mismasSecciones(['description', 'description'], ['description']), true)
})

test('el tiempo registrado se lee en horas y minutos', () => {
  assert.equal(tiempoLegible(0), '0 min')
  assert.equal(tiempoLegible(59), '0 min')
  assert.equal(tiempoLegible(25 * 60), '25 min')
  assert.equal(tiempoLegible(3 * 3600), '3 h')
  assert.equal(tiempoLegible(3 * 3600 + 25 * 60 + 30), '3 h 25 min')
  assert.equal(tiempoLegible(-10), '0 min')
  assert.equal(tiempoLegible(Number.NaN), '0 min')
})
