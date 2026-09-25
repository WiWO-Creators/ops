/**
 * Pruebas del link a la presentacion de una Licitacion: que acepte lo que la API acepta y nada mas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LARGO_MAXIMO_ENLACE,
  revisarEnlaceDePresentacion,
  servicioDelEnlace
} from '../src/dominio/presentacion-licitacion.ts'

const DRIVE = 'https://drive.google.com/drive/folders/1AbC'

test('un link de Drive se acepta recortado', () => {
  assert.deepEqual(revisarEnlaceDePresentacion(`  ${DRIVE} `), { valido: true, url: DRIVE })
})

test('vacio o en blanco quita el link', () => {
  assert.deepEqual(revisarEnlaceDePresentacion(''), { valido: true, url: null })
  assert.deepEqual(revisarEnlaceDePresentacion('   '), { valido: true, url: null })
})

test('sin esquema, con javascript: o demasiado largo se rechaza', () => {
  assert.equal(revisarEnlaceDePresentacion('drive.google.com/x').valido, false)
  assert.equal(revisarEnlaceDePresentacion('javascript:alert(1)').valido, false)
  assert.equal(revisarEnlaceDePresentacion('ftp://x.cl/a').valido, false)
  assert.equal(revisarEnlaceDePresentacion('https://x.cl/' + 'a'.repeat(LARGO_MAXIMO_ENLACE)).valido, false)
})

test('el boton nombra el servicio cuando lo reconoce', () => {
  assert.equal(servicioDelEnlace(DRIVE), 'Google Drive')
  assert.equal(servicioDelEnlace('https://docs.google.com/presentation/d/1/edit'), 'Google Slides')
  assert.equal(servicioDelEnlace('https://www.canva.com/design/x'), 'Canva')
  assert.equal(servicioDelEnlace('https://ejemplo.cl/deck.pdf'), null)
  assert.equal(servicioDelEnlace('no es link'), null)
})
