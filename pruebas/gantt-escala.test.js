/**
 * Escala de tiempo, marcador de hoy y tareas vencidas del Gantt.
 *
 * Son los tres calculos que deciden si una barra se puede ubicar en el calendario. Un error aca no
 * se ve fallar: el diagrama sigue dibujandose, solo que diciendo otra fecha. Por eso se comprueban
 * los tramos exactos, los cambios de periodo y los bordes del rango.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANCHO_MARCA,
  anchoDeGantt,
  filasDeGantt,
  marcasDeGantt,
  posicionDeHoy,
  rangoDeGantt,
  zoomSugerido
} from '../src/componentes/proyecto/gantt.ts'

function tarea (id, name, start, end, status = 1) {
  return { id, name, start, end, progress: 0, status, color: null, dependencies: [] }
}

function diagrama (start, end, tareas) {
  return [{ id: 'milestone-0', nombre: 'Sin categorizar', grupo: true, start, end, tareas }]
}

/** Rango de un diagrama de una sola tarea, que es lo que la escala necesita. */
function rango (start, end) {
  return rangoDeGantt(diagrama(start, end, [tarea(1, 'A', start, end)]))
}

test('zoomSugerido abre cada duracion en la escala que se lee de un vistazo', () => {
  assert.equal(zoomSugerido(rango('2026-02-01', '2026-02-03')), 'dia')
  assert.equal(zoomSugerido(rango('2026-01-01', '2026-04-30')), 'semana')
  assert.equal(zoomSugerido(rango('2026-01-01', '2027-06-30')), 'mes')
  assert.equal(zoomSugerido(rango('2020-01-01', '2029-12-31')), 'anio')
})

test('en zoom Dia hay una columna por dia y el mes se nombra una sola vez', () => {
  const marcas = marcasDeGantt(rango('2026-01-30', '2026-02-02'), 'dia')

  assert.deepEqual(marcas.map((m) => m.unidad), ['30', '31', '1', '2'])
  assert.deepEqual(marcas.map((m) => m.periodo), ['ene 2026', null, 'feb 2026', null])
  // La linea fuerte marca el cambio de mes; la primera columna es el borde del diagrama, no un
  // limite de periodo.
  assert.deepEqual(marcas.map((m) => m.limite), [false, false, true, false])
})

test('en zoom Semana las columnas empiezan el lunes y la primera viene recortada al rango', () => {
  // El 2026-02-04 es miercoles: su semana abre el lunes 2.
  const marcas = marcasDeGantt(rango('2026-02-04', '2026-02-17'), 'semana')

  assert.deepEqual(marcas.map((m) => m.unidad), ['2', '9', '16'])
  assert.equal(marcas[0].izquierda, 0)
  // De los 14 dias del rango, la primera columna solo cubre del miercoles al domingo: 5.
  assert.equal(Math.round(marcas[0].ancho), Math.round((5 / 14) * 100))
})

test('en zoom Mes la fila de arriba nombra el año y la de abajo el mes', () => {
  const marcas = marcasDeGantt(rango('2025-11-15', '2026-02-10'), 'mes')

  assert.deepEqual(marcas.map((m) => m.unidad), ['nov', 'dic', 'ene', 'feb'])
  assert.deepEqual(marcas.map((m) => m.periodo), ['2025', null, '2026', null])
  assert.deepEqual(marcas.map((m) => m.limite), [false, false, true, false])
})

test('en zoom Año la unidad ya es el periodo, asi que la fila de arriba queda vacia', () => {
  const marcas = marcasDeGantt(rango('2024-06-01', '2026-03-01'), 'anio')

  assert.deepEqual(marcas.map((m) => m.unidad), ['2024', '2025', '2026'])
  assert.deepEqual(marcas.map((m) => m.periodo), [null, null, null])
  assert.deepEqual(marcas.map((m) => m.limite), [false, true, true])
})

test('un proyecto de un solo dia da una columna que ocupa todo el ancho', () => {
  const marcas = marcasDeGantt(rango('2026-02-04', '2026-02-04'), 'dia')

  assert.equal(marcas.length, 1)
  assert.equal(marcas[0].izquierda, 0)
  assert.equal(marcas[0].ancho, 100)
})

test('las columnas nunca se salen del rango ni dejan huecos', () => {
  for (const zoom of ['dia', 'semana', 'mes', 'anio']) {
    const marcas = marcasDeGantt(rango('2025-03-17', '2027-08-09'), zoom)
    const ultima = marcas[marcas.length - 1]

    assert.equal(marcas[0].izquierda, 0, zoom)
    assert.ok(Math.abs(ultima.izquierda + ultima.ancho - 100) < 0.0001, zoom)

    for (let i = 1; i < marcas.length; i += 1) {
      const anterior = marcas[i - 1]
      assert.ok(Math.abs(anterior.izquierda + anterior.ancho - marcas[i].izquierda) < 0.0001, zoom)
    }
  }
})

test('anchoDeGantt nunca deja el diagrama mas angosto que su caja', () => {
  assert.equal(anchoDeGantt(4, 'mes', 900), 900)
  assert.equal(anchoDeGantt(40, 'mes', 900), 40 * ANCHO_MARCA.mes)
})

test('posicionDeHoy apunta al medio del dia y devuelve null si hoy queda fuera', () => {
  const linea = rango('2026-02-01', '2026-02-10')

  assert.equal(posicionDeHoy(linea, '2026-02-01'), 5)
  assert.equal(posicionDeHoy(linea, '2026-02-10'), 95)
  assert.equal(posicionDeHoy(linea, '2026-01-31'), null)
  assert.equal(posicionDeHoy(linea, '2026-02-11'), null)
})

test('esta vencida la tarea cuya entrega ya paso y no esta completa', () => {
  const grupos = diagrama('2026-02-01', '2026-03-31', [
    tarea(1, 'Atrasada', '2026-02-01', '2026-02-10'),
    tarea(2, 'Entregada', '2026-02-01', '2026-02-10', 5),
    tarea(3, 'Por venir', '2026-03-01', '2026-03-10'),
    tarea(4, 'Sin fechas', null, null)
  ])
  const filas = filasDeGantt(grupos, rangoDeGantt(grupos), '2026-02-20')

  // La primera fila es la del grupo: un grupo nunca se marca vencido.
  assert.deepEqual(filas.map((f) => f.vencida), [false, true, false, false, false])
  assert.equal(filas[4].barra, null)
})
