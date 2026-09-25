/**
 * Pruebas de la Supervisión diaria: lo que el panel decide sin preguntarle a la API.
 *
 * Se prueba lo que se rompe en silencio: el "hoy" que en UTC ya es mañana, una fecha con forma
 * válida que no existe, el botón que al volver a pulsarse tiene que borrar, los totales después de
 * marcar, y a quién se le ofrece supervisar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alcanzaParaSupervisar,
  avisoDeFirma,
  conRevision,
  diasVecinos,
  enlaceDeHoja,
  esFechaDeHoja,
  fechaPedida,
  hoyEnSantiago,
  mensajeDeRechazo,
  puedeVerSupervision,
  siguienteEstado,
  sinRevisar,
  supervisorPedido,
  textoDeAtraso
} from '../src/dominio/supervision.ts'
import { rutaDeHoja, rutaDeRevisiones } from '../src/datos/supervision.ts'

/** Una hoja con dos Tareas de un cliente, sin revisar. */
function hoja () {
  return {
    fecha: '2026-09-25',
    puede_editar: true,
    supervisor: { staffid: 1, nombre: 'Ana Ríos', escalon: 'gerencia' },
    firma: null,
    totales: { tareas: 2, atrasadas: 1, revisadas: 0, ok: 0, no_ok: 0 },
    clientes: [{
      client_id: 1,
      company: 'Acme',
      tareas: [10, 11].map((id) => ({
        id, patente: null, name: `T${id}`, status: 1, duedate: '2026-09-24', dias_atraso: 1,
        proyecto: null, asignados: [], revision: null
      }))
    }]
  }
}

const revision = (estado) => ({ estado, nota: null, staffid: 1, nombre: 'Ana Ríos', marcado_en: '2026-09-25T12:00:00Z' })

test('hoy es el de Santiago, no el de UTC', () => {
  // 02:00 UTC del 26 son las 23:00 del 25 en Santiago (UTC-3 en septiembre).
  assert.equal(hoyEnSantiago(new Date('2026-09-26T02:00:00Z')), '2026-09-25')
  assert.equal(hoyEnSantiago(new Date('2026-09-26T12:00:00Z')), '2026-09-26')
})

test('la fecha de la URL: válida o cae a hoy', () => {
  assert.equal(esFechaDeHoja('2026-02-28'), true)
  assert.equal(esFechaDeHoja('2026-02-31'), false)
  assert.equal(esFechaDeHoja('25/09/2026'), false)
  assert.equal(esFechaDeHoja(undefined), false)
  assert.equal(fechaPedida('2026-09-01', '2026-09-25'), '2026-09-01')
  assert.equal(fechaPedida(['2026-09-01'], '2026-09-25'), '2026-09-25')
  assert.equal(fechaPedida('mañana', '2026-09-25'), '2026-09-25')
})

test('el supervisor de la URL', () => {
  assert.equal(supervisorPedido('4'), 4)
  assert.equal(supervisorPedido('0'), null)
  assert.equal(supervisorPedido('-4'), null)
  assert.equal(supervisorPedido(undefined), null)
})

test('enlaces y días vecinos, cruzando el mes', () => {
  assert.deepEqual(diasVecinos('2026-10-01'), { anterior: '2026-09-30', siguiente: '2026-10-02' })
  assert.equal(enlaceDeHoja('2026-09-25', null), '/supervision?fecha=2026-09-25')
  assert.equal(enlaceDeHoja('2026-09-25', 4), '/supervision?fecha=2026-09-25&staff_id=4')
  assert.equal(rutaDeHoja(null, null), 'supervision/hoja')
  assert.equal(rutaDeHoja('2026-09-25', 4), 'supervision/hoja?fecha=2026-09-25&staff_id=4')
  assert.equal(rutaDeRevisiones('2026-09-25'), 'supervision/hoja/2026-09-25/revisiones')
})

test('volver a pulsar el estado marcado lo borra', () => {
  assert.equal(siguienteEstado(null, 'ok'), 'ok')
  assert.equal(siguienteEstado('ok', 'ok'), null)
  assert.equal(siguienteEstado('ok', 'no_ok'), 'no_ok')
  assert.equal(siguienteEstado('no_ok', 'no_ok'), null)
})

test('los totales siguen a las marcas, y la hoja original no se toca', () => {
  const original = hoja()
  const marcada = conRevision(conRevision(original, 10, revision('ok')), 11, revision('no_ok'))

  assert.deepEqual(marcada.totales, { tareas: 2, atrasadas: 1, revisadas: 2, ok: 1, no_ok: 1 })
  assert.equal(original.clientes[0].tareas[0].revision, null)

  const borrada = conRevision(marcada, 10, null)

  assert.deepEqual(borrada.totales, { tareas: 2, atrasadas: 1, revisadas: 1, ok: 0, no_ok: 1 })
  assert.equal(sinRevisar(borrada.totales), 1)
})

test('el aviso de firma cuenta las pendientes', () => {
  assert.match(avisoDeFirma({ tareas: 3, atrasadas: 0, revisadas: 1, ok: 1, no_ok: 0 }), /^Quedan 2 tareas sin revisar/)
  assert.match(avisoDeFirma({ tareas: 3, atrasadas: 0, revisadas: 2, ok: 2, no_ok: 0 }), /^Queda 1 tarea sin revisar/)
  assert.match(avisoDeFirma({ tareas: 3, atrasadas: 0, revisadas: 3, ok: 3, no_ok: 0 }), /^Revisaste las 3 tareas/)
})

test('el atraso en palabras', () => {
  assert.equal(textoDeAtraso(0), 'Vence hoy')
  assert.equal(textoDeAtraso(1), '1 día de atraso')
  assert.equal(textoDeAtraso(12), '12 días de atraso')
})

test('supervisa de lead hacia arriba; la administración ve la sección igual', () => {
  assert.equal(alcanzaParaSupervisar('staff'), false)
  assert.equal(alcanzaParaSupervisar('lead'), true)
  assert.equal(alcanzaParaSupervisar('gerencia'), true)
  assert.equal(alcanzaParaSupervisar('inventado'), false)
  assert.equal(alcanzaParaSupervisar(undefined), false)
  assert.equal(puedeVerSupervision({ escalon: 'staff', is_admin: false, is_superadmin: false }), false)
  assert.equal(puedeVerSupervision({ escalon: 'staff', is_admin: true, is_superadmin: false }), true)
  assert.equal(puedeVerSupervision({ escalon: 'director', is_admin: false, is_superadmin: false }), true)
})

test('el 422 se explica en palabras; lo demás pasa tal cual', () => {
  assert.match(mensajeDeRechazo('crudo', 422, { staff_ids: ['invalid'] }), /Lead, Director o Gerencia/)
  assert.match(mensajeDeRechazo('crudo', 422, { client_ids: ['unknown'] }), /ya no existe/)
  assert.match(mensajeDeRechazo('crudo', 422, { staff_id: ['escalon'] }), /Lead o superior/)
  assert.match(mensajeDeRechazo('crudo', 403, undefined), /No tienes permiso/)
  assert.equal(mensajeDeRechazo('crudo', 500, undefined), 'crudo')
  assert.equal(mensajeDeRechazo('crudo', 422, { otro: ['x'] }), 'crudo')
})
