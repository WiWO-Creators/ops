/**
 * Pruebas del alta de una solicitud de soporte desde dentro del Proyecto.
 *
 * Lo que se prueba es a QUE Proyecto se manda. Desde que el soporte dejo de ser una seccion del
 * portal, el `project_id` no lo elige nadie: lo fija la pantalla donde el cliente esta parado. Un
 * cuerpo que viajara sin el, o con otro, abriria el ticket donde nadie lo va a buscar — y ese es
 * exactamente el fallo que no se ve hasta que alguien del equipo lo reclama.
 *
 * El contrato del otro lado es `Escritura\\TicketDelPortal::crear()`: `subject`, `message` y
 * `project_id` obligatorios, `priority` opcional, y `rechazarCamposAjenos` tira 422 ante cualquier
 * clave que no conozca. Por eso «sin prioridad» se manda omitiendo la clave y no con un cero.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LARGO_ASUNTO,
  SIN_PRIORIDAD,
  cuerpoDeSolicitud,
  solicitudCompleta
} from '../src/dominio/tickets-del-portal.ts'

/** Un borrador valido, con lo minimo para enviarse. */
function borrador (campos = {}) {
  return {
    asunto: 'No puedo bajar el plano',
    mensaje: 'Al abrirlo me dice que no tengo permiso.',
    proyectoId: 42,
    prioridad: SIN_PRIORIDAD,
    ...campos
  }
}

test('el alta manda el Proyecto de la pantalla y no otro', () => {
  const cuerpo = cuerpoDeSolicitud(borrador({ proyectoId: 7 }))

  assert.equal(cuerpo.project_id, 7)
})

test('el cuerpo usa los nombres del contrato de la API', () => {
  assert.deepEqual(cuerpoDeSolicitud(borrador({ proyectoId: 7 })), {
    subject: 'No puedo bajar el plano',
    message: 'Al abrirlo me dice que no tengo permiso.',
    project_id: 7
  })
})

test('sin prioridad elegida la clave no viaja', () => {
  // Mandar `priority: 0` seria un id de catalogo que no existe, y el equipo lo leeria como una
  // prioridad de verdad en vez de como "la define el equipo".
  const cuerpo = cuerpoDeSolicitud(borrador({ prioridad: SIN_PRIORIDAD }))

  assert.equal('priority' in cuerpo, false)
})

test('la prioridad elegida viaja como numero', () => {
  // El selector trabaja con strings porque Radix no admite otra cosa; la API espera el id.
  assert.equal(cuerpoDeSolicitud(borrador({ prioridad: '3' })).priority, 3)
})

test('el asunto y el mensaje viajan recortados', () => {
  // Un asunto que empieza con un salto de linea se ve como un renglon vacio en la bandeja del
  // equipo, y el contrato cuenta los espacios contra el tope de 191.
  const cuerpo = cuerpoDeSolicitud(borrador({ asunto: '  Falta el acta  ', mensaje: '\n Ayer. \n' }))

  assert.equal(cuerpo.subject, 'Falta el acta')
  assert.equal(cuerpo.message, 'Ayer.')
})

test('el tope del asunto es el del contrato', () => {
  // Se recorta en el campo (`maxLength`) para que el 422 no llegue por algo evitable; si el
  // contrato cambia, este numero tiene que cambiar con el.
  assert.equal(LARGO_ASUNTO, 191)
})

test('un borrador sin asunto o sin mensaje no se puede enviar', () => {
  assert.equal(solicitudCompleta(borrador()), true)
  assert.equal(solicitudCompleta(borrador({ asunto: '' })), false)
  assert.equal(solicitudCompleta(borrador({ mensaje: '' })), false)
})

test('una linea de espacios no habilita el envio', () => {
  // Sin esto el boton se prendia y la API contestaba 422 sobre un campo que la persona creia lleno.
  assert.equal(solicitudCompleta(borrador({ asunto: '   ' })), false)
  assert.equal(solicitudCompleta(borrador({ mensaje: '\n  \t' })), false)
})

test('no hace falta elegir prioridad para poder enviar', () => {
  // Es opcional en el contrato: exigirla seria pedirle al cliente que decida algo que decide el
  // equipo al repartir.
  assert.equal(solicitudCompleta(borrador({ prioridad: SIN_PRIORIDAD })), true)
})
