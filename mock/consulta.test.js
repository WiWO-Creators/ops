/**
 * Pruebas del motor de consulta. Cubren lo que se rompe en silencio: una whitelist que deja pasar un
 * filtro desconocido, un orden que pone los nulos primero, o un `fields` aplicado antes de ordenar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ErrorApi, aplicarConsulta, coincideEnLista, leerIncludes, recortarCampos } from './consulta.js'

const FILAS = [
  { id: 1, name: 'Bravo', vence: '2026-03-01', estado: 4, etiquetas: [1, 2] },
  { id: 2, name: 'alfa', vence: null, estado: 1, etiquetas: [] },
  { id: 3, name: 'Charlie', vence: '2026-01-15', estado: 4, etiquetas: [2] },
  { id: 4, name: 'delta', vence: '2026-02-10', estado: 5, etiquetas: [3] }
]

const DEFINICION = {
  filtros: {
    estado: coincideEnLista((f) => f.estado),
    etiqueta: coincideEnLista((f) => f.etiquetas)
  },
  orden: ['name', 'vence'],
  busqueda: ['name']
}

const consultar = (query) => aplicarConsulta(FILAS, new URLSearchParams(query), DEFINICION)

test('sin parametros devuelve todo con la paginacion por defecto', () => {
  const { filas, paginacion } = consultar('')
  assert.equal(filas.length, 4)
  assert.deepEqual(paginacion, { page: 1, per_page: 25, total: 4, total_pages: 1 })
})

test('un filtro desconocido falla con 422 en vez de ignorarse', () => {
  assert.throws(
    () => consultar('filter[inventado]=1'),
    (error) => error instanceof ErrorApi && error.estado === 422 &&
      error.detalles['filter[inventado]'][0] === 'unknown'
  )
})

test('un orden fuera de la whitelist falla con 422', () => {
  assert.throws(
    () => consultar('sort=-password'),
    (error) => error instanceof ErrorApi && error.estado === 422
  )
})

test('filter acepta una lista separada por comas', () => {
  assert.deepEqual(consultar('filter[estado]=4,5').filas.map((f) => f.id), [1, 3, 4])
})

test('filter sobre un campo de lista busca dentro del array', () => {
  assert.deepEqual(consultar('filter[etiqueta]=2').filas.map((f) => f.id), [1, 3])
})

test('el orden ascendente ignora mayusculas y respeta el español', () => {
  assert.deepEqual(consultar('sort=name').filas.map((f) => f.name), ['alfa', 'Bravo', 'Charlie', 'delta'])
})

test('los nulos van al final en las dos direcciones', () => {
  assert.equal(consultar('sort=vence').filas.at(-1).vence, null)
  assert.equal(consultar('sort=-vence').filas.at(-1).vence, null)
})

test('la busqueda es insensible a mayusculas', () => {
  assert.deepEqual(consultar('q=ALF').filas.map((f) => f.id), [2])
})

test('la paginacion recorta y calcula el total de paginas', () => {
  const { filas, paginacion } = consultar('sort=name&page=2&per_page=2')
  assert.deepEqual(filas.map((f) => f.name), ['Charlie', 'delta'])
  assert.equal(paginacion.total_pages, 2)
  assert.equal(paginacion.total, 4)
})

test('per_page se recorta al maximo sin fallar', () => {
  assert.equal(consultar('per_page=5000').paginacion.per_page, 100)
})

test('una pagina vacia sigue devolviendo total_pages coherente', () => {
  const { filas, paginacion } = consultar('page=9&per_page=2')
  assert.equal(filas.length, 0)
  assert.equal(paginacion.total_pages, 2)
})

test('page no numerico falla con 422', () => {
  assert.throws(() => consultar('page=abc'), (error) => error.estado === 422)
})

test('fields recorta las columnas y conserva id aunque no se pida', () => {
  const [fila] = recortarCampos([FILAS[0]], new URLSearchParams('fields=name'))
  assert.deepEqual(Object.keys(fila), ['id', 'name'])
})

test('fields se aplica despues de ordenar, no antes', () => {
  // Si el recorte ocurriera primero, `vence` no existiria al ordenar y el resultado seria el original.
  const { filas } = consultar('sort=vence&fields=name')
  assert.deepEqual(filas.map((f) => f.name), ['Charlie', 'delta', 'Bravo', 'alfa'])
})

test('include fuera de la whitelist falla con 422', () => {
  assert.throws(
    () => leerIncludes(new URLSearchParams('include=secretos'), ['custom_fields']),
    (error) => error.estado === 422
  )
})

test('el conjunto original no se muta al ordenar', () => {
  consultar('sort=-name')
  assert.deepEqual(FILAS.map((f) => f.id), [1, 2, 3, 4])
})
