/**
 * Pruebas de la lógica pura de la edición conjunta del Meeting Paper: lectura de los avisos del
 * servicio, colores, quiénes están editando, el rótulo de guardado, las esperas de reconexión y la
 * lista de autores del historial.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RETARDOS_DE_RECONEXION_MS,
  colorDeColaborador,
  editoresDelDocumento,
  esColaboradorOrbe,
  esperaDeReconexion,
  leerMensajeDelDocumento,
  textoDeGuardado
} from '../src/dominio/acta-colaborativa.ts'
import { autoresDeRevision } from '../src/dominio/historial-acta.ts'
import { ASISTENTE } from '../src/dominio/glosario.ts'

test('leerMensajeDelDocumento: reconoce guardado, recargado y sin_acceso', () => {
  assert.deepEqual(leerMensajeDelDocumento('{"t":"guardado","revision":"2026-10-15 10:00:00"}'), { t: 'guardado', revision: '2026-10-15 10:00:00' })
  assert.deepEqual(leerMensajeDelDocumento('{"t":"recargado","motivo":"conflicto"}'), { t: 'recargado', motivo: 'conflicto' })
  assert.deepEqual(leerMensajeDelDocumento('{"t":"recargado"}'), { t: 'recargado', motivo: '' })
  assert.deepEqual(leerMensajeDelDocumento('{"t":"sin_acceso"}'), { t: 'sin_acceso' })
})

test('leerMensajeDelDocumento: ignora lo desconocido o malformado', () => {
  for (const texto of ['', 'no json', 'null', '[]', '"x"', '{"t":"otro"}', '{"t":"guardado"}', '{"t":"guardado","revision":""}', '{"t":"guardado","revision":3}']) {
    assert.equal(leerMensajeDelDocumento(texto), null, texto)
  }
})

test('colorDeColaborador: estable, hexadecimal y distinto entre vecinos', () => {
  assert.equal(colorDeColaborador(7), colorDeColaborador(7))
  assert.match(colorDeColaborador(7), /^#[0-9a-f]{6}$/)
  assert.notEqual(colorDeColaborador(1), colorDeColaborador(2))
  assert.match(colorDeColaborador(-3), /^#[0-9a-f]{6}$/)
  assert.match(colorDeColaborador(0), /^#[0-9a-f]{6}$/)
})

test('esColaboradorOrbe: solo el nombre del asistente', () => {
  assert.equal(esColaboradorOrbe(ASISTENTE), true)
  assert.equal(esColaboradorOrbe('Ana'), false)
  assert.equal(esColaboradorOrbe(undefined), false)
})

test('editoresDelDocumento: sin mí, sin repetidos, con el asistente aparte', () => {
  const estados = [
    { user: { id: 1, name: 'Yo', imagen: null } },
    { user: { id: 2, name: 'Ana', imagen: 'a.png' } },
    { user: { id: 2, name: 'Ana', imagen: 'a.png' } },
    { user: { id: 3, name: 'Beto' } },
    { user: { name: ASISTENTE, color: '#7c3aed' } },
    { cursor: {} },
    null,
    { user: { id: 'x', name: 'Raro' } },
    { user: { id: 4, name: '' } }
  ]

  assert.deepEqual(editoresDelDocumento(estados, 1), {
    personas: [
      { id: 2, full_name: 'Ana', profile_image_url: 'a.png' },
      { id: 3, full_name: 'Beto', profile_image_url: null }
    ],
    orbe: true
  })
})

test('editoresDelDocumento: documento vacío', () => {
  assert.deepEqual(editoresDelDocumento([], 1), { personas: [], orbe: false })
})

test('textoDeGuardado: hh:mm en la zona del negocio, con espera si no hubo guardado', () => {
  assert.equal(textoDeGuardado(null), 'Los cambios se guardan solos')
  // 2026-10-15 17:03 UTC = 14:03 en Chile (UTC-3 en horario de verano).
  assert.equal(textoDeGuardado(Date.UTC(2026, 9, 15, 17, 3)), 'Guardado 14:03')
})

test('esperaDeReconexion: crece y se rinde tras el último intento', () => {
  assert.equal(esperaDeReconexion(1), RETARDOS_DE_RECONEXION_MS[0])
  assert.equal(esperaDeReconexion(RETARDOS_DE_RECONEXION_MS.length), RETARDOS_DE_RECONEXION_MS.at(-1))
  assert.equal(esperaDeReconexion(RETARDOS_DE_RECONEXION_MS.length + 1), null)
  assert.equal(esperaDeReconexion(0), null)
})

test('autoresDeRevision: solo con dos o más personas distintas y válidas', () => {
  const ana = { staff_id: 2, staff_name: 'Ana', staff_image: null }
  const beto = { staff_id: 3, staff_name: 'Beto', staff_image: 'b.png' }

  assert.deepEqual(autoresDeRevision({}), [])
  assert.deepEqual(autoresDeRevision({ authors: [] }), [])
  assert.deepEqual(autoresDeRevision({ authors: [ana] }), [])
  assert.deepEqual(autoresDeRevision({ authors: [ana, ana] }), [])
  assert.deepEqual(autoresDeRevision({ authors: [ana, { staff_id: 0, staff_name: 'Cero', staff_image: null }] }), [])
  assert.deepEqual(autoresDeRevision({ authors: [ana, beto] }), [
    { id: 2, full_name: 'Ana', profile_image_url: null },
    { id: 3, full_name: 'Beto', profile_image_url: 'b.png' }
  ])
})
