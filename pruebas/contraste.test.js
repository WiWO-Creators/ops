/**
 * Contraste calculado, no documentado.
 *
 * El fallo anterior fue exactamente creer en un comentario: `--texto-acento-2` decia corregir el
 * contraste del purpura y daba 4.09:1. Esta prueba resuelve los `color-mix()` y los `light-dark()` a
 * un color concreto y calcula la relacion segun WCAG 2.1. Si un par de texto no llega a 4.5:1, falla.
 *
 * Se resuelve el CSS a mano en vez de levantar un navegador: son dos funciones y un parser chico, y
 * un navegador en las pruebas seria arrastrar Playwright para calcular una division.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const fuentes = ['../src/estilos/tokens.css', '../src/estilos/neo.css', '../src/estilos/neo-tokens.css']
  .map(leer)
  .map(sinComentarios)
  .join('\n')

/** Declaraciones `--x: valor`, en orden de aparicion. La ultima gana, como en CSS. */
function declaraciones () {
  const mapa = new Map()
  for (const [, nombre, valor] of fuentes.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    mapa.set(nombre, valor.replace(/\s+/g, ' ').trim())
  }
  return mapa
}

const TOKENS = declaraciones()

/** Separa los argumentos de una funcion CSS respetando parentesis anidados. */
function partirArgumentos (texto) {
  const partes = []
  let profundidad = 0
  let actual = ''
  for (const caracter of texto) {
    if (caracter === '(') profundidad++
    if (caracter === ')') profundidad--
    if (caracter === ',' && profundidad === 0) {
      partes.push(actual.trim())
      actual = ''
      continue
    }
    actual += caracter
  }
  if (actual.trim() !== '') partes.push(actual.trim())
  return partes
}

/** Extrae el contenido de `funcion(...)` desde una posicion. */
function cuerpoDeFuncion (texto, nombre) {
  const inicio = texto.indexOf(nombre + '(')
  if (inicio === -1) return null
  let profundidad = 0
  for (let i = inicio + nombre.length; i < texto.length; i++) {
    if (texto[i] === '(') profundidad++
    else if (texto[i] === ')') {
      profundidad--
      if (profundidad === 0) return texto.slice(inicio + nombre.length + 1, i)
    }
  }
  return null
}

/** `#rgb` o `#rrggbb` a [r,g,b] en 0-255. */
function desdeHex (hex) {
  const limpio = hex.replace('#', '')
  const partes = limpio.length === 3
    ? [...limpio].map((c) => c + c)
    : [limpio.slice(0, 2), limpio.slice(2, 4), limpio.slice(4, 6)]
  return partes.map((p) => parseInt(p, 16))
}

/**
 * Resuelve un valor CSS a [r,g,b].
 *
 * Soporta `var()`, `light-dark()`, `color-mix(in srgb, A p%, B)`, hex y `rgb()`. Es lo que usa el
 * sistema; cualquier otra forma lanza, para que un token nuevo no pase sin verificar.
 *
 * @param {string} valor
 * @param {'claro'|'oscuro'} tema cual rama de `light-dark()` tomar
 */
function resolver (valor, tema, profundidad = 0) {
  if (profundidad > 12) throw new Error('referencia circular en ' + valor)
  const texto = valor.trim()

  if (texto.startsWith('#')) return desdeHex(texto)

  if (texto.startsWith('var(')) {
    const dentro = partirArgumentos(cuerpoDeFuncion(texto, 'var'))
    const referido = TOKENS.get(dentro[0])
    if (referido === undefined) {
      if (dentro[1]) return resolver(dentro[1], tema, profundidad + 1)
      throw new Error('token no definido: ' + dentro[0])
    }
    return resolver(referido, tema, profundidad + 1)
  }

  if (texto.startsWith('light-dark(')) {
    const ramas = partirArgumentos(cuerpoDeFuncion(texto, 'light-dark'))
    return resolver(tema === 'claro' ? ramas[0] : ramas[1], tema, profundidad + 1)
  }

  if (texto.startsWith('color-mix(')) {
    const partes = partirArgumentos(cuerpoDeFuncion(texto, 'color-mix'))
    const [primero, segundo] = partes.slice(1)
    const porcentaje = /(\d+(?:\.\d+)?)%/.exec(primero)
    if (porcentaje === null) throw new Error('color-mix sin porcentaje: ' + texto)
    const proporcion = Number(porcentaje[1]) / 100
    const a = resolver(primero.replace(/\s*\d+(?:\.\d+)?%/, ''), tema, profundidad + 1)
    const b = resolver(segundo, tema, profundidad + 1)
    // `transparent` sobre un fondo desconocido no se puede evaluar: se descarta antes de llegar acá.
    return [0, 1, 2].map((i) => Math.round(a[i] * proporcion + b[i] * (1 - proporcion)))
  }

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(texto)
  if (rgb !== null) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]

  throw new Error('no se puede resolver: ' + texto)
}

