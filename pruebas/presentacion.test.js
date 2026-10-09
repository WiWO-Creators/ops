/**
 * Marca de "sin dato": una sola definicion, reexportada por los modulos que ya la publicaban.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SIN_DATO } from '../src/lib/presentacion.ts'
import { SIN_DATO as desdeSla } from '../src/lib/sla.ts'
import { SIN_DATO as desdeGestion } from '../src/dominio/gestion.ts'
import { formatearImporte } from '../src/componentes/proyecto/formatos.ts'

test('SIN_DATO es el guion largo y los modulos lo reexportan sin redefinirlo', () => {
  assert.equal(SIN_DATO, '—')
  assert.equal(desdeSla, SIN_DATO)
  assert.equal(desdeGestion, SIN_DATO)
})

test('formatearImporte usa SIN_DATO cuando no hay valor', () => {
  assert.equal(formatearImporte(null), SIN_DATO)
  assert.equal(formatearImporte(Number.NaN), SIN_DATO)
})
