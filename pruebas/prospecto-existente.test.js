/**
 * Pruebas de la coincidencia de empresa en el alta de licitación.
 *
 * Lo que se fija es lo que produjo los duplicados de SERNATUR y «Puerto San Antonio / EPSA»: que la
 * misma empresa escrita con otra caja, otros acentos o un espacio de más se reconozca como la misma.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coincidenciasDeEmpresa,
  MAXIMO_DE_SUGERENCIAS,
  normalizarEmpresa,
  terminoDeBusqueda
} from '../src/dominio/prospecto-existente.ts'

const PROSPECTOS = [
  { id: 1, empresa: 'SERNATUR' },
  { id: 2, empresa: 'Puerto San Antonio / EPSA' },
  { id: 3, empresa: 'Servicio Nacional de Turismo Sernatur Regional' },
  { id: 4, empresa: 'Colbún' }
]

test('normalizarEmpresa ignora mayúsculas, acentos y espacios de borde', () => {
  assert.equal(normalizarEmpresa('  SERNATUR '), 'sernatur')
  assert.equal(normalizarEmpresa('Colbún'), 'colbun')
  assert.equal(normalizarEmpresa('Ñuble'), 'nuble')
  assert.equal(normalizarEmpresa('Puerto San Antonio / EPSA'), 'puerto san antonio / epsa')
})

test('normalizarEmpresa trata null, undefined y vacío como cadena vacía', () => {
  assert.equal(normalizarEmpresa(null), '')
  assert.equal(normalizarEmpresa(undefined), '')
  assert.equal(normalizarEmpresa('   '), '')
})

test('terminoDeBusqueda no busca con vacío, espacios o un solo carácter', () => {
  assert.equal(terminoDeBusqueda(''), null)
  assert.equal(terminoDeBusqueda('   '), null)
  assert.equal(terminoDeBusqueda(null), null)
  assert.equal(terminoDeBusqueda(undefined), null)
  assert.equal(terminoDeBusqueda(' s '), null)
})

test('terminoDeBusqueda recorta los bordes y conserva lo escrito', () => {
  assert.equal(terminoDeBusqueda('  Sernatur  '), 'Sernatur')
  assert.equal(terminoDeBusqueda('Colbún'), 'Colbún')
})

test('coincidenciasDeEmpresa reconoce la exacta sin importar caja, acentos ni bordes', () => {
  const { exacta, sugerencias } = coincidenciasDeEmpresa(PROSPECTOS, '  sernatur ')
  assert.equal(exacta?.id, 1)
  assert.equal(sugerencias[0].id, 1)
  assert.deepEqual(sugerencias.map((p) => p.id), [1, 3])

  assert.equal(coincidenciasDeEmpresa(PROSPECTOS, 'COLBUN').exacta?.id, 4)
})

test('coincidenciasDeEmpresa ofrece parciales sin marcarlas como exactas', () => {
  const { exacta, sugerencias } = coincidenciasDeEmpresa(PROSPECTOS, 'puerto san')
  assert.equal(exacta, null)
  assert.deepEqual(sugerencias.map((p) => p.id), [2])
})

test('coincidenciasDeEmpresa descarta lo que ya no coincide con el campo', () => {
  assert.deepEqual(coincidenciasDeEmpresa(PROSPECTOS, 'empresa inexistente'), { sugerencias: [], exacta: null })
})

test('coincidenciasDeEmpresa no rompe con texto vacío ni lista ausente', () => {
  assert.deepEqual(coincidenciasDeEmpresa(PROSPECTOS, ''), { sugerencias: [], exacta: null })
  assert.deepEqual(coincidenciasDeEmpresa(null, 'sernatur'), { sugerencias: [], exacta: null })
  assert.deepEqual(coincidenciasDeEmpresa([], 'sernatur'), { sugerencias: [], exacta: null })
})

test('coincidenciasDeEmpresa corta en el máximo de sugerencias', () => {
  const muchos = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, empresa: `Sernatur ${i}` }))
  assert.equal(coincidenciasDeEmpresa(muchos, 'sernatur').sugerencias.length, MAXIMO_DE_SUGERENCIAS)
})
