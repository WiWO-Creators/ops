/**
 * Pruebas del recorte de la cartera de Focals en la URL: lo que se lee de un enlace editado a mano
 * y lo que se escribe de vuelta. Un valor inventado no debe romper la pantalla, y en la cartera
 * propia el filtro `sin_focal` no puede dejar una lista vacía sin ficha para quitarlo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  LARGO_MAXIMO_DE_BUSQUEDA,
  construirRecorte,
  leerRecorte
} from '../src/dominio/recorte-de-cartera.ts'

test('leerRecorte sin parametros devuelve el recorte que no recorta nada', () => {
  assert.deepEqual(leerRecorte(new URLSearchParams(), true), { buscar: '', filtro: 'todas', orden: 'peor' })
})

test('leerRecorte lee texto, filtro y orden validos', () => {
  const params = new URLSearchParams('buscar=ana&filtro=rojo&orden=criticos')

  assert.deepEqual(leerRecorte(params, true), { buscar: 'ana', filtro: 'rojo', orden: 'criticos' })
})

test('leerRecorte cae al valor por defecto con un filtro o un orden inventado', () => {
  const recorte = leerRecorte(new URLSearchParams('filtro=morado&orden=azar'), true)

  assert.equal(recorte.filtro, 'todas')
  assert.equal(recorte.orden, 'peor')
})

test('leerRecorte corta el texto al largo maximo', () => {
  const recorte = leerRecorte(new URLSearchParams({ buscar: 'a'.repeat(LARGO_MAXIMO_DE_BUSQUEDA + 50) }), true)

  assert.equal(recorte.buscar.length, LARGO_MAXIMO_DE_BUSQUEDA)
})

test('leerRecorte: sin_focal se conserva en la cartera entera y cae a todas en la propia', () => {
  const params = new URLSearchParams('filtro=sin_focal')

  assert.equal(leerRecorte(params, true).filtro, 'sin_focal')
  assert.equal(leerRecorte(params, false).filtro, 'todas')
})

test('construirRecorte no escribe lo que vale el valor por defecto', () => {
  assert.equal(construirRecorte({ buscar: '', filtro: 'todas', orden: 'peor' }), '')
})

test('construirRecorte escribe lo que recorta y se lee de vuelta igual', () => {
  const recorte = { buscar: 'análisis & más', filtro: 'amarillo', orden: 'nombre' }
  const query = construirRecorte(recorte)

  assert.deepEqual(leerRecorte(new URLSearchParams(query), true), recorte)
})
