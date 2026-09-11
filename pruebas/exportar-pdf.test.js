/**
 * Pruebas del PDF del Meeting Paper.
 *
 * Se prueba `contenidoDeBloques`, que es la parte pura: armar el documento entero necesita `fetch`
 * —el logotipo y las tipografías— y la descarga necesita un navegador, así que ninguna de las dos
 * corre en Node. Lo que sí se puede fijar acá es lo que hace reconocible al documento: que cada
 * bloque salga con los colores de su marca y con las marcas del texto puestas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contenidoDeBloques, COLORES } from '../src/dominio/exportar-pdf.ts'
import { TEMAS } from '../src/dominio/marcas-acta.ts'

/** Fragmento de texto sin marcas. */
const f = (texto) => [{ texto }]

test('el título de nivel 2 lleva la tinta de la marca y su filete debajo', () => {
  const [titulo, filete] = contenidoDeBloques([{ tipo: 'titulo', nivel: 2, texto: f('Acuerdos') }], TEMAS.mgc)

  assert.equal(titulo.color, COLORES.mgc.tinta)
  assert.equal(titulo.bold, true)
  assert.equal(titulo.text[0].text, 'Acuerdos')
  assert.equal(filete.canvas[0].lineColor, COLORES.mgc.filete)
  assert.equal(filete.canvas[0].type, 'line')
})

test('los títulos que no son de sección no arrastran filete', () => {
  const contenido = contenidoDeBloques([{ tipo: 'titulo', nivel: 3, texto: f('Detalle') }], TEMAS.wiwo)

  assert.equal(contenido.length, 1)
})

test('cada marca pinta el mismo acta con sus propios colores', () => {
  const bloque = [{ tipo: 'titulo', nivel: 2, texto: f('Acuerdos') }]
  const [tituloPalta] = contenidoDeBloques(bloque, TEMAS.palta)
  const [tituloWiwo] = contenidoDeBloques(bloque, TEMAS.wiwo)

  assert.equal(tituloPalta.color, '#141414')
  assert.equal(tituloWiwo.color, '#161715')
})

test('la lista ordenada sale numerada y la suelta con viñeta', () => {
  const items = [f('Enviar minuta.'), f('Agendar revisión.')]
  const [ordenada] = contenidoDeBloques([{ tipo: 'lista', ordenada: true, items }], TEMAS.wiwo)
  const [suelta] = contenidoDeBloques([{ tipo: 'lista', ordenada: false, items }], TEMAS.wiwo)

  assert.equal(ordenada.ol.length, 2)
  assert.equal(ordenada.ul, undefined)
  assert.equal(ordenada.ol[1].text[0].text, 'Agendar revisión.')
  assert.equal(ordenada.markerColor, COLORES.wiwo.tinta)

  assert.equal(suelta.ul.length, 2)
  assert.equal(suelta.ol, undefined)
  assert.equal(suelta.markerColor, COLORES.wiwo.acento)
})

test('las marcas del fragmento llegan al PDF', () => {
  const texto = [
    { texto: 'Se revisó el ' },
    { texto: 'calendario', negrita: true },
    { texto: ' completo', cursiva: true },
    { texto: ' y firmado', subrayado: true }
  ]
  const [parrafo] = contenidoDeBloques([{ tipo: 'parrafo', texto }], TEMAS.mgc)

  assert.equal(parrafo.text[0].bold, false)
  assert.equal(parrafo.text[1].bold, true)
  assert.equal(parrafo.text[1].color, COLORES.mgc.tinta)
  assert.equal(parrafo.text[2].italics, true)
  assert.equal(parrafo.text[3].decoration, 'underline')
})

test('la cita lleva barra de color y fondo suave', () => {
  const [cita] = contenidoDeBloques([{ tipo: 'cita', texto: f('Falta el material.') }], TEMAS.palta)

  assert.equal(cita.layout.fillColor(), COLORES.palta.citaFondo)
  assert.equal(cita.layout.vLineColor(), COLORES.palta.acento)
  assert.equal(cita.layout.vLineWidth(0), 3)
  assert.equal(cita.layout.vLineWidth(1), 0)
})

test('el separador es una línea del color de la marca', () => {
  const [separador] = contenidoDeBloques([{ tipo: 'separador' }], TEMAS.wiwo)

  assert.equal(separador.canvas[0].type, 'line')
  assert.equal(separador.canvas[0].lineColor, COLORES.wiwo.filete)
})

test('un acta vacía no revienta: devuelve un cuerpo sin elementos', () => {
  assert.deepEqual(contenidoDeBloques([], TEMAS.wiwo), [])
})
