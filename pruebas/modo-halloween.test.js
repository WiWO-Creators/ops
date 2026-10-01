/**
 * Contraste del modo Halloween, calculado y no documentado.
 *
 * `halloween.css` declara cada token como `light-dark(#claro, #oscuro)` con literales, asi que no hace
 * falta resolver `color-mix()`: se leen los dos hexadecimales y se aplica la formula de WCAG 2.1. Los
 * pares son los mismos que `contraste.test.js` defiende para la marca, mas el boton de acento.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/estilos/modos/halloween.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** `[claro, oscuro]` de un token declarado con `light-dark(#a, #b)`. */
function par (token) {
  const encontrado = new RegExp(`${token}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(css)
  assert.ok(encontrado, `${token} tiene que ser light-dark() con dos literales hexadecimales`)
  return [encontrado[1], encontrado[2]]
}

/** Luminancia relativa de un `#rrggbb`. */
function luminancia (hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste (a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (oscuro + 0.05)
}

/** [texto, fondo, descripcion] */
const PARES = [
  ['--acento', '--superficie', 'acento sobre el lienzo'],
  ['--acento', '--superficie-elevada', 'acento sobre una tarjeta'],
  ['--acento', '--acento-suave', 'acento sobre su relleno suave'],
  ['--acento-contenido', '--acento', 'texto de un boton de acento'],
  ['--marca', '--superficie', 'logo sobre el lienzo']
]

for (const [texto, fondo, descripcion] of PARES) {
  for (const [indice, tema] of ['claro', 'oscuro'].entries()) {
    test(`Halloween ${tema}: ${descripcion} llega a 4.5:1`, () => {
      const razon = contraste(par(texto)[indice], par(fondo)[indice])
      assert.ok(razon >= 4.5, `${texto} sobre ${fondo} (${tema}) da ${razon.toFixed(2)}:1`)
    })
  }
}

test('Halloween no usa el verde de marca', () => {
  assert.ok(!/3bff00/i.test(css), 'el verde #3BFF00 no cabe en este modo')
})
