/**
 * Pruebas de la agenda de salas.
 *
 * Cubren lo que se rompe en silencio: la conversion entre la hora que se elige en pantalla y el
 * instante UTC que viaja a la API, la deteccion de choques y la posicion de un bloque en la grilla.
 * Un error en cualquiera de las tres no da error visible — da una reserva a otra hora, o un hueco
 * que parece libre y no lo esta.
 *
 * Se fija `TZ` en el proceso a un huso distinto del de negocio a proposito: si la logica dependiera
 * de la zona de quien corre, estas pruebas fallarian, y eso es exactamente lo que tienen que
 * detectar.
 */

process.env.TZ = 'UTC'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bloqueDeReserva, diaLocal, estadoDeReserva, formatearMinutos, franjas, horaLocal, instanteDe,
  minutosDeHora, minutosLocales, revisarReserva, seSuperpone, sumarDias, ventanaDelDia,
  HORA_APERTURA, HORA_CIERRE, PASO_MINUTOS
} from '../src/dominio/salas.ts'

// La zona del negocio es America/Argentina/Buenos_Aires, UTC-3 todo el año.
const DESFASE_HORAS = 3

test('instanteDe convierte la hora de pared al instante UTC de la zona del negocio', () => {
  const instante = instanteDe('2026-09-02', 9 * 60)

  assert.equal(instante?.toISOString(), `2026-09-02T${String(9 + DESFASE_HORAS).padStart(2, '0')}:00:00.000Z`)
})

test('instanteDe rechaza un dia mal formado', () => {
  assert.equal(instanteDe('2/9/2026', 540), null)
  assert.equal(instanteDe('', 540), null)
})

test('ventanaDelDia va de medianoche local a medianoche local', () => {
  const ventana = ventanaDelDia('2026-09-02')

  assert.equal(ventana?.desde, '2026-09-02T03:00:00.000Z')
  assert.equal(ventana?.hasta, '2026-09-03T03:00:00.000Z')
})

test('minutosLocales y diaLocal leen el instante en la zona del negocio, no en la del proceso', () => {
  // 02:00 UTC del dia 3 son las 23:00 del dia 2 en Buenos Aires: si se leyera en UTC, la reserva
  // saldria dibujada en el dia equivocado.
  assert.equal(minutosLocales('2026-09-03T02:00:00Z'), 23 * 60)
  assert.equal(diaLocal('2026-09-03T02:00:00Z'), '2026-09-02')
})

test('horaLocal devuelve la hora de pared y avisa cuando el instante no sirve', () => {
  assert.equal(horaLocal('2026-09-02T12:00:00Z'), '09:00')
  assert.equal(horaLocal('mañana'), '--:--')
})

test('formatearMinutos y minutosDeHora son inversas dentro del dia', () => {
  assert.equal(formatearMinutos(570), '09:30')
  assert.equal(minutosDeHora('09:30'), 570)
  assert.equal(minutosDeHora('24:00'), null)
  assert.equal(minutosDeHora('9:5'), null)
  assert.equal(minutosDeHora(''), null)
})

test('formatearMinutos recorta los valores fuera del dia en vez de devolver basura', () => {
  assert.equal(formatearMinutos(-30), '00:00')
  assert.equal(formatearMinutos(24 * 60), '23:59')
})

test('franjas cubre el horario visible entero, con el paso configurado', () => {
  const filas = franjas()

  assert.equal(filas[0], HORA_APERTURA * 60)
  assert.equal(filas.at(-1), HORA_CIERRE * 60 - PASO_MINUTOS)
  assert.equal(filas.length, ((HORA_CIERRE - HORA_APERTURA) * 60) / PASO_MINUTOS)
})

test('seSuperpone detecta el cruce y deja convivir los extremos que se tocan', () => {
  const reservas = [{ id: 1, start: '2026-09-02T13:00:00Z', end: '2026-09-02T14:00:00Z' }]

  assert.equal(seSuperpone(reservas, '2026-09-02T13:30:00Z', '2026-09-02T14:30:00Z'), true)
  assert.equal(seSuperpone(reservas, '2026-09-02T14:00:00Z', '2026-09-02T15:00:00Z'), false)
  assert.equal(seSuperpone(reservas, '2026-09-02T12:00:00Z', '2026-09-02T13:00:00Z'), false)
  // Una reserva que envuelve entera a la existente tambien choca.
  assert.equal(seSuperpone(reservas, '2026-09-02T12:00:00Z', '2026-09-02T15:00:00Z'), true)
})

