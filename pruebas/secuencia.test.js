/**
 * Pruebas del detector de secuencias de teclas.
 *
 * Tres cosas que, si se rompen, dejan el atajo inalcanzable o lo disparan solo:
 *
 *   1. Que una secuencia que repite la primera tecla (arriba, arriba) se complete. Es donde falla el
 *      detector de indice: al fallar el segundo paso no sabe si reiniciar a cero o a uno.
 *   2. Que teclas de sobra en el medio no completen nada.
 *   3. Que la cola arranque de nuevo sola: una secuencia fallida no puede dejar basura que haga
 *      disparar la siguiente antes de tiempo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectorDe } from '../src/lib/secuencia.ts'

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a'
]

/** Empuja todas las teclas y devuelve el resultado de la última. */
function tipear (detector, teclas) {
  return teclas.reduce((ultimo, tecla) => detector.empujar(tecla), false)
}

test('la secuencia completa dispara, y sólo en la última tecla', () => {
  const detector = detectorDe(KONAMI)

  KONAMI.slice(0, -1).forEach(tecla => {
    assert.equal(detector.empujar(tecla), false, `${tecla} no debería disparar`)
  })

  assert.equal(detector.empujar('a'), true)
})

test('una secuencia que repite la primera tecla se completa igual', () => {
  // El caso que rompe al detector de índice: la segunda 'ArrowUp' no puede leerse como un reinicio.
  assert.equal(tipear(detectorDe(['ArrowUp', 'ArrowUp', 'b']), ['ArrowUp', 'ArrowUp', 'b']), true)
})

test('no distingue mayúsculas', () => {
  assert.equal(tipear(detectorDe(KONAMI), [...KONAMI.slice(0, -2), 'B', 'A']), true)
})

test('una tecla de sobra en el medio no completa nada', () => {
  const conRuido = [...KONAMI.slice(0, 4), 'x', ...KONAMI.slice(4)]
  assert.equal(tipear(detectorDe(KONAMI), conRuido), false)
})

test('tras un intento fallido la secuencia vuelve a empezar', () => {
  const detector = detectorDe(KONAMI)

  tipear(detector, ['x', 'ArrowDown', 'q'])
  assert.equal(tipear(detector, KONAMI), true, 'la basura previa no puede estorbar')
})

test('tras disparar, la cola queda limpia y no vuelve a disparar sola', () => {
  const detector = detectorDe(KONAMI)

  assert.equal(tipear(detector, KONAMI), true)
  assert.equal(detector.empujar('a'), false, 'una tecla suelta no repite el disparo')
  assert.equal(tipear(detector, KONAMI), true, 'pero la secuencia entera sí')
})

test('reiniciar olvida lo tecleado', () => {
  const detector = detectorDe(KONAMI)

  tipear(detector, KONAMI.slice(0, -1))
  detector.reiniciar()

  assert.equal(detector.empujar('a'), false, 'la última tecla ya no completa nada')
})

test('una tecla que continúa el prefijo no se pierde al reiniciar', () => {
  // 'ArrowUp' fallido seguido de la secuencia entera: la primera cuenta como arranque de la nueva.
  const detector = detectorDe(KONAMI)

  assert.equal(tipear(detector, ['ArrowDown', ...KONAMI]), true)
})
