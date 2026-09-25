/**
 * Pruebas del selector de etiquetas: qué se ofrece mientras se escribe y qué se agrega.
 *
 * Cubren el caso que originó el selector: alguien escribe "licitacion" y, sin ver que ya existe
 * "Licitación", crea una tercera variante del mismo concepto.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarEtiqueta, esMismaEtiqueta, sugerenciasDeEtiqueta } from '../src/dominio/etiquetas.ts'

const CATALOGO = ['Licitación', 'licitaciones', 'Codelco', 'Colbún', '2026', 'Paid media', 'H&M']

test('la misma etiqueta sin mirar mayúsculas, acentos ni espacios', () => {
  assert.ok(esMismaEtiqueta(' licitacion ', 'Licitación'))
  assert.ok(!esMismaEtiqueta('licitacion', 'licitaciones'))
})

test('lo escrito que ya existe es exacta y no se ofrece como nueva', () => {
  const { exacta, coincidencias, nueva } = sugerenciasDeEtiqueta(CATALOGO, 'licitacion')

  assert.equal(exacta, 'Licitación')
  assert.equal(nueva, null)
  assert.deepEqual(coincidencias, ['Licitación', 'licitaciones'])
})

test('lo que no existe se ofrece como nueva, recortado', () => {
  const { exacta, nueva } = sugerenciasDeEtiqueta(CATALOGO, '  Minería  ')

  assert.equal(exacta, null)
  assert.equal(nueva, 'Minería')
})

test('un error de tipeo encuentra la parecida, también a medio escribir', () => {
  assert.deepEqual(sugerenciasDeEtiqueta(CATALOGO, 'licitasion').parecidas, ['Licitación', 'licitaciones'])
  assert.ok(sugerenciasDeEtiqueta(CATALOGO, 'licitasi').parecidas.includes('licitaciones'))
  assert.deepEqual(sugerenciasDeEtiqueta(CATALOGO, 'Colbun').coincidencias, ['Colbún'])
  assert.equal(sugerenciasDeEtiqueta(CATALOGO, 'licitasion').nueva, 'licitasion')
})

test('en textos cortos no se inventan parecidas', () => {
  assert.deepEqual(sugerenciasDeEtiqueta(CATALOGO, 'H&N').parecidas, [])
})

test('las ya elegidas no se ofrecen ni se proponen como nuevas', () => {
  const { coincidencias, exacta, nueva } = sugerenciasDeEtiqueta(CATALOGO, 'licitacion', ['Licitación'])

  assert.deepEqual(coincidencias, ['licitaciones'])
  assert.equal(exacta, null)
  assert.equal(nueva, null)
})

test('con el campo vacío se ofrece el catálogo en orden, sin nueva', () => {
  const { coincidencias, nueva } = sugerenciasDeEtiqueta(CATALOGO, '', ['Codelco'])

  assert.equal(nueva, null)
  assert.ok(!coincidencias.includes('Codelco'))
  assert.equal(coincidencias[0], '2026')
})

test('entradas nulas o sucias no rompen', () => {
  assert.deepEqual(sugerenciasDeEtiqueta(null, null), { exacta: null, coincidencias: [], parecidas: [], nueva: null })
  assert.deepEqual(sugerenciasDeEtiqueta(undefined, 'algo').nueva, 'algo')
  assert.equal(sugerenciasDeEtiqueta(CATALOGO, 'x'.repeat(101)).nueva, null)
  assert.deepEqual(sugerenciasDeEtiqueta(['', '  ', 'Uno', 'Uno'], '').coincidencias, ['Uno'])
})

test('agregar usa el nombre del catálogo y no repite', () => {
  assert.deepEqual(agregarEtiqueta([], 'licitacion', CATALOGO), ['Licitación'])
  assert.deepEqual(agregarEtiqueta(['Licitación'], 'LICITACIÓN', CATALOGO), ['Licitación'])
  assert.deepEqual(agregarEtiqueta(['Codelco'], ' Minería ', CATALOGO), ['Codelco', 'Minería'])
  assert.deepEqual(agregarEtiqueta(['Codelco'], '   ', CATALOGO), ['Codelco'])
  assert.deepEqual(agregarEtiqueta([], 'x'.repeat(101)), [])
})
