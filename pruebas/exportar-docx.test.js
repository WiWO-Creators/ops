/**
 * Pruebas del paso de bloques a párrafos de Word, que es lo que produce el .docx del Meeting Paper.
 *
 * Se prueba `parrafosDeBloques`, la parte pura: la descarga del logotipo necesita `fetch` sobre una
 * ruta del sitio y la entrega del archivo necesita el DOM, así que `descargarDocx` no corre en Node.
 *
 * Las aserciones miran el árbol OOXML que `docx` construye —cada nodo es `{ rootKey, root }`, con
 * los atributos en un hijo `_attr`—, que es exactamente lo que termina escrito dentro del archivo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTILO_DOCX, REFERENCIA_ORDENADA, REFERENCIA_VINETA, parrafosDeBloques } from '../src/dominio/exportar-docx.ts'
import { TEMAS } from '../src/dominio/marcas-acta.ts'

/** Todos los elementos con esa etiqueta OOXML dentro de un nodo, a cualquier profundidad. */
const buscar = (nodo, etiqueta) => {
  const encontrados = []

  const visitar = (actual) => {
    if (actual === null || typeof actual !== 'object') return

    if (Array.isArray(actual)) {
      actual.forEach(visitar)
      return
    }

    if (actual.rootKey === etiqueta) encontrados.push(actual)

    visitar(actual.root)
  }

  visitar(nodo)

  return encontrados
}

/** Los atributos de un elemento: `docx` los guarda en un hijo `_attr`. */
const atributos = (nodo) => {
  const attr = nodo.root.find((hijo) => hijo !== null && typeof hijo === 'object' && hijo.rootKey === '_attr')

  return attr === undefined ? {} : attr.root
}

/** Un fragmento de texto sin marcas. */
const f = (texto, marcas = {}) => ({ texto, ...marcas })

test('el título de nivel 2 lleva el filete del color de su marca', () => {
  const [mgc] = parrafosDeBloques([{ tipo: 'titulo', nivel: 2, texto: [f('Acuerdos')] }], TEMAS.mgc)
  const [borde] = buscar(buscar(mgc, 'w:pBdr')[0], 'w:bottom')

  assert.equal(atributos(borde).color.value, ESTILO_DOCX.mgc.filete)
  assert.equal(atributos(borde).color.value, 'F9063B')
  assert.equal(atributos(borde).style.value, 'single')

  // Y el color es el de la marca, no uno fijo: el mismo título de WiWO sale verde.
  const [wiwo] = parrafosDeBloques([{ tipo: 'titulo', nivel: 2, texto: [f('Acuerdos')] }], TEMAS.wiwo)

  assert.equal(atributos(buscar(buscar(wiwo, 'w:pBdr')[0], 'w:bottom')[0]).color.value, '3BFF00')
})

test('los otros niveles de título no llevan filete', () => {
  const parrafos = parrafosDeBloques([
    { tipo: 'titulo', nivel: 1, texto: [f('Kickoff')] },
    { tipo: 'titulo', nivel: 3, texto: [f('Detalle')] }
  ], TEMAS.wiwo)

  assert.deepEqual(parrafos.map((p) => buscar(p, 'w:pBdr').length), [0, 0])
})

test('una lista ordenada produce numeración y una con viñeta apunta a la otra', () => {
  const [ordenado] = parrafosDeBloques(
    [{ tipo: 'lista', ordenada: true, items: [[f('Enviar minuta.')]] }],
    TEMAS.palta
  )
  const [vineta] = parrafosDeBloques(
    [{ tipo: 'lista', ordenada: false, items: [[f('Enviar minuta.')]] }],
    TEMAS.palta
  )

  assert.equal(buscar(ordenado, 'w:numPr').length, 1)
  assert.deepEqual(ordenado.root[0].numberingReferences, [{ reference: REFERENCIA_ORDENADA, instance: 1 }])
  assert.deepEqual(vineta.root[0].numberingReferences, [{ reference: REFERENCIA_VINETA, instance: 0 }])
})

test('dos listas ordenadas no continúan la cuenta de la anterior', () => {
  const parrafos = parrafosDeBloques([
    { tipo: 'lista', ordenada: true, items: [[f('Uno')]] },
    { tipo: 'parrafo', texto: [f('Entremedio.')] },
    { tipo: 'lista', ordenada: true, items: [[f('Uno de nuevo')]] }
  ], TEMAS.wiwo)

  assert.equal(parrafos[0].root[0].numberingReferences[0].instance, 1)
  assert.equal(parrafos[2].root[0].numberingReferences[0].instance, 2)
})

test('la negrita de un fragmento llega al run y sube al color de tinta', () => {
  const [parrafo] = parrafosDeBloques([{
    tipo: 'parrafo',
    texto: [f('Se revisó el '), f('calendario', { negrita: true }), f(' completo.')]
  }], TEMAS.mgc)

  const runs = buscar(parrafo, 'w:r')

  assert.equal(runs.length, 3)
  assert.equal(buscar(runs[0], 'w:b').length, 0)
  assert.equal(buscar(runs[1], 'w:b').length, 1)
  assert.equal(atributos(buscar(runs[1], 'w:color')[0]).val, ESTILO_DOCX.mgc.tinta)
  assert.equal(atributos(buscar(runs[2], 'w:color')[0]).val, ESTILO_DOCX.mgc.texto)
})

test('la cursiva y el subrayado también llegan al run', () => {
  const [parrafo] = parrafosDeBloques([{
    tipo: 'parrafo',
    texto: [f('urgente', { cursiva: true, subrayado: true })]
  }], TEMAS.wiwo)

  assert.equal(buscar(parrafo, 'w:i').length, 1)
  assert.equal(atributos(buscar(parrafo, 'w:u')[0]).val.value, 'single')
})

test('la cita lleva borde de acento y fondo suave, y el separador es una línea', () => {
  const [cita, separador] = parrafosDeBloques([
    { tipo: 'cita', texto: [f('Falta el material.')] },
    { tipo: 'separador' }
  ], TEMAS.palta)

  assert.equal(atributos(buscar(buscar(cita, 'w:pBdr')[0], 'w:left')[0]).color.value, ESTILO_DOCX.palta.acento)
  assert.equal(atributos(buscar(cita, 'w:shd')[0]).fill.value, ESTILO_DOCX.palta.citaFondo)

  assert.equal(atributos(buscar(buscar(separador, 'w:pBdr')[0], 'w:bottom')[0]).color.value, ESTILO_DOCX.palta.filete)
  assert.equal(buscar(separador, 'w:r').length, 0)
})

test('cada marca pide su tipografía por nombre', () => {
  const bloque = [{ tipo: 'parrafo', texto: [f('Hola')] }]

  for (const tema of Object.values(TEMAS)) {
    const [parrafo] = parrafosDeBloques(bloque, tema)

    assert.equal(atributos(buscar(parrafo, 'w:rFonts')[0]).ascii.value, ESTILO_DOCX[tema.codigo].fuente)
  }
})

test('un acta vacía no produce párrafos ni revienta', () => {
  assert.deepEqual(parrafosDeBloques([], TEMAS.wiwo), [])
  assert.equal(parrafosDeBloques([{ tipo: 'parrafo', texto: [] }], TEMAS.wiwo).length, 1)
  assert.equal(parrafosDeBloques([{ tipo: 'lista', ordenada: true, items: [] }], TEMAS.wiwo).length, 0)
})
