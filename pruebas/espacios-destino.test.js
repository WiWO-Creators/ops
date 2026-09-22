/**
 * Pruebas del catalogo de destinos del alta de Tarea.
 *
 * Lo que se cuida: que una Licitacion se pueda distinguir de un Proyecto en el selector —crear la
 * tarea en la licitacion equivocada obliga a borrarla— y que el mismo Espacio no se ofrezca dos
 * veces cuando aparece en los dos listados, que es lo que pasa con una licitacion ganada.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combinarDestinos, nombreDeLicitacion } from '../src/dominio/espacios-destino.ts'

const PROYECTOS = [
  { id: 1, name: 'Colbún — Grilla septiembre' },
  { id: 2, name: 'Portal de autogestión' }
]

/** Una licitacion como llega de `GET /licitaciones`, con lo justo que mira el catalogo. */
function licitacion (id, company, nombre) {
  return { id, company, espacio: { id, name: nombre, status: 2, start_date: null, deadline: null } }
}

test('las licitaciones se suman despues de los proyectos y quedan marcadas', () => {
  const { espacios, licitaciones } = combinarDestinos(
    PROYECTOS,
    [licitacion(101, 'Metro', 'Señalética 2027')]
  )

  assert.deepEqual(espacios.map((e) => e.id), [1, 2, 101])
  assert.equal(espacios[2].name, 'Metro — Señalética 2027')
  assert.deepEqual([...licitaciones], [101])
})

test('sin licitaciones el catalogo es el de siempre', () => {
  const { espacios, licitaciones } = combinarDestinos(PROYECTOS, [])

  assert.deepEqual(espacios, PROYECTOS)
  assert.equal(licitaciones.size, 0)
})

test('un espacio que ya vino como proyecto no se duplica ni se marca', () => {
  const { espacios, licitaciones } = combinarDestinos(
    PROYECTOS,
    [licitacion(2, 'Otra empresa', 'Portal de autogestión')]
  )

  assert.deepEqual(espacios.map((e) => e.id), [1, 2])
  assert.equal(espacios[1].name, 'Portal de autogestión')
  assert.equal(licitaciones.size, 0)
})

test('la empresa va delante del nombre del espacio', () => {
  assert.equal(
    nombreDeLicitacion(licitacion(1, 'Colbún', 'Mantención 2027')),
    'Colbún — Mantención 2027'
  )
})

test('no se repite la empresa cuando el nombre ya empieza por ella', () => {
  assert.equal(
    nombreDeLicitacion(licitacion(1, 'Colbún', 'Colbún: mantención 2027')),
    'Colbún: mantención 2027'
  )
  assert.equal(
    nombreDeLicitacion(licitacion(1, 'COLBÚN', 'colbún mantención')),
    'colbún mantención'
  )
})

test('una licitacion sin empresa se lee por el nombre de su espacio', () => {
  assert.equal(nombreDeLicitacion(licitacion(1, '   ', 'Señalética 2027')), 'Señalética 2027')
})

test('sin nombre de espacio queda la empresa, nunca un guion suelto', () => {
  assert.equal(nombreDeLicitacion(licitacion(1, 'Metro', '  ')), 'Metro')
})
