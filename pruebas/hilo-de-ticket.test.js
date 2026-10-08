/**
 * Pruebas de las reglas del seguimiento del hilo: cuando el ultimo mensaje esta a la vista y que se
 * hace al llegar mensajes nuevos.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MARGEN_DE_FINAL_PX, accionDelHilo, ultimoMensajeALaVista } from '../src/dominio/hilo-de-ticket.ts'

test('ultimoMensajeALaVista: dentro de la zona o a un margen de ella', () => {
  assert.equal(ultimoMensajeALaVista({ bottom: 500 }, { bottom: 600 }), true)
  assert.equal(ultimoMensajeALaVista({ bottom: 600 + MARGEN_DE_FINAL_PX }, { bottom: 600 }), true)
  assert.equal(ultimoMensajeALaVista({ bottom: 601 + MARGEN_DE_FINAL_PX }, { bottom: 600 }), false)
  assert.equal(ultimoMensajeALaVista({ bottom: 700 }, { bottom: 600 }, 100), true)
})

test('accionDelHilo: la primera vez aterriza en el ultimo mensaje', () => {
  assert.equal(accionDelHilo(null, 4, false), 'aterrizar')
  assert.equal(accionDelHilo(null, 0, true), 'nada')
})

test('accionDelHilo: con mensajes nuevos sigue a quien esta al final y avisa a quien lee arriba', () => {
  assert.equal(accionDelHilo(3, 4, true), 'seguir')
  assert.equal(accionDelHilo(3, 5, false), 'avisar')
})

test('accionDelHilo: sin crecimiento no hace nada', () => {
  assert.equal(accionDelHilo(3, 3, false), 'nada')
  assert.equal(accionDelHilo(3, 2, true), 'nada')
})
