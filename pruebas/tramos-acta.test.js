/**
 * Pruebas de los tramos de reemplazo del Meeting Paper (`src/dominio/tramos-acta.ts`).
 *
 * Lógica pura: se parte el HTML en bloques de primer nivel y se comprueba que los tramos, aplicados
 * en orden sobre los bloques del acta actual, dejan exactamente los bloques del acta nueva.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITES_REPRODUCCION } from '../src/dominio/diff-acta.ts'
import { bloquesComoHtml, tramosDeReemplazo, ubicarTramosEnVivo } from '../src/dominio/tramos-acta.ts'

/** Aplica los tramos sobre los bloques del acta actual, como lo hace el servicio, y devuelve el HTML. */
function aplicar (actual, tramos) {
  const bloques = bloquesComoHtml(actual)

  for (const tramo of tramos) {
    bloques.splice(tramo.desde, tramo.borrar, ...bloquesComoHtml(tramo.html))
    assert.equal(bloquesComoHtml(tramo.html).length, tramo.insertados)
  }

  return bloques.join('')
}

const BASE = '<h1>Acta</h1><p>Uno</p><ul><li><p>a</p></li><li><p>b</p></li></ul><p>Cierre</p>'

test('bloquesComoHtml parte por bloques de primer nivel, con listas, vacíos y filetes', () => {
  assert.deepEqual(bloquesComoHtml(BASE), ['<h1>Acta</h1>', '<p>Uno</p>', '<ul><li><p>a</p></li><li><p>b</p></li></ul>', '<p>Cierre</p>'])
  assert.deepEqual(bloquesComoHtml('<p></p><hr><p>x<br>y</p>'), ['<p></p>', '<hr>', '<p>x<br>y</p>'])
  assert.deepEqual(bloquesComoHtml('<blockquote><p>cita</p><p>más</p></blockquote>'), ['<blockquote><p>cita</p><p>más</p></blockquote>'])
})

test('bloquesComoHtml tolera atributos con «>», texto suelto, cierres huérfanos y entradas inválidas', () => {
  assert.deepEqual(bloquesComoHtml('<p><a href="https://x.cl/?a=1&b>2">enlace</a></p>'), ['<p><a href="https://x.cl/?a=1&b>2">enlace</a></p>'])
  assert.deepEqual(bloquesComoHtml('suelto<p>uno</p>'), ['<p>suelto</p>', '<p>uno</p>'])
  assert.deepEqual(bloquesComoHtml('</p><p>uno</p>'), ['<p>uno</p>'])
  assert.deepEqual(bloquesComoHtml('<p>sin cierre'), ['<p>sin cierre'])
  assert.deepEqual(bloquesComoHtml(''), [])
  assert.deepEqual(bloquesComoHtml(undefined), [])
})

test('sin diferencias no hay tramos', () => {
  assert.deepEqual(tramosDeReemplazo(BASE, BASE), [])
  assert.deepEqual(tramosDeReemplazo('', ''), [])
})

