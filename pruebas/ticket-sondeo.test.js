/**
 * Pruebas de las reglas del sondeo del modal de ticket: que se pide en cada lectura, cuando una
 * lectura no trae cambios y como se reconoce la fila sin leer.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ATRIBUTO_TICKET_SIN_LEER,
  conservarReferencias,
  rutasDeLectura,
  selectorDeTicketSinLeer
} from '../src/dominio/ticket-sondeo.ts'
import { TICKET_DEL_PANEL, TICKET_DEL_PORTAL, ticketDelPanel } from '../src/dominio/ticket-vista.ts'

const ficha = {
  id: 7,
  subject: 'No carga el logo',
  status: 1,
  priority: 3,
  department: null,
  assigned: null,
  solicitante: { tipo: 'contacto', contact: { id: 1, full_name: 'Renata Ferreyra', email: 'r@x.cl' }, client: null, name: null, email: null },
  task: null,
  date: '2026-09-15 09:12:00',
  lastreply: '2026-09-16 10:00:00',
  message: 'Se ve borroso.',
  project_id: 1
}

const respuesta = (id, texto = 'Hola') => ({
  id,
  date: '2026-09-16 10:00:00',
  message: texto,
  message_texto: texto,
  autor: { tipo: 'staff', id: 3, full_name: 'Ana', email: null },
  attachments: []
})

/** Una vista como la que arma cada lectura: siempre objetos nuevos aunque el contenido sea el mismo. */
const vista = (cambios = {}, respuestas = [respuesta(1), respuesta(2)]) => ({
  ...ticketDelPanel({ ...ficha, ...cambios }, respuestas, [{ id: 9, filename: 'logo.png', file_type: 'image/png', ruta: null }])
})

test('rutasDeLectura: la apertura pide ficha, hilo y adjuntos', () => {
  const rutas = rutasDeLectura(TICKET_DEL_PANEL, 7, false)

  assert.equal(rutas.ficha, 'tickets/7')
  assert.equal(rutas.hilo, 'tickets/7/respuestas')
  assert.equal(rutas.archivos, 'tickets/7/archivos')
})

test('rutasDeLectura: con los adjuntos ya conocidos el sondeo pide solo ficha e hilo', () => {
  const rutas = rutasDeLectura(TICKET_DEL_PANEL, 7, true)

  assert.equal(rutas.ficha, 'tickets/7')
  assert.equal(rutas.hilo, 'tickets/7/respuestas')
  assert.equal(rutas.archivos, null)
})

test('rutasDeLectura: el portal no pide hilo ni adjuntos aparte', () => {
  const rutas = rutasDeLectura(TICKET_DEL_PORTAL, 7, false)

  assert.equal(rutas.ficha, 'portal/tickets/7')
  assert.equal(rutas.hilo, null)
  assert.equal(rutas.archivos, null)
})

test('conservarReferencias: una lectura identica devuelve la vista anterior', () => {
  const previa = vista()
  const nueva = vista()

  assert.notEqual(previa, nueva)
  assert.equal(conservarReferencias(previa, nueva), previa)
})

test('conservarReferencias: un mensaje nuevo cambia la vista y conserva los mensajes intactos', () => {
  const previa = vista()
  const nueva = vista({}, [respuesta(1), respuesta(2), respuesta(3, 'Otra')])
  const resultado = conservarReferencias(previa, nueva)

  assert.notEqual(resultado, previa)
  assert.equal(resultado.hilo.length, 4)
  assert.equal(resultado.hilo[0], previa.hilo[0])
  assert.equal(resultado.hilo[2], previa.hilo[2])
  assert.equal(resultado.hilo[3].texto, 'Otra')
})

test('conservarReferencias: un cambio fuera del hilo conserva el hilo anterior', () => {
  const previa = vista()
  const resultado = conservarReferencias(previa, vista({ status: 5 }))

  assert.notEqual(resultado, previa)
  assert.equal(resultado.estado, 5)
  assert.equal(resultado.hilo, previa.hilo)
})

test('conservarReferencias: detecta ediciones que una firma de ids y fechas no vería', () => {
  const previa = vista()

  assert.equal(conservarReferencias(previa, vista({ subject: 'Otro asunto' })).asunto, 'Otro asunto')
  assert.equal(conservarReferencias(previa, vista({ project_id: 2 })).proyectoId, 2)
  assert.equal(conservarReferencias(previa, vista({ assigned: { id: 4, full_name: 'Luis' } })).asignacion.asignado.nombre, 'Luis')
  assert.equal(
    conservarReferencias(previa, vista({}, [respuesta(1, 'Editado'), respuesta(2)])).hilo[1].texto,
    'Editado'
  )
})

test('conservarReferencias: un mensaje que desaparece del hilo se refleja', () => {
  const previa = vista()
  const resultado = conservarReferencias(previa, vista({}, [respuesta(2)]))

  assert.equal(resultado.hilo.length, 2)
  assert.equal(resultado.hilo[1], previa.hilo[2])
})

test('selectorDeTicketSinLeer apunta al enlace marcado de ese ticket', () => {
  assert.equal(ATRIBUTO_TICKET_SIN_LEER, 'data-ticket-sin-leer')
  assert.equal(selectorDeTicketSinLeer(42), 'a[data-ticket-sin-leer="42"]')
})
