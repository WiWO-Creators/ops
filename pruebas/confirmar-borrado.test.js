/**
 * Prueba de la logica de `ConfirmarBorrado`: cuando lo escrito habilita el boton de confirmar.
 *
 * Sin `confirmacionEscrita` (lo que va a la papelera) siempre habilita: no hace falta escribir nada.
 * Con ella, tiene que calzar exacto salvo los espacios de los bordes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmacionCoincideCon } from '../src/dominio/confirmar-borrado.ts'

test('sin confirmacion escrita, cualquier cosa (incluido vacio) habilita', () => {
  assert.equal(confirmacionCoincideCon(undefined, ''), true)
  assert.equal(confirmacionCoincideCon(undefined, 'lo que sea'), true)
})

test('con confirmacion escrita, hace falta que calce exacto', () => {
  assert.equal(confirmacionCoincideCon('ELIMINAR', ''), false)
  assert.equal(confirmacionCoincideCon('ELIMINAR', 'eliminar'), false)
  assert.equal(confirmacionCoincideCon('ELIMINAR', 'ELIMINAR'), true)
})

test('los espacios de los bordes no cuentan, ni en lo pedido ni en lo escrito', () => {
  assert.equal(confirmacionCoincideCon('Cliente Acme', '  Cliente Acme  '), true)
  assert.equal(confirmacionCoincideCon('  Cliente Acme  ', 'Cliente Acme'), true)
})
