/**
 * Pruebas del modal de ticket de un solo dibujo: la fuente, la traduccion de los dos contratos y la
 * regla de respuesta.
 *
 *  1. Las dos fuentes declaran **las mismas claves** y las del portal van por `portal/`: si no, el
 *     modal tendria que preguntar por el sujeto o el BFF mandaria la sesion equivocada.
 *  2. Las dos fichas terminan en **la misma forma**, con el mensaje de apertura primero en el hilo.
 *  3. La regla de respuesta del portal **la manda la API**; la local solo cubre un backend sin T2.
 *  4. El enlace del equipo es el mismo que arman el correo y la campana (T3).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoSinRespuesta,
  cuerpoDeRespuesta,
  enlaceDelEquipoAlTicket,
  reglaDeRespuestaLocal,
  rutaDeTicket,
  TICKET_DEL_PANEL,
  TICKET_DEL_PORTAL,
  ticketDelPanel,
  ticketDelPortal,
  vistaDelTicket
} from '../src/dominio/ticket-vista.ts'

const fichaDelPanel = {
  id: 7,
  subject: 'No carga el logo',
  status: 1,
  priority: 3,
  department: null,
  assigned: null,
  solicitante: { tipo: 'contacto', contact: { id: 1, full_name: 'Renata Ferreyra', email: 'r@x.cl' }, client: null, name: null, email: null },
  task: { id: 500, name: 'Revisar logo', status: 2, visible_to_client: false },
  date: '2026-09-15 09:12:00',
  lastreply: null,
  message: 'Se ve borroso.',
  project_id: 1
}

const fichaDelPortal = {
  id: 7,
  subject: 'No carga el logo',
  date: '2026-09-15 09:12:00',
  last_reply: '2026-09-16 10:00:00',
  status: 2,
  priority: 3,
  project_id: 1,
  task: { progress: 40 },
  message: 'Se ve borroso.',
  replies: [{ id: 1, message: 'Lo vemos.', date: '2026-09-16 10:00:00', from: 'equipo', name: 'Ana' }],
  puede_responder: true,
  motivo_sin_respuesta: null
}

test('las dos fuentes tienen las mismas claves, todo texto o null', () => {
  assert.deepEqual(Object.keys(TICKET_DEL_PANEL).sort(), Object.keys(TICKET_DEL_PORTAL).sort())

  for (const fuente of [TICKET_DEL_PANEL, TICKET_DEL_PORTAL]) {
    for (const valor of Object.values(fuente)) assert.ok(valor === null || typeof valor === 'string')
  }
})

test('las rutas del BFF del portal empiezan con portal/ y sus enlaces con /portal/', () => {
  for (const clave of ['ticket', 'responder', 'editar', 'lookups']) {
    assert.match(TICKET_DEL_PORTAL[clave], /^portal\//)
  }
  assert.equal(TICKET_DEL_PORTAL.respuestas, null)
  assert.match(TICKET_DEL_PORTAL.paginaProyecto, /^\/portal\//)
  assert.match(TICKET_DEL_PORTAL.paginaTarea, /^\/portal\//)
})

test('rutaDeTicket resuelve :id y :proyecto', () => {
  assert.equal(rutaDeTicket(TICKET_DEL_PANEL.responder, 12), 'tickets/12/respuestas')
  assert.equal(rutaDeTicket(TICKET_DEL_PANEL.paginaTarea, 500, 3), '/proyectos/3?tab=tareas&tarea=500')
})

test('la ficha del panel pone la apertura primero y resuelve autores por tipo', () => {
  const vista = ticketDelPanel(fichaDelPanel, [
    { id: 9, message: 'Hola', date: null, autor: { tipo: 'staff', id: 2, full_name: 'Ana Ruiz', email: null } },
    { id: 10, message: null, date: null, autor: { tipo: 'correo', id: null, full_name: null, email: null } }
  ])

  assert.deepEqual(vista.hilo.map((m) => [m.autor, m.lado]), [
    ['Renata Ferreyra', 'cliente'], ['Ana Ruiz', 'equipo'], ['Cliente', 'cliente']
  ])
  assert.equal(vista.hilo[2].texto, '')
  assert.deepEqual(vista.tarea, { id: 500, nombre: 'Revisar logo', progreso: null })
  assert.deepEqual(vista.respuesta, { permitida: true, motivo: null })
  assert.equal(vista.solicitante, 'Renata Ferreyra')
})

test('la ficha del portal respeta la tarea interna sin nombre', () => {
  const vista = ticketDelPortal(fichaDelPortal)

  assert.deepEqual(vista.tarea, { id: null, nombre: null, progreso: 40 })
  assert.equal(vista.solicitante, null)
  assert.deepEqual(vista.hilo.map((m) => m.lado), ['cliente', 'equipo'])
})

test('las dos vistas tienen las mismas claves', () => {
  assert.deepEqual(
    Object.keys(vistaDelTicket(TICKET_DEL_PANEL, fichaDelPanel, [])).sort(),
    Object.keys(vistaDelTicket(TICKET_DEL_PORTAL, fichaDelPortal, [])).sort()
  )
})

test('la regla del portal la decide la API aunque el hilo diga otra cosa', () => {
  const bloqueado = ticketDelPortal({ ...fichaDelPortal, puede_responder: false, motivo_sin_respuesta: 'cerrado' })
  assert.deepEqual(bloqueado.respuesta, { permitida: false, motivo: 'cerrado' })
})

test('sin los campos de T2 cae a la regla local', () => {
  const { puede_responder: _p, motivo_sin_respuesta: _m, ...sinRegla } = fichaDelPortal

  assert.deepEqual(ticketDelPortal({ ...sinRegla, replies: [] }).respuesta, { permitida: false, motivo: 'esperando_equipo' })
  assert.deepEqual(ticketDelPortal(sinRegla).respuesta, { permitida: true, motivo: null })
})

test('regla local: cerrado manda sobre esperando al equipo', () => {
  assert.deepEqual(reglaDeRespuestaLocal(5, false), { permitida: false, motivo: 'cerrado' })
  assert.deepEqual(reglaDeRespuestaLocal(5, true), { permitida: false, motivo: 'cerrado' })
  assert.deepEqual(reglaDeRespuestaLocal(1, false), { permitida: false, motivo: 'esperando_equipo' })
  assert.deepEqual(reglaDeRespuestaLocal(3, true), { permitida: true, motivo: null })
})

test('los avisos dicen lo que pidio el producto', () => {
  assert.equal(avisoSinRespuesta('esperando_equipo'), 'El equipo aún no responde tu solicitud; podrás responder cuando lo haga.')
  assert.equal(avisoSinRespuesta('cerrado'), 'Este ticket está cerrado.')
  assert.ok(avisoSinRespuesta(null).length > 0)
})

test('el cuerpo de la respuesta omite status si no se eligio y rechaza el vacio', () => {
  assert.deepEqual(cuerpoDeRespuesta('  hola ', null), { message: 'hola' })
  assert.deepEqual(cuerpoDeRespuesta('hola', 3), { message: 'hola', status: 3 })
  assert.equal(cuerpoDeRespuesta('   ', 3), null)
})

test('el enlace del equipo abre la pestaña y el modal', () => {
  assert.equal(enlaceDelEquipoAlTicket(12, 4), '/proyectos/4?tab=tickets&ticket=12')
})