test('cambiar un bloque da un tramo que lo reemplaza', () => {
  const nuevo = BASE.replace('<p>Uno</p>', '<p>Uno corregido</p>')
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.deepEqual(tramos, [{ desde: 1, borrar: 1, html: '<p>Uno corregido</p>', insertados: 1 }])
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('insertar al final y al principio no borra nada', () => {
  const alFinal = `${BASE}<p>Extra</p>`
  const alInicio = `<p>Antes</p>${BASE}`

  assert.deepEqual(tramosDeReemplazo(BASE, alFinal), [{ desde: 4, borrar: 0, html: '<p>Extra</p>', insertados: 1 }])
  assert.deepEqual(tramosDeReemplazo(BASE, alInicio), [{ desde: 0, borrar: 0, html: '<p>Antes</p>', insertados: 1 }])
})

test('borrar bloques da un tramo sin HTML', () => {
  const nuevo = '<h1>Acta</h1><p>Cierre</p>'
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.deepEqual(tramos, [{ desde: 1, borrar: 2, html: '', insertados: 0 }])
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('cambios separados dan tramos separados y sus posiciones cuentan los anteriores', () => {
  const nuevo = '<h1>Acta nueva</h1><p>Intro</p><p>Intro 2</p><p>Uno</p><ul><li><p>a</p></li></ul><p>Cierre</p><p>Fin</p>'
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.ok(tramos.length >= 3, 'al menos tres huecos separados')
  assert.deepEqual(tramos.map((t) => t.desde), [...tramos.map((t) => t.desde)].sort((a, b) => a - b))
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('un cambio de formato sin cambio de texto también es un tramo', () => {
  const nuevo = BASE.replace('<p>Uno</p>', '<p><strong>Uno</strong></p>')
  const tramos = tramosDeReemplazo(BASE, nuevo)

  assert.equal(tramos.length, 1)
  assert.equal(aplicar(BASE, tramos), nuevo)
})

test('vaciar o llenar un acta entero funciona', () => {
  assert.deepEqual(tramosDeReemplazo(BASE, ''), [{ desde: 0, borrar: 4, html: '', insertados: 0 }])
  assert.deepEqual(tramosDeReemplazo('', '<p>Hola</p>'), [{ desde: 0, borrar: 0, html: '<p>Hola</p>', insertados: 1 }])
})

test('bloques repetidos no confunden la comparación', () => {
  const actual = '<p>x</p><p>x</p><p>y</p><p>x</p>'
  const nuevo = '<p>x</p><p>y</p><p>x</p><p>x</p>'

  assert.equal(aplicar(actual, tramosDeReemplazo(actual, nuevo)), nuevo)
})

test('aplicar los tramos siempre da el acta nueva (barrido de variantes)', () => {
  const piezas = ['<h1>T</h1>', '<p>a</p>', '<p>b</p>', '<hr>', '<ul><li><p>i</p></li></ul>', '<p></p>', '<blockquote><p>c</p></blockquote>']
  let semilla = 7
  const azar = (tope) => { semilla = (semilla * 1103515245 + 12345) % 2_147_483_648; return semilla % tope }
  const secuencia = () => Array.from({ length: azar(7) }, () => piezas[azar(piezas.length)]).join('')

  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const actual = secuencia()
    const nuevo = secuencia()

    assert.equal(aplicar(actual, tramosDeReemplazo(actual, nuevo)), nuevo, `${actual} -> ${nuevo}`)
  }
})

test('con una tabla de comparación demasiado grande se reemplaza todo lo distinto de una vez', () => {
  const lado = Math.ceil(Math.sqrt(LIMITES_REPRODUCCION.maxCeldasLcs)) + 10
  const actual = Array.from({ length: lado }, (_, i) => `<p>a${i}</p>`).join('')
  const nuevo = Array.from({ length: lado }, (_, i) => `<p>b${i}</p>`).join('')
  const tramos = tramosDeReemplazo(actual, nuevo)

  assert.equal(tramos.length, 1)
  assert.equal(tramos[0].borrar, lado)
  assert.equal(tramos[0].insertados, lado)
  assert.equal(aplicar(actual, tramos), nuevo)
})

// --- 3 bandas: base → orbe sobre el documento vivo ----------------------------------------------------

/**
 * Aplica los tramos ubicados sobre los bloques del documento vivo como lo hace el servicio: los bloques
 * a borrar y el ancla se resuelven por identidad (no por posición) y cada tramo entra donde dice su ancla.
 */
function aplicarEnVivo (vivo, tramos) {
  const modelo = bloquesComoHtml(vivo).map((html) => ({ html }))
  let bloques = [...modelo]

  for (const tramo of tramos) {
    const sobran = new Set(tramo.borrarVivos.map((indice) => modelo[indice]))

    bloques = bloques.filter((bloque) => !sobran.has(bloque))

    const { ancla } = tramo
    const posicion = ancla.tipo === 'inicio'
      ? 0
      : ancla.tipo === 'fin' ? bloques.length : bloques.indexOf(modelo[ancla.vivo])
    const destino = posicion < 0 ? bloques.length : ancla.tipo === 'despues' ? posicion + 1 : posicion

    assert.equal(bloquesComoHtml(tramo.html).length, tramo.insertados)
    bloques.splice(destino, 0, ...bloquesComoHtml(tramo.html).map((html) => ({ html })))
  }

  return bloques.map((bloque) => bloque.html)
}

const ACTA = '<h1>Acta</h1><p>Uno</p><p>Dos</p><p>Tres</p>'

test('3 bandas: si el documento vivo es la base, el resultado es exactamente lo que propone el orbe', () => {
  const nuevo = '<h1>Acta</h1><p>Uno corregido</p><p>Dos</p><p>Tres</p><p>Cuatro</p>'

  assert.deepEqual(aplicarEnVivo(ACTA, ubicarTramosEnVivo(ACTA, ACTA, nuevo)), bloquesComoHtml(nuevo))
})

test('3 bandas: sin cambios del orbe, o con el documento vivo ya igual a lo propuesto, no hay nada que aplicar', () => {
  assert.deepEqual(ubicarTramosEnVivo(ACTA, '<p>otra cosa escrita por alguien</p>', ACTA), [])
  assert.deepEqual(ubicarTramosEnVivo(ACTA, '<h1>Acta</h1><p>Uno!</p><p>Dos</p><p>Tres</p>', '<h1>Acta</h1><p>Uno!</p><p>Dos</p><p>Tres</p>'), [])
})

test('3 bandas: un bloque que la persona editó se conserva y lo del orbe entra a continuación', () => {
  const vivo = '<h1>Acta</h1><p>Uno de Ana</p><p>Dos</p><p>Tres</p>'
  const nuevo = '<h1>Acta</h1><p>Uno del orbe</p><p>Dos</p><p>Tres</p>'
  const tramos = ubicarTramosEnVivo(ACTA, vivo, nuevo)

  assert.equal(tramos.length, 1)
  assert.deepEqual(tramos[0].borrarVivos, [], 'el bloque editado no se borra')
  assert.equal(tramos[0].conservados, 1)
  assert.deepEqual(aplicarEnVivo(vivo, tramos), ['<h1>Acta</h1>', '<p>Uno de Ana</p>', '<p>Uno del orbe</p>', '<p>Dos</p>', '<p>Tres</p>'])
})

test('3 bandas: lo que la persona editó en un bloque que el orbe no toca queda intacto, y lo del orbe se aplica', () => {
  const vivo = '<h1>Acta</h1><p>Uno de Ana</p><p>Dos</p><p>Tres</p>'
  const nuevo = '<h1>Acta</h1><p>Uno</p><p>Dos revisado</p><p>Tres</p>'

  assert.deepEqual(aplicarEnVivo(vivo, ubicarTramosEnVivo(ACTA, vivo, nuevo)), ['<h1>Acta</h1>', '<p>Uno de Ana</p>', '<p>Dos revisado</p>', '<p>Tres</p>'])
})

test('3 bandas: si la persona borró el bloque que el orbe cambia, lo del orbe igual entra', () => {
  const vivo = '<h1>Acta</h1><p>Uno</p><p>Tres</p>'
  const nuevo = '<h1>Acta</h1><p>Uno</p><p>Dos revisado</p><p>Tres</p>'

  assert.deepEqual(aplicarEnVivo(vivo, ubicarTramosEnVivo(ACTA, vivo, nuevo)), ['<h1>Acta</h1>', '<p>Uno</p>', '<p>Dos revisado</p>', '<p>Tres</p>'])
})

test('3 bandas: un bloque nuevo que alguien agregó al final no se pisa cuando el orbe también agrega', () => {
  const vivo = `${ACTA}<p>De Ana</p>`
  const nuevo = `${ACTA}<p>Del orbe</p>`
  const resultado = aplicarEnVivo(vivo, ubicarTramosEnVivo(ACTA, vivo, nuevo))

  assert.ok(resultado.includes('<p>De Ana</p>') && resultado.includes('<p>Del orbe</p>'))
  assert.equal(resultado.length, 6)
})

test('3 bandas: el orbe borra bloques y los que la persona ya había editado se quedan', () => {
  const vivo = '<h1>Acta</h1><p>Uno</p><p>Dos de Ana</p><p>Tres</p>'
  const nuevo = '<h1>Acta</h1><p>Tres</p>'
  const resultado = aplicarEnVivo(vivo, ubicarTramosEnVivo(ACTA, vivo, nuevo))

  assert.deepEqual(resultado, ['<h1>Acta</h1>', '<p>Dos de Ana</p>', '<p>Tres</p>'], 'se borra «Uno» (intacto) y se conserva «Dos de Ana»')
})

test('3 bandas: con una base que no tiene nada que ver con el documento vivo no se borra nada ajeno', () => {
  const vivo = '<p>Otro 1</p><p>Otro 2</p>'
  const resultado = aplicarEnVivo(vivo, ubicarTramosEnVivo(ACTA, vivo, '<h1>Acta</h1><p>Uno</p><p>Dos nuevo</p><p>Tres</p>'))

  assert.ok(resultado.includes('<p>Otro 1</p>') && resultado.includes('<p>Otro 2</p>'))
  assert.ok(resultado.includes('<p>Dos nuevo</p>'))
})

test('3 bandas (barrido): con el vivo igual a la base da lo del orbe; con un bloque ajeno nunca se pierde', () => {
  const piezas = ['<h1>T</h1>', '<p>a</p>', '<p>b</p>', '<hr>', '<ul><li><p>i</p></li></ul>', '<p></p>', '<blockquote><p>c</p></blockquote>']
  let semilla = 11
  const azar = (tope) => { semilla = (semilla * 1103515245 + 12345) % 2_147_483_648; return semilla % tope }
  const secuencia = () => Array.from({ length: azar(7) }, () => piezas[azar(piezas.length)])

  for (let vuelta = 0; vuelta < 300; vuelta++) {
    const base = secuencia()
    const nuevo = secuencia()

    assert.deepEqual(aplicarEnVivo(base.join(''), ubicarTramosEnVivo(base.join(''), base.join(''), nuevo.join(''))), nuevo, `${base.join('')} -> ${nuevo.join('')}`)

    // Una persona reemplaza un bloque de la base por texto suyo, o agrega uno en un lugar cualquiera.
    const vivo = [...base]
    const lugar = azar(vivo.length + 1)

    if (vivo.length > 0 && azar(2) === 0) vivo[Math.min(lugar, vivo.length - 1)] = '<p>PERSONA</p>'
    else vivo.splice(lugar, 0, '<p>PERSONA</p>')

    const tramos = ubicarTramosEnVivo(base.join(''), vivo.join(''), nuevo.join(''))
    const resultado = aplicarEnVivo(vivo.join(''), tramos)

    assert.ok(resultado.includes('<p>PERSONA</p>'), `se perdió lo de la persona: ${vivo.join('')} + ${base.join('')} -> ${nuevo.join('')}`)

    for (const tramo of tramos) {
      for (const bloque of bloquesComoHtml(tramo.html)) assert.ok(resultado.includes(bloque), `falta lo del orbe ${bloque}`)
    }
  }
})
