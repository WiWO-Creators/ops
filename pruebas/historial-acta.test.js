/**
 * Pruebas del historial de cambios del Meeting Paper: rótulos de origen, filtro, conteos, resumen y
 * la compactación de la comparación. Todo es lógica pura; el panel que lo dibuja necesita navegador.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTROS_DE_HISTORIAL,
  accionDeRevision,
  agruparEnTramos,
  compactarDiferencias,
  contarPorFiltro,
  diferenciaDeVersiones,
  esOrigenDelAsistente,
  etiquetaDeOrigen,
  filtrarRevisiones,
  resumirDiferencias,
  textoDeResumen
} from '../src/dominio/historial-acta.ts'

/** Una entrada de la lista con valores por defecto. */
function entrada (id, origin, extra = {}) {
  return {
    id,
    kind: 'change',
    origin,
    staff_id: 1,
    staff_name: 'Ana Pérez',
    staff_image: null,
    summary: null,
    preview: null,
    date_added: '2026-10-15 10:00:00',
    ...extra
  }
}

const LISTA = [
  entrada(5, 'orb'),
  entrada(4, 'manual'),
  entrada(3, 'ia'),
  entrada(2, 'colaborativo'),
  entrada(1, 'restauracion'),
  entrada(0, 'ia', { kind: 'created' })
]

test('etiquetaDeOrigen: nombra cada origen y no inventa uno desconocido', () => {
  assert.equal(etiquetaDeOrigen('orb'), 'Thinking Orb')
  assert.equal(etiquetaDeOrigen('ia'), 'IA')
  assert.equal(etiquetaDeOrigen('manual'), 'Manual')
  assert.equal(etiquetaDeOrigen('restauracion'), 'Restauración')
  assert.equal(etiquetaDeOrigen('colaborativo'), 'Edición conjunta')
  assert.equal(etiquetaDeOrigen('otro'), 'Cambio')
  assert.equal(etiquetaDeOrigen('toString'), 'Cambio')
  assert.equal(etiquetaDeOrigen(''), 'Cambio')
})

test('esOrigenDelAsistente: solo orb e ia', () => {
  assert.equal(esOrigenDelAsistente('orb'), true)
  assert.equal(esOrigenDelAsistente('ia'), true)
  for (const origen of ['manual', 'colaborativo', 'restauracion', 'x']) assert.equal(esOrigenDelAsistente(origen), false)
})

test('los filtros son tres y el primero es Todos', () => {
  assert.deepEqual(FILTROS_DE_HISTORIAL.map((f) => f.id), ['todos', 'asistente', 'colaboradores'])
  assert.equal(FILTROS_DE_HISTORIAL[1].etiqueta, 'Thinking Orb e IA')
})

test('filtrarRevisiones: Todos no quita nada y conserva el orden', () => {
  assert.deepEqual(filtrarRevisiones(LISTA, 'todos').map((r) => r.id), [5, 4, 3, 2, 1, 0])
})

test('filtrarRevisiones: el asistente deja orb e ia, y la creación siempre queda al final', () => {
  assert.deepEqual(filtrarRevisiones(LISTA, 'asistente').map((r) => r.id), [5, 3, 0])
})

test('filtrarRevisiones: colaboradores deja manual, edición conjunta y restauración', () => {
  assert.deepEqual(filtrarRevisiones(LISTA, 'colaboradores').map((r) => r.id), [4, 2, 1, 0])
})

test('filtrarRevisiones: no muta la lista y tolera una lista vacía', () => {
  const copia = [...LISTA]

  filtrarRevisiones(LISTA, 'asistente')
  assert.deepEqual(LISTA, copia)
  assert.deepEqual(filtrarRevisiones([], 'asistente'), [])
})

test('contarPorFiltro: cuenta cambios sin la creación', () => {
  assert.deepEqual(contarPorFiltro(LISTA), { todos: 5, asistente: 2, colaboradores: 3 })
  assert.deepEqual(contarPorFiltro([entrada(0, 'ia', { kind: 'created' })]), { todos: 0, asistente: 0, colaboradores: 0 })
})

test('accionDeRevision: distingue creación, restauración y cambio', () => {
  assert.equal(accionDeRevision({ kind: 'created', origin: 'ia' }), 'Creó el Meeting Paper')
  assert.equal(accionDeRevision({ kind: 'change', origin: 'restauracion' }), 'Restauró una versión del Meeting Paper')
  assert.equal(accionDeRevision({ kind: 'change', origin: 'orb' }), 'Cambió el Meeting Paper')
})

