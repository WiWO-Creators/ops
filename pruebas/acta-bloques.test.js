/**
 * Pruebas del paso de HTML a bloques, que es de donde salen el DOCX y el PDF del Meeting Paper.
 *
 * Se prueba `bloquesDeNodos`, que es la parte pura: la lectura del HTML necesita `DOMParser` y solo
 * corre en el navegador. Los nodos se arman a mano acá, que es exactamente lo que `nodosDeHtml`
 * copia del DOM.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloquesDeNodos, textoDe } from '../src/dominio/acta-bloques.ts'

/** Nodo de texto. */
const t = (texto) => ({ etiqueta: '#texto', texto, hijos: [] })

/** Elemento con hijos. */
const e = (etiqueta, ...hijos) => ({
  etiqueta,
  texto: hijos.map((h) => h.texto).join(''),
  hijos
})

test('los títulos conservan su nivel', () => {
  const bloques = bloquesDeNodos([e('h1', t('Kickoff')), e('h2', t('Acuerdos')), e('h4', t('Detalle'))])

  assert.deepEqual(bloques.map((b) => b.tipo), ['titulo', 'titulo', 'titulo'])
  assert.deepEqual(bloques.map((b) => b.nivel), [1, 2, 4])
  assert.equal(textoDe(bloques[1].texto), 'Acuerdos')
})

test('las marcas se heredan y los fragmentos vecinos se juntan', () => {
  const [bloque] = bloquesDeNodos([
    e('p', t('Se revisó el '), e('strong', t('calendario')), t(' completo.'))
  ])

  assert.equal(bloque.tipo, 'parrafo')
  assert.deepEqual(bloque.texto, [
    { texto: 'Se revisó el ' },
    { texto: 'calendario', negrita: true },
    { texto: ' completo.' }
  ])
})

test('negrita y cursiva anidadas marcan el mismo fragmento', () => {
  const [bloque] = bloquesDeNodos([e('p', e('strong', e('em', t('urgente'))))])

  assert.deepEqual(bloque.texto, [{ texto: 'urgente', negrita: true, cursiva: true }])
})

test('las listas guardan su tipo y sus items', () => {
  const [bloque] = bloquesDeNodos([
    e('ol', e('li', t('Enviar minuta.')), e('li', t('Agendar revisión.')))
  ])

  assert.equal(bloque.tipo, 'lista')
  assert.equal(bloque.ordenada, true)
  assert.equal(bloque.items.length, 2)
  assert.equal(textoDe(bloque.items[1]), 'Agendar revisión.')
})

test('la cita y el separador tienen bloque propio', () => {
  const bloques = bloquesDeNodos([e('blockquote', t('Falta el material.')), e('hr')])

  assert.deepEqual(bloques.map((b) => b.tipo), ['cita', 'separador'])
})

test('lo que no se reconoce sale como párrafo en vez de perderse', () => {
  const [bloque] = bloquesDeNodos([e('table', e('tr', e('td', t('Dato suelto'))))])

  assert.equal(bloque.tipo, 'parrafo')
  assert.equal(textoDe(bloque.texto), 'Dato suelto')
})

test('los nodos vacíos no dejan bloques fantasma', () => {
  assert.deepEqual(bloquesDeNodos([e('p'), t('   '), e('ul')]), [])
})

test('el espacio de sangría del HTML no llega al documento', () => {
  const [bloque] = bloquesDeNodos([e('p', t('\n  Con sangría del código  \n'))])

  assert.equal(textoDe(bloque.texto), 'Con sangría del código')
})