test('seSuperpone ignora la reserva que se esta editando', () => {
  const reservas = [{ id: 7, start: '2026-09-02T13:00:00Z', end: '2026-09-02T14:00:00Z' }]

  assert.equal(seSuperpone(reservas, '2026-09-02T13:15:00Z', '2026-09-02T13:45:00Z', 7), false)
})

test('bloqueDeReserva ubica la reserva en porcentaje de la grilla', () => {
  const total = (HORA_CIERRE - HORA_APERTURA) * 60
  // 09:00 a 10:00 hora local.
  const caja = bloqueDeReserva('2026-09-02T12:00:00Z', '2026-09-02T13:00:00Z', '2026-09-02')

  assert.equal(caja?.arriba, ((9 * 60 - HORA_APERTURA * 60) / total) * 100)
  assert.equal(caja?.alto, (60 / total) * 100)
  assert.equal(caja?.recortado, false)
})

test('bloqueDeReserva recorta lo que empieza antes de la apertura en vez de descartarlo', () => {
  // 06:00 a 08:00 local: ocupa la sala a las 07:00 y tiene que verse.
  const caja = bloqueDeReserva('2026-09-02T09:00:00Z', '2026-09-02T11:00:00Z', '2026-09-02')

  assert.equal(caja?.arriba, 0)
  assert.equal(caja?.recortado, true)
})

test('bloqueDeReserva devuelve null cuando la reserva no toca el horario visible', () => {
  // 02:00 a 03:00 local, muy antes de la apertura.
  assert.equal(bloqueDeReserva('2026-09-02T05:00:00Z', '2026-09-02T06:00:00Z', '2026-09-02'), null)
  // Otro dia.
  assert.equal(bloqueDeReserva('2026-09-05T12:00:00Z', '2026-09-05T13:00:00Z', '2026-09-02'), null)
})

test('revisarReserva bloquea lo que la API tambien rechazaria', () => {
  const base = { titulo: 'Comité', desde: 540, hasta: 600, asistentes: '', capacidad: 8 }

  assert.deepEqual(revisarReserva(base).errores, {})
  assert.ok(revisarReserva({ ...base, titulo: '   ' }).errores.titulo)
  assert.ok(revisarReserva({ ...base, hasta: 540 }).errores.hasta)
  assert.ok(revisarReserva({ ...base, hasta: 545 }).errores.hasta)
  assert.ok(revisarReserva({ ...base, desde: 0, hasta: 13 * 60 }).errores.hasta)
  assert.ok(revisarReserva({ ...base, asistentes: 'tres' }).errores.asistentes)
  assert.ok(revisarReserva({ ...base, asistentes: '0' }).errores.asistentes)
})

test('pasarse de la capacidad avisa pero no bloquea', () => {
  const revision = revisarReserva({ titulo: 'Comité', desde: 540, hasta: 600, asistentes: '12', capacidad: 8 })

  assert.deepEqual(revision.errores, {})
  assert.equal(revision.avisos.length, 1)
})

test('estadoDeReserva clasifica respecto del instante que se le pasa', () => {
  const reserva = { start: '2026-09-02T13:00:00Z', end: '2026-09-02T14:00:00Z' }

  assert.equal(estadoDeReserva(reserva, new Date('2026-09-02T12:00:00Z')), 'proxima')
  assert.equal(estadoDeReserva(reserva, new Date('2026-09-02T13:30:00Z')), 'en-curso')
  assert.equal(estadoDeReserva(reserva, new Date('2026-09-02T14:00:00Z')), 'terminada')
})

test('sumarDias opera sobre el dia calendario y cruza fin de mes', () => {
  assert.equal(sumarDias('2026-09-02', 1), '2026-09-03')
  assert.equal(sumarDias('2026-09-01', -1), '2026-08-31')
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(sumarDias('mañana', 1), 'mañana')
})