const ANTES = '<h1>Acta</h1><p>Uno</p><p>Dos</p><p>Tres</p><p>Cuatro</p><p>Cinco</p><p>Seis</p><ul><li>a</li><li>b</li></ul>'
const DESPUES = '<h1>Acta</h1><p>Uno</p><p>Dos</p><p>Tres</p><p>Cuatro</p><p>Cinco nuevo</p><p>Seis</p><ul><li>a</li><li>b</li><li>c</li></ul>'

test('diferenciaDeVersiones y resumirDiferencias: cuentan agregados, eliminados y corregidos', () => {
  const cambios = diferenciaDeVersiones(ANTES, DESPUES)

  assert.deepEqual(resumirDiferencias(cambios), { agregados: 1, eliminados: 0, modificados: 1 })
  assert.deepEqual(resumirDiferencias(diferenciaDeVersiones('<p>x</p><p>y</p>', '<p>x</p>')), { agregados: 0, eliminados: 1, modificados: 0 })
})

test('textoDeResumen: pluraliza y avisa cuando no hay cambios de texto', () => {
  assert.equal(textoDeResumen({ agregados: 1, eliminados: 0, modificados: 2 }), '1 agregado · 2 corregidos')
  assert.equal(textoDeResumen({ agregados: 3, eliminados: 1, modificados: 0 }), '3 agregados · 1 eliminado')
  assert.equal(textoDeResumen({ agregados: 0, eliminados: 0, modificados: 0 }), 'Sin cambios de texto')
})

test('diferenciaDeVersiones: HTML vacío o roto no lanza', () => {
  assert.deepEqual(diferenciaDeVersiones('', ''), [])
  assert.equal(diferenciaDeVersiones('', '<p>nuevo</p>')[0].tipo, 'insertado')
  assert.doesNotThrow(() => diferenciaDeVersiones('<p>sin cerrar', '<<<>'))
})

test('compactarDiferencias: pliega los tramos largos sin cambios y deja un bloque de contexto', () => {
  const cambios = diferenciaDeVersiones(ANTES, DESPUES)
  const items = compactarDiferencias(cambios)
  const plegados = items.filter((i) => i.tipo === 'plegado')

  assert.equal(plegados.length, 1)
  // Antes del cambio hay 5 unidades iguales (h1 y cuatro párrafos). Al inicio no hay contexto previo y
  // junto al cambio se deja 1: se pliegan 4.
  assert.equal(plegados[0].cantidad, 4)
  assert.equal(plegados[0].desde, 0)
  assert.equal(items.filter((i) => i.tipo === 'unidad').length, cambios.length - 4)
})

test('compactarDiferencias: un tramo abierto se muestra entero', () => {
  const cambios = diferenciaDeVersiones(ANTES, DESPUES)
  const items = compactarDiferencias(cambios, new Set([0]))

  assert.equal(items.filter((i) => i.tipo === 'plegado').length, 0)
  assert.equal(items.length, cambios.length)
})

test('compactarDiferencias: no pliega un solo bloque ni un documento corto', () => {
  const cambios = diferenciaDeVersiones('<p>a</p><p>b</p><p>c</p>', '<p>a</p><p>b</p><p>c nuevo</p>')

  assert.equal(compactarDiferencias(cambios).some((i) => i.tipo === 'plegado'), false)
})

test('compactarDiferencias: sin cambios pliega todo el documento largo', () => {
  const html = '<p>a</p><p>b</p><p>c</p><p>d</p>'
  const items = compactarDiferencias(diferenciaDeVersiones(html, html))

  assert.deepEqual(items, [{ tipo: 'plegado', desde: 0, cantidad: 4 }])
  assert.deepEqual(compactarDiferencias([]), [])
})

test('agruparEnTramos: junta los puntos seguidos de una lista y respeta el tipo de lista', () => {
  const cambios = diferenciaDeVersiones('<p>x</p><ul><li>a</li></ul><ol><li>1</li></ol>', '<p>x</p><ul><li>a</li><li>b</li></ul><ol><li>1</li></ol>')
  const tramos = agruparEnTramos(cambios.map((cambio) => ({ tipo: 'unidad', cambio })))

  assert.deepEqual(tramos.map((t) => t.tipo), ['suelto', 'lista', 'lista'])
  assert.equal(tramos[1].lista, 'ul')
  assert.equal(tramos[1].cambios.length, 2)
  assert.equal(tramos[2].lista, 'ol')
})

test('agruparEnTramos: un tramo plegado corta la lista', () => {
  const cambios = diferenciaDeVersiones('<ul><li>a</li></ul>', '<ul><li>b</li></ul>')
  const tramos = agruparEnTramos([
    { tipo: 'unidad', cambio: cambios[0] },
    { tipo: 'plegado', desde: 1, cantidad: 3 },
    { tipo: 'unidad', cambio: cambios[0] }
  ])

  assert.deepEqual(tramos.map((t) => t.tipo), ['lista', 'plegado', 'lista'])
})
