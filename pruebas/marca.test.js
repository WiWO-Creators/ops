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
const orbe = leer('../src/estilos/thinking-orb.css')

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

/**
 * El orbe no pide excepcion al `backdrop-filter`, y esta prueba lo mantiene asi.
 *
 * La version anterior del orbe era vidrio de verdad —desenfocaba lo que tenia detras— y por eso
 * tenia una excepcion documentada, acotada al tamaño grande. El orbe de neo.wiwo.me no lo necesita:
 * resuelve el vidrio sumando capas de luz con `mix-blend-mode`, y su version final apaga el
 * `backdrop-filter` explicitamente. La hoja generada borra ademas las declaraciones muertas que lo
 * prendian, asi que la prohibicion del sistema de diseño se cumple sin excepciones.
 *
 * Si alguien repone la excepcion —o pega una version vieja del CSS—, esta prueba lo dice.
 */
test('el orbe no enciende backdrop-filter en ninguna regla', () => {
  const css = sinComentarios(orbe)

  for (const [, selector, cuerpo] of css.matchAll(/([^{}]+)\{([^{}]*backdrop-filter[^{}]*)\}/g)) {
    assert.match(
      cuerpo,
      /backdrop-filter:\s*none/,
      `el orbe enciende backdrop-filter en "${selector.trim()}": el sistema de diseño lo prohibe en ` +
      'superficies siempre visibles y este orbe no lo necesita'
    )
  }
})

/**
 * El lienzo del ARMAZON esta quieto, y esta prueba es lo que lo mantiene asi.
 *
 * La capa `.aurora` esta debajo de las ocho pantallas, toda la jornada: ahi el guardrail del
 * sistema —prohibido el movimiento perpetuo sobre algo siempre visible— aplica sin excepcion. El
 * sistema de diseño dice que los guardrails se hacen cumplir con pruebas y no con buena voluntad:
 * esta es la de este.
 *
 * Lo que si esta permitido es que UNA pantalla pida el movimiento para si (ver la prueba siguiente):
 * eso ya no es "siempre visible". La distincion tiene que quedar en el selector, y por eso lo que se
 * mira aca es la regla incondicional y no cualquier regla que empiece con `.aurora`.
 */
test('la capa de luz del armazon no se anima', () => {
  const css = sinComentarios(globals)
  const regla = /\.aurora::before\s*\{([^}]*)\}/.exec(css)

  assert.ok(regla !== null, 'no existe la regla .aurora::before')
  assert.doesNotMatch(
    regla[1],
    /animation/,
    'la capa de luz cubre las ocho pantallas del panel: una animacion ahi es movimiento perpetuo ' +
    'sobre algo siempre visible, que es justo lo que el guardrail de rendimiento prohibe'
  )
})

/**
 * La deriva del lienzo es del Inicio, y de ninguna otra pantalla.
 *
 * El movimiento se enciende desde la pantalla (`.lienzo-vivo` en su raiz), no desde el armazon. Si
 * alguien borra esa condicion del selector, la deriva se derrama sobre las ocho y el guardrail de
 * arriba queda burlado por el costado.
 */
test('la deriva del lienzo esta acotada a la pantalla que la pide', () => {
  const css = sinComentarios(globals)
  const derivas = [...css.matchAll(/([^{}]*)\{[^}]*animation:\s*deriva-lienzo[^}]*\}/g)]

  assert.equal(derivas.length, 1, 'la deriva del lienzo se declara una sola vez')
  assert.match(
    derivas[0][1],
    /:has\(\.lienzo-vivo\)/,
    'sin la condicion `.lienzo-vivo` la deriva vuelve a ser movimiento perpetuo bajo las ocho pantallas'
  )
  assert.match(css, /@keyframes deriva-lienzo/, 'la animacion referencia fotogramas que no existen')
})

