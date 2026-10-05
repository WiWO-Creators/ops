/**
 * Pruebas del retardo del buscador: una rafaga de llamadas termina en una sola accion, con los
 * argumentos de la ultima, y cancelar la deja sin ejecutar.
 */

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

import { conRetardo } from '../src/lib/retardo.ts'

test('conRetardo ejecuta una sola vez, con el ultimo argumento, tras la pausa', () => {
  mock.timers.enable({ apis: ['setTimeout'] })

  const recibidos = []
  const retardo = conRetardo((valor) => { recibidos.push(valor) }, 250)

  retardo.llamar('a')
  mock.timers.tick(100)
  retardo.llamar('ab')
  mock.timers.tick(100)
  retardo.llamar('abc')
  mock.timers.tick(249)
  assert.deepEqual(recibidos, [])

  mock.timers.tick(1)
  assert.deepEqual(recibidos, ['abc'])

  mock.timers.reset()
})

test('conRetardo no ejecuta nada si se cancela antes de la pausa', () => {
  mock.timers.enable({ apis: ['setTimeout'] })

  let ejecuciones = 0
  const retardo = conRetardo(() => { ejecuciones += 1 }, 250)

  retardo.llamar()
  retardo.cancelar()
  mock.timers.tick(1000)
  assert.equal(ejecuciones, 0)

  mock.timers.reset()
})

test('conRetardo cancelar sin nada pendiente no falla', () => {
  conRetardo(() => {}, 250).cancelar()
})
