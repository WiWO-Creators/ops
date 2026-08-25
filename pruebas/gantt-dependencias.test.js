/**
 * Flechas de dependencia del Gantt.
 *
 * Lo que se prueba es lo que no se ve fallar: una flecha mal trazada sigue siendo una linea en la
 * pantalla. Por eso se comprueban las coordenadas exactas de las dos puntas, los tres casos en que
 * una dependencia **no** se dibuja, y que el retorno pase por el hueco entre filas y no por encima
 * de las barras.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PASO_FILA,
  altoDeGantt,
  describirDependencias,
  filasDeGantt,
  flechasDeGantt,
  rangoDeGantt
} from '../src/componentes/proyecto/gantt.ts'

/** 20 dias de linea de tiempo; con `ANCHO` px, cada dia mide 100 px justos. */
const ANCHO = 2000

function tarea (id, name, start, end, dependencies = []) {
  return { id, name, start, end, progress: 0, status: 1, color: null, dependencies }
}

/** Dia de referencia de las pruebas. Ninguna tarea de estos diagramas esta vencida contra el. */
const HOY = '2026-01-01'

/** Aplana un diagrama con el rango que le corresponde. */
function filas (grupos) {
  return filasDeGantt(grupos, rangoDeGantt(grupos), HOY)
}

function diagrama (tareas) {
  return [{
    id: 'milestone-0',
    nombre: 'Sin categorizar',
    grupo: true,
    start: '2026-02-01',
    end: '2026-02-20',
    tareas
  }]
}

/** Centro vertical de la fila, que es por donde entran y salen las flechas. */
function centro (indice) {
  return indice * PASO_FILA + PASO_FILA / 2
}

const A = tarea(1, 'A', '2026-02-01', '2026-02-05')
const B = tarea(2, 'B', '2026-02-11', '2026-02-15', [{ depends_on: 1, type: 'blocking' }])

test('filasDeGantt aplana el grupo y sus tareas en el orden de pintado', () => {
  const grupos = diagrama([A, B])
  const aplanadas = filas(grupos)

  assert.deepEqual(aplanadas.map((f) => f.titulo), ['Sin categorizar', 'A', 'B'])
  assert.deepEqual(aplanadas.map((f) => f.esGrupo), [true, false, false])
  assert.deepEqual(aplanadas.map((f) => f.tareaId), [null, 1, 2])
})

test('altoDeGantt cubre la banda completa de cada fila', () => {
  assert.equal(altoDeGantt(3), 3 * PASO_FILA)
  assert.equal(altoDeGantt(0), 0)
})

test('la flecha sale del borde derecho del origen y apunta al borde izquierdo del destino', () => {
  const grupos = diagrama([A, B])
  const flechas = flechasDeGantt(filas(grupos), ANCHO)

  assert.equal(flechas.length, 1)
  // A ocupa los dias 1 a 5 de 20: su borde derecho cae en el 25% de 2000 px.
  assert.ok(flechas[0].d.startsWith(`M 500 ${centro(1)}`), flechas[0].d)
  // B empieza el dia 11: su borde izquierdo cae en el 50%.
  assert.ok(flechas[0].punta.startsWith(`M 1000 ${centro(2)}`), flechas[0].punta)
})

test('sin ancho medido todavia no se traza ninguna flecha', () => {
  const grupos = diagrama([A, B])

  assert.deepEqual(flechasDeGantt(filas(grupos), 0), [])
})

test('una tarea con dos dependencias recibe dos flechas', () => {
  const grupos = diagrama([
    A,
    tarea(2, 'B', '2026-02-06', '2026-02-08'),
    tarea(3, 'C', '2026-02-11', '2026-02-15', [{ depends_on: 1, type: null }, { depends_on: 2, type: null }])
  ])
  const flechas = flechasDeGantt(filas(grupos), ANCHO)

  assert.deepEqual(flechas.map((f) => f.clave), ['1-3', '2-3'])
})

test('dos flechas al mismo destino doblan en x distintas y no se pisan', () => {
  const grupos = diagrama([
    A,
    tarea(2, 'B', '2026-02-06', '2026-02-08'),
    tarea(3, 'C', '2026-02-11', '2026-02-15', [{ depends_on: 1, type: null }, { depends_on: 2, type: null }])
  ])
  const flechas = flechasDeGantt(filas(grupos), ANCHO)

  // El tramo vertical es el segundo par de coordenadas del trazo; si coincidiera, las dos flechas se
  // dibujarian una encima de la otra y se verian como una sola.
  const quiebres = flechas.map((f) => f.d.split(' ')[4])

  assert.equal(flechas.length, 2)
  assert.notEqual(quiebres[0], quiebres[1])
})

test('no se dibuja la flecha si la tarea de la que se depende no esta en el diagrama', () => {
  const grupos = diagrama([tarea(2, 'B', '2026-02-11', '2026-02-15', [{ depends_on: 999, type: null }])])
  const flechas = flechasDeGantt(filas(grupos), ANCHO)

  assert.deepEqual(flechas, [])
})

test('no se dibuja la flecha si la tarea de la que se depende no tiene fechas', () => {
  const grupos = diagrama([tarea(1, 'A', null, null), B])
  const flechas = flechasDeGantt(filas(grupos), ANCHO)

  assert.deepEqual(flechas, [])
})

test('una tarea repetida en dos grupos se conecta una sola vez', () => {
  const grupos = [
    { id: 'member-1', nombre: 'Ana', grupo: true, start: '2026-02-01', end: '2026-02-20', tareas: [A, B] },
    { id: 'member-2', nombre: 'Beto', grupo: true, start: '2026-02-01', end: '2026-02-20', tareas: [A, B] }
  ]
  const flechas = flechasDeGantt(filas(grupos), ANCHO)

  assert.deepEqual(flechas.map((f) => f.clave), ['1-2'])
})

test('cuando el destino empieza antes de que termine el origen, el retorno pasa por el hueco entre filas', () => {
  const grupos = diagrama([
    tarea(1, 'A', '2026-02-11', '2026-02-15'),
    tarea(2, 'B', '2026-02-01', '2026-02-05', [{ depends_on: 1, type: null }])
  ])
  const flechas = flechasDeGantt(filas(grupos), ANCHO)
  // El destino esta en la fila 2: su hueco por el lado del origen es el que tiene encima.
  const hueco = 2 * PASO_FILA

  assert.equal(flechas.length, 1)
  assert.ok(flechas[0].d.includes(` ${hueco}`), flechas[0].d)
  assert.ok(flechas[0].punta.startsWith(`M 0 ${centro(2)}`), flechas[0].punta)
})

test('describirDependencias nombra las dos tareas, y dice cuando la otra punta no se puede dibujar', () => {
  const grupos = diagrama([
    tarea(1, 'A', null, null),
    tarea(2, 'B', '2026-02-11', '2026-02-15', [{ depends_on: 1, type: null }, { depends_on: 999, type: null }]),
    tarea(3, 'C', '2026-02-16', '2026-02-18', [{ depends_on: 2, type: null }])
  ])

  assert.deepEqual(describirDependencias(filas(grupos)), [
    'B empieza después de A, que no tiene fechas.',
    'B depende de otra tarea que no está en este diagrama.',
    'C empieza después de B.'
  ])
})
