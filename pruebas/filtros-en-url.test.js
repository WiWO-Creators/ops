/**
 * Pruebas de la logica pura de `useFiltrosEnUrl`: lectura y escritura de parametros en la URL, y
 * que el prefijo evite que dos instancias de una misma tabla en la misma pagina se pisen.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarPrefijo,
  parametroPropio,
  parametrosPropios,
  prefijarQuery,
  urlConCambio,
  urlConParametroPropio
} from '../src/componentes/datos/filtros-en-url.ts'

test('agregarPrefijo antepone el prefijo; sin prefijo devuelve la clave intacta', () => {
  assert.equal(agregarPrefijo('page', 't1_'), 't1_page')
  assert.equal(agregarPrefijo('page', undefined), 'page')
  assert.equal(agregarPrefijo('page', ''), 'page')
})

test('parametrosPropios sin prefijo devuelve todos los parametros', () => {
  const params = new URLSearchParams('page=2&sort=name')
  const propios = parametrosPropios(params, undefined)

  assert.equal(propios.get('page'), '2')
  assert.equal(propios.get('sort'), 'name')
})

test('parametrosPropios con prefijo solo trae las claves de esa instancia, sin el prefijo', () => {
  const params = new URLSearchParams('t1_page=2&t2_page=5&vista=tarjetas')
  const propios = parametrosPropios(params, 't1_')

  assert.equal(propios.get('page'), '2')
  assert.equal(propios.get('t2_page'), null)
  assert.equal(propios.get('vista'), null)
})

test('prefijarQuery antepone el prefijo a cada clave de la query', () => {
  assert.equal(prefijarQuery('page=2&sort=name', 't1_'), 't1_page=2&t1_sort=name')
})

test('prefijarQuery sin prefijo o con query vacia devuelve la query intacta', () => {
  assert.equal(prefijarQuery('page=2', undefined), 'page=2')
  assert.equal(prefijarQuery('', 't1_'), '')
})

test('parametroPropio lee la clave con su prefijo', () => {
  const params = new URLSearchParams('t1_vista=tarjetas&vista=tabla')

  assert.equal(parametroPropio(params, 'vista', 't1_'), 'tarjetas')
  assert.equal(parametroPropio(params, 'vista', undefined), 'tabla')
})

test('urlConCambio escribe la consulta nueva y conserva lo ajeno', () => {
  const params = new URLSearchParams('page=1&modal=abierto')
  const url = urlConCambio(params, 'page=1', 'page=2&sort=name', undefined)

  const resultado = new URLSearchParams(url.slice(1))
  assert.equal(resultado.get('page'), '2')
  assert.equal(resultado.get('sort'), 'name')
  assert.equal(resultado.get('modal'), 'abierto')
})

test('urlConCambio borra una clave vieja que la consulta nueva ya no produce', () => {
  const params = new URLSearchParams('page=1&filter[status]=2')
  const url = urlConCambio(params, 'page=1&filter[status]=2', '', undefined)

  assert.equal(url, '?')
})

test('urlConCambio con prefijo no toca los parametros de otra instancia', () => {
  const params = new URLSearchParams('t1_page=1&t2_page=1&t2_sort=name')
  const url = urlConCambio(params, 'page=1', 'page=2', 't1_')

  const resultado = new URLSearchParams(url.slice(1))
  assert.equal(resultado.get('t1_page'), '2')
  assert.equal(resultado.get('t2_page'), '1')
  assert.equal(resultado.get('t2_sort'), 'name')
})

test('dos instancias con prefijos distintos cambian su pagina sin pisar la de la otra', () => {
  let params = new URLSearchParams('t1_page=1&t2_page=1')

  const urlUno = urlConCambio(params, 't1_page=1'.replace('t1_', ''), 'page=3', 't1_')
  params = new URLSearchParams(urlUno.slice(1))
  assert.equal(params.get('t1_page'), '3')
  assert.equal(params.get('t2_page'), '1')

  const urlDos = urlConCambio(params, 'page=1', 'page=5', 't2_')
  params = new URLSearchParams(urlDos.slice(1))
  assert.equal(params.get('t1_page'), '3')
  assert.equal(params.get('t2_page'), '5')
})

test('urlConParametroPropio escribe la clave con su prefijo y conserva el resto', () => {
  const params = new URLSearchParams('t1_vista=tabla&otro=1')
  const url = urlConParametroPropio(params, 'vista', 'tarjetas', 't1_')

  const resultado = new URLSearchParams(url.slice(1))
  assert.equal(resultado.get('t1_vista'), 'tarjetas')
  assert.equal(resultado.get('otro'), '1')
})
