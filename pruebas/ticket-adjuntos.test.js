/**
 * Archivos que acompañan a un mensaje de ticket: topes del lado del navegador y el cuerpo multipart.
 *
 * Los topes son un adelanto de lo que valida la API (`maximum_allowed_ticket_attachments`,
 * `TICKETS_ADJUNTOS_MAX_MB`, `ticket_attachments_file_extensions`), no la validación misma.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPO_DE_ADJUNTOS_DE_TICKET,
  EXTENSIONES_DE_ADJUNTO_DE_TICKET,
  MAXIMO_ADJUNTOS_DE_TICKET,
  MAXIMO_BYTES_POR_ADJUNTO_DE_TICKET,
  agregarAdjuntosDeTicket,
  atributoAccept,
  cuerpoConArchivos,
  descripcionDeLosLimites,
  motivoParaNoAdjuntar
} from '../src/dominio/ticket-adjuntos.ts'

const archivo = (name, size = 100, lastModified = 1) => ({ name, size, lastModified })

test('acepta las extensiones de la instalación, sin importar mayúsculas', () => {
  for (const extension of EXTENSIONES_DE_ADJUNTO_DE_TICKET) {
    assert.equal(motivoParaNoAdjuntar(archivo(`a.${extension}`)), null, extension)
    assert.equal(motivoParaNoAdjuntar(archivo(`A.${extension.toUpperCase()}`)), null, extension)
  }
})

test('rechaza lo que el servidor va a rechazar, con su motivo', () => {
  assert.match(motivoParaNoAdjuntar(archivo('x.svg')), /\.svg/)
  assert.match(motivoParaNoAdjuntar(archivo('x.html')), /\.html/)
  assert.match(motivoParaNoAdjuntar(archivo('x.exe')), /\.exe/)
  assert.match(motivoParaNoAdjuntar(archivo('sinextension')), /extensión/)
  assert.match(motivoParaNoAdjuntar(archivo('.pdf')), /extensión/)
  assert.match(motivoParaNoAdjuntar(archivo('vacio.pdf', 0)), /vacío/)
  assert.match(motivoParaNoAdjuntar(archivo('  ')), /nombre/)
  assert.equal(motivoParaNoAdjuntar(archivo('justo.pdf', MAXIMO_BYTES_POR_ADJUNTO_DE_TICKET)), null)
  assert.match(motivoParaNoAdjuntar(archivo('grande.pdf', MAXIMO_BYTES_POR_ADJUNTO_DE_TICKET + 1)), /máximo es 10 MB/)
})

test('suma archivos, no duplica y explica lo descartado con el nombre', () => {
  const { lista, rechazados } = agregarAdjuntosDeTicket([archivo('a.pdf')], [archivo('a.pdf'), archivo('b.png'), archivo('c.exe')])

  assert.deepEqual(lista.map((f) => f.name), ['a.pdf', 'b.png'])
  assert.equal(rechazados.length, 1)
  assert.match(rechazados[0], /^«c\.exe»: /)
})

test('el tope de cantidad conserva lo ya elegido', () => {
  const llenos = Array.from({ length: MAXIMO_ADJUNTOS_DE_TICKET }, (_, i) => archivo(`f${i}.pdf`))
  const { lista, rechazados } = agregarAdjuntosDeTicket(llenos, [archivo('extra.pdf')])

  assert.equal(lista.length, MAXIMO_ADJUNTOS_DE_TICKET)
  assert.match(rechazados[0], new RegExp(`«extra\\.pdf».*${MAXIMO_ADJUNTOS_DE_TICKET} archivos`))
})

test('el atributo accept y la frase de límites salen de la misma lista', () => {
  assert.equal(atributoAccept(), '.jpg,.jpeg,.png,.pdf,.doc,.zip,.rar')
  assert.equal(descripcionDeLosLimites(), 'Hasta 4 archivos de 10 MB: JPG, JPEG, PNG, PDF, DOC, ZIP o RAR.')
})

test('sin archivos el cuerpo sigue siendo el JSON de siempre', () => {
  const cuerpo = { message: 'hola', status: 3 }

  assert.equal(cuerpoConArchivos(cuerpo, []), cuerpo)
})

test('con archivos arma multipart: texto como campos y los archivos en attachments[]', () => {
  const pdf = new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' })
  const png = new File(['x'], 'foto.png', { type: 'image/png' })
  const formulario = cuerpoConArchivos({ message: 'hola', status: 3, priority: undefined, project_id: 252 }, [pdf, png])

  assert.ok(formulario instanceof FormData)
  assert.equal(formulario.get('message'), 'hola')
  assert.equal(formulario.get('status'), '3')
  assert.equal(formulario.get('project_id'), '252')
  assert.equal(formulario.has('priority'), false, 'lo omitido no viaja')
  assert.deepEqual(formulario.getAll(CAMPO_DE_ADJUNTOS_DE_TICKET).map((f) => f.name), ['informe.pdf', 'foto.png'])
  assert.equal(CAMPO_DE_ADJUNTOS_DE_TICKET, 'attachments[]')
})
