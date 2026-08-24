/**
 * Reglas de marca que no se pueden dejar libradas a que alguien se acuerde.
 *
 * La principal: el verde `#3BFF00` es ilegible como texto sobre blanco. La regla vive documentada
 * desde `wiwo-board/assets/neo/wiwo.bridge.css:5-7`, y acá se vuelve verificable.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

/**
 * Quita los comentarios `/* *\/` de una hoja de estilos.
 *
 * Hace falta porque los comentarios de este proyecto nombran justamente lo que esta prohibido
 * (`backdrop-filter`, el verde como texto) para explicar por que: sin esto, la documentacion de una
 * regla haria fallar la prueba de esa regla.
 */
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const neo = leer('../src/estilos/neo.css')
const tokens = leer('../src/estilos/tokens.css')
const globals = leer('../src/app/globals.css')

/** Declaraciones de neo.css, como pares `[nombre, valor]`. */
function declaraciones () {
  return [...sinComentarios(neo).matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)].map(([, nombre, valor]) => [
    nombre,
    valor.replace(/\s+/g, ' ').trim()
  ])
}

/**
 * Rama clara de un valor: lo que queda dentro del primer argumento de `light-dark()`, o el valor
 * entero si no usa `light-dark()`.
 */
function ramaClara (valor) {
  const inicio = valor.indexOf('light-dark(')
  if (inicio === -1) return valor

  let profundidad = 0
  let desde = inicio + 'light-dark('.length
  for (let i = desde; i < valor.length; i++) {
    if (valor[i] === '(') profundidad++
    else if (valor[i] === ')') profundidad--
    else if (valor[i] === ',' && profundidad === 0) return valor.slice(desde, i).trim()
  }
  return valor.slice(desde).trim()
}

test('ningun --texto-* usa el verde de marca en su rama clara', () => {
  const infractores = declaraciones()
    .filter(([nombre]) => nombre.startsWith('--texto'))
    .filter(([, valor]) => /--wiwo-green|#3bff00/i.test(ramaClara(valor)))
    .map(([nombre]) => nombre)

  assert.deepEqual(infractores, [], 'el verde solo va como relleno sobre claro, nunca como texto')
})

test('el verde de marca solo aparece en tokens de relleno', () => {
  const conVerde = declaraciones()
    .filter(([, valor]) => /--wiwo-green(?![-a-z])/i.test(valor))
    .map(([nombre]) => nombre)

  assert.ok(conVerde.length > 0, 'el verde tiene que usarse en algun lado')
  for (const nombre of conVerde) {
    assert.ok(
      nombre.startsWith('--relleno-') || nombre.startsWith('--superficie-') || nombre.startsWith('--texto-exito'),
      `${nombre} usa el verde fuera de un token de relleno o superficie`
    )
  }
})

test('todo relleno de estado declara su color de contenido', () => {
  const rellenos = declaraciones()
    .map(([nombre]) => nombre)
    .filter((n) => n.startsWith('--relleno-') && !n.endsWith('-contenido'))

  for (const relleno of rellenos) {
    assert.ok(
      neo.includes(`${relleno}-contenido:`),
      `${relleno} no declara ${relleno}-contenido: un fondo sin su color de texto se usa mal`
    )
  }
})

test('no se usa backdrop-filter en ningun estilo', () => {
  // Colgaba el panel en pantallas Retina. La profundidad sale de sombra y contraste, no de desenfoque.
  for (const [nombre, contenido] of [['neo.css', neo], ['globals.css', globals]]) {
    assert.ok(
      !/backdrop-filter|backdrop-blur/i.test(sinComentarios(contenido)),
      `${nombre} usa backdrop-filter`
    )
  }
})

test('todo semantico de neo.css esta expuesto en el @theme de globals.css', () => {
  const semanticos = new Set(declaraciones().map(([nombre]) => nombre))
  const expuestos = new Set([...globals.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(([, n]) => n))
  const sinExponer = [...semanticos].filter((n) => !expuestos.has(n) && !n.startsWith('--deshabilitado'))

  assert.deepEqual(sinExponer, [], 'un semantico que no llega al @theme no se puede usar como utilidad')
})

test('la paleta de marca sigue intacta en tokens.css', () => {
  // tokens.css se copio literal del tema portado: si alguien lo edita, la marca deja de ser la marca.
  for (const [nombre, valor] of [
    ['--wiwo-blue', '#4242FF'],
    ['--wiwo-green', '#3BFF00'],
    ['--wiwo-purple', '#8D7CFF'],
    ['--wiwo-ink', '#292929']
  ]) {
    assert.match(tokens, new RegExp(`${nombre}:\\s*${valor}`, 'i'), `${nombre} cambio de valor`)
  }
})

test('no se cargan fuentes desde Google', () => {
  const fuentes = leer('../src/estilos/fonts.css')
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(fuentes), 'las fuentes son self-hosted')
})
