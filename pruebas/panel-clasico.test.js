/**
 * Pruebas del enlace al panel clasico.
 *
 * Lo unico que importa aca es que sin `NEXT_PUBLIC_BOARD_URL` la funcion diga `null`: la pantalla lo
 * usa para NO dibujar el enlace, y un enlace a un dominio inventado manda a la gente a un 404 con
 * cara de error del producto.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlClasica } from '../src/lib/panel-clasico.ts'

const BASE = 'https://board.wiwo.me'

test('arma la URL del listado y la de un Espacio', () => {
  assert.equal(urlClasica('espacios', null, BASE), 'https://board.wiwo.me/admin/projects')
  assert.equal(urlClasica('espacio', 93, BASE), 'https://board.wiwo.me/admin/projects/view/93')
})

test('sin dominio configurado devuelve null', () => {
  assert.equal(urlClasica('espacios', null, undefined), null)
  assert.equal(urlClasica('espacios', null, ''), null)
  assert.equal(urlClasica('espacios', null, '   '), null)
})

test('la barra final del dominio no duplica la del camino', () => {
  assert.equal(urlClasica('espacios', null, 'https://board.wiwo.me/'), 'https://board.wiwo.me/admin/projects')
  assert.equal(urlClasica('espacios', null, 'https://board.wiwo.me///'), 'https://board.wiwo.me/admin/projects')
})

test('un id que no sirve no produce una URL a medias', () => {
  assert.equal(urlClasica('espacio', 0, BASE), null)
  assert.equal(urlClasica('espacio', null, BASE), null)
  assert.equal(urlClasica('espacio', Number.NaN, BASE), null)
})