/** Luminancia relativa, WCAG 2.1. */
function luminancia ([r, g, b]) {
  const canal = (v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Relacion de contraste entre dos colores ya resueltos. */
function contraste (a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (oscuro + 0.05)
}

/** Contraste de un token de texto contra un token de superficie, en un tema. */
function medir (texto, superficie, tema) {
  return contraste(
    resolver('var(' + texto + ')', tema),
    resolver('var(' + superficie + ')', tema)
  )
}

/** Pares que tienen que cumplir AA para texto normal: 4.5:1. */
const PARES_DE_TEXTO = [
  ['--texto', '--superficie'],
  ['--texto', '--superficie-elevada'],
  ['--texto-tenue', '--superficie'],
  ['--texto-tenue', '--superficie-elevada'],
  ['--texto-sutil', '--superficie'],
  ['--texto-sutil', '--superficie-elevada'],
  ['--texto-exito', '--superficie-elevada'],
  ['--texto-aviso', '--superficie-elevada'],
  ['--texto-peligro', '--superficie-elevada'],
  ['--texto-acento-2', '--superficie-elevada'],
  ['--acento', '--superficie-elevada']
]

for (const tema of ['claro', 'oscuro']) {
  for (const [texto, superficie] of PARES_DE_TEXTO) {
    test(`${texto} sobre ${superficie} cumple AA en tema ${tema}`, () => {
      const relacion = medir(texto, superficie, tema)
      assert.ok(
        relacion >= 4.5,
        `${texto} sobre ${superficie} (${tema}) da ${relacion.toFixed(2)}:1, y AA exige 4.5:1`
      )
    })
  }
}

test('el contenido sobre un relleno de estado contrasta con su fondo', () => {
  // Los `--relleno-*` son fondos fuertes: lo que va encima es `--relleno-*-contenido`, y ese par es
  // el que hay que verificar. El verde de marca es el caso extremo: solo funciona con tinta encima.
  for (const tema of ['claro', 'oscuro']) {
    for (const estado of ['exito', 'aviso', 'peligro']) {
      const relacion = contraste(
        resolver(`var(--relleno-${estado}-contenido)`, tema),
        resolver(`var(--relleno-${estado})`, tema)
      )
      assert.ok(
        relacion >= 4.5,
        `--relleno-${estado}-contenido sobre --relleno-${estado} (${tema}) da ${relacion.toFixed(2)}:1`
      )
    }
  }
})

test('el verde de marca sigue siendo ilegible como texto sobre claro', () => {
  // No es una regresion: es la razon de ser de la regla. Si algun dia esto pasara de 4.5, seria que
  // alguien cambio el verde, y la regla tendria que revisarse en vez de heredarse.
  const relacion = contraste(resolver('var(--wiwo-green)', 'claro'), resolver('var(--superficie-elevada)', 'claro'))
  assert.ok(relacion < 4.5, `el verde da ${relacion.toFixed(2)}:1 sobre claro; la regla asume que no alcanza`)
})

test('los tokens que globals.css consume estan definidos', () => {
  // El bug que motivo todo esto: `globals.css` usaba --step-0, --weight-body y --weight-display sin
  // que existieran, asi que los titulares no salian en peso 800 y el cuerpo ignoraba la escala.
  const globals = sinComentarios(leer('../src/app/globals.css'))
  const usados = new Set([...globals.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(([, n]) => n))

  // `globals.css` tambien DEFINE tokens, dentro de su bloque `@theme`: las familias tipograficas
  // viven ahi y no en los archivos de tokens.
  const propios = new Set([...globals.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(([, n]) => n))

  const sinDefinir = [...usados].filter((token) => !TOKENS.has(token) && !propios.has(token))
  assert.deepEqual(sinDefinir, [], 'globals.css usa tokens que nadie define')
})