/**
 * Exactamente dos animaciones perpetuas en todo el panel, y son estas dos.
 *
 * Las dos anteriores acotan cada `infinite` conocida a su selector; esta cierra la puerta por la que
 * entraria una tercera. El guardrail del sistema de diseño no es "estas dos estan bien": es que el
 * movimiento perpetuo se agrega por excepcion revisada y no porque quedaba lindo.
 *
 * Vive aca —y no junto a la funcion que lo estrenaria— a proposito: la animacion de escritura del
 * resumen del Inicio se ve porque el texto **esta llegando**, no porque una animacion CSS finja que
 * llega. Con esta prueba ya mergeada, la pantalla que intente fingirla no pasa.
 */
test('globals.css declara exactamente dos animaciones infinitas', () => {
  const css = sinComentarios(globals)
  const infinitas = [...css.matchAll(/animation:\s*([a-z0-9-]+)[^;]*\binfinite\b/gi)].map(([, nombre]) => nombre)

  assert.deepEqual(
    infinitas.sort(),
    ['brillo-marca', 'deriva-lienzo'],
    'una animacion `infinite` nueva es movimiento perpetuo: va con excepcion revisada, no de contrabando'
  )
})

/**
 * El brillo del saludo solo mueve `background-position`, que es lo unico que puede mover.
 *
 * El relleno esta recortado sobre el texto: `transform` moveria la letra en vez del color. Es la
 * excepcion de un elemento —el nombre del saludo—, y esta prueba la mantiene siendo eso.
 */
test('el brillo del saludo no arrastra la letra', () => {
  const css = sinComentarios(globals)
  const fotogramas = /@keyframes brillo-marca\s*\{([\s\S]*?)\n  \}/.exec(css)

  assert.ok(fotogramas !== null, 'no existen los fotogramas del brillo del saludo')
  assert.doesNotMatch(fotogramas[1], /transform|width|height|margin/, 'el brillo solo corre el relleno')
})

/**
 * Una sola capa de luz, aunque la clase aparezca anidada.
 *
 * El `::before` es `fixed`: dos `.aurora` anidadas pintan la MISMA ventana dos veces y cada
 * resplandor sale al doble de intensidad. Como ninguna pantalla puede saber si su armazon ya puso la
 * capa, lo resuelve el sistema apagando la de mas adentro.
 */
test('una .aurora anidada no vuelve a pintar la luz', () => {
  assert.match(
    sinComentarios(globals),
    /\.aurora\s+\.aurora::before\s*\{[^}]*content:\s*none/,
    'sin esta regla, un armazon con aurora mas una pantalla con aurora duplican el resplandor'
  )
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

test('el logotipo conserva la proporcion que el componente asume', () => {
  // `Logo.tsx` deriva el ancho de la altura con la proporcion del archivo. Si alguien reemplaza el
  // PNG por otro de distinta relacion, el logo sale estirado y nadie se entera hasta verlo.
  const componente = leer('../src/componentes/estructura/Logo.tsx')
  const ancho = Number(componente.match(/const ANCHO = (\d+)/)[1])
  const alto = Number(componente.match(/const ALTO = (\d+)/)[1])
  const ruta = componente.match(/const RUTA = '([^']+)'/)[1]

  // Cabecera PNG: los bytes 16..24 son el ancho y el alto del IHDR, big-endian.
  const png = readFileSync(new URL(`../public${ruta}`, import.meta.url))
  assert.equal(png.readUInt32BE(16), ancho, 'el ancho del archivo no es el que declara el componente')
  assert.equal(png.readUInt32BE(20), alto, 'el alto del archivo no es el que declara el componente')
})

test('el logotipo se pinta con el color de marca de cada tema', () => {
  const marca = declaraciones().find(([nombre]) => nombre === '--marca')
  assert.ok(marca !== undefined, 'falta --marca: sin el, el logo se pinta del color heredado')
  assert.equal(marca[1], 'light-dark(var(--wiwo-blue), var(--wiwo-beige))')
  assert.match(tokens, /--wiwo-beige:\s*#F8FAD7/i, 'el beige de marca es el color del logo sobre oscuro')
})
