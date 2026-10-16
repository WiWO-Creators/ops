/**
 * Pruebas del enrutado de eventos del board a salas del bus.
 *
 * Lo que se protege: que cada audiencia reciba solo lo que le toca y, sobre todo, que la sala de un
 * cliente y la de pantallas nunca reciban un id ni un espacio.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTRANGULACION_DE_PANTALLAS_MS, salasDe } from '../servicios/en-vivo/enrutador.ts'

function evento (audiencia, resto = {}) {
  return {
    tipo: 'tarea',
    id: 12,
    espacio_id: 3,
    audiencia: { staff: [], equipo: false, espacio: false, cliente: null, pantallas: false, ...audiencia },
    ...resto
  }
}

const COMPLETO = { t: 'cambio', tipo: 'tarea', id: 12, espacio_id: 3 }

test('staff, equipo y espacio reciben el cambio completo', () => {
  const destinos = salasDe(evento({ staff: [7, 9], equipo: true, espacio: true }))

  assert.deepEqual(destinos.map((d) => d.sala), ['staff:7', 'staff:9', 'equipo', 'espacio:3'])
  for (const destino of destinos) assert.deepEqual(destino.mensaje, COMPLETO)
})

test('la sala de un cliente recibe el cambio SIN id ni espacio', () => {
  const [destino] = salasDe(evento({ cliente: 5 }))

  assert.equal(destino.sala, 'cliente:5')
  assert.deepEqual(destino.mensaje, { t: 'cambio', tipo: 'tarea', id: null, espacio_id: null })
})

test('la sala de pantallas recibe un cambio genérico sin id, con estrangulación de 5 s', () => {
  const [destino] = salasDe(evento({ pantallas: true }))

  assert.equal(destino.sala, 'pantallas')
  assert.deepEqual(destino.mensaje, { t: 'cambio', tipo: 'pantalla', id: null, espacio_id: null })
  assert.equal(destino.estrangularMs, 5000)
  assert.equal(ESTRANGULACION_DE_PANTALLAS_MS, 5000)
})

test('audiencia de espacio sin espacio_id no produce sala', () => {
  assert.deepEqual(salasDe(evento({ espacio: true }, { espacio_id: null })), [])
})

test('sin audiencia no hay destinos y las salas repetidas se funden', () => {
  assert.deepEqual(salasDe(evento({})), [])
  assert.deepEqual(salasDe(evento({ staff: [7, 7] })).map((d) => d.sala), ['staff:7'])
})

test('el tipo y el id del evento viajan tal cual hacia el equipo', () => {
  const [destino] = salasDe(evento({ equipo: true }, { tipo: 'presencia', id: 4, espacio_id: null }))

  assert.deepEqual(destino.mensaje, { t: 'cambio', tipo: 'presencia', id: 4, espacio_id: null })
})
