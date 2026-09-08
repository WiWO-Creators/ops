/**
 * Pruebas de la vista de calendario de Procesos.
 *
 * Cubren lo que se rompe sin dar error: la semana que arranca el dia equivocado, el rango que se le
 * pide a la API distinto del que se dibuja, y la tarea que cae en la celda de otro dia. Ninguna de
 * las tres da pantalla rota — dan una pantalla que miente.
 *
 * `TZ` va fijado a un huso al oeste de Greenwich a proposito: si la aritmetica se hiciera en hora
 * local, `2026-09-07` seria el 6 y estas pruebas fallarian. Que es exactamente lo que tienen que
 * hacer.
 */

process.env.TZ = 'America/Argentina/Buenos_Aires'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorVencimiento,
  contarAvisos,
  diasDeVista,
  esDiaValido,
  inicioDeSemana,
  leerVista,
  moverPeriodo,
  rangoDeVista,
  tituloDePeriodo
} from '../src/dominio/calendario.ts'

test('la semana arranca el lunes, venga de donde venga el dia', () => {
  // 2026-09-08 es martes; 2026-09-13, domingo. Los dos caen en la semana del lunes 7.
  assert.equal(inicioDeSemana('2026-09-08'), '2026-09-07')
  assert.equal(inicioDeSemana('2026-09-13'), '2026-09-07')
  assert.equal(inicioDeSemana('2026-09-07'), '2026-09-07')
})

test('la semana tiene siete dias consecutivos, de lunes a domingo', () => {
  const dias = diasDeVista('2026-09-10', 'semana')

  assert.deepEqual(dias, [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    '2026-09-11', '2026-09-12', '2026-09-13'
  ])
})

test('la semana cruza el fin de mes sin saltearse dias', () => {
  const dias = diasDeVista('2026-10-01', 'semana')

  assert.deepEqual(dias, [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
    '2026-10-02', '2026-10-03', '2026-10-04'
  ])
})

test('la vista de dia dibuja un solo dia', () => {
  assert.deepEqual(diasDeVista('2026-09-08', 'dia'), ['2026-09-08'])
})

test('un dia que no existe no produce grilla', () => {
  // 2026 no es bisiesto: el 29 de febrero rodaria al 1 de marzo si no se validara.
  assert.equal(esDiaValido('2026-02-29'), false)
  assert.equal(esDiaValido('ayer'), false)
  assert.equal(esDiaValido(null), false)
  assert.deepEqual(diasDeVista('2026-02-29', 'semana'), [])
  assert.equal(rangoDeVista('2026-02-29', 'semana'), null)
})

test('el rango que se le pide a la API es el mismo que se dibuja', () => {
  const vista = 'semana'
  const dias = diasDeVista('2026-09-10', vista)
  const rango = rangoDeVista('2026-09-10', vista)

  assert.deepEqual(rango, { desde: '2026-09-07', hasta: '2026-09-13' })
  assert.equal(rango.desde, dias[0])
  assert.equal(rango.hasta, dias[dias.length - 1])
})

test('el rango de un dia tiene los dos extremos iguales', () => {
  assert.deepEqual(rangoDeVista('2026-09-08', 'dia'), { desde: '2026-09-08', hasta: '2026-09-08' })
})

test('avanzar la semana desde un jueves cae en el lunes siguiente', () => {
  // Sumar siete al jueves daria el jueves 17: la semana se dibujaria igual, pero el ancla se iria
  // corriendo y "hoy" dejaria de caer donde corresponde al volver.
  assert.equal(moverPeriodo('2026-09-10', 'semana', 1), '2026-09-14')
  assert.equal(moverPeriodo('2026-09-10', 'semana', -1), '2026-08-31')
})

test('avanzar el dia salta de a uno, tambien cruzando el mes', () => {
  assert.equal(moverPeriodo('2026-09-08', 'dia', 1), '2026-09-09')
  assert.equal(moverPeriodo('2026-09-30', 'dia', 1), '2026-10-01')
  assert.equal(moverPeriodo('2026-09-01', 'dia', -1), '2026-08-31')
})

test('cada tarea cae en la celda de su vencimiento', () => {
  const dias = diasDeVista('2026-09-08', 'semana')
  const tareas = [
    { id: 1, due_date: '2026-09-07' },
    { id: 2, due_date: '2026-09-07' },
    { id: 3, due_date: '2026-09-11' }
  ]

  const grupos = agruparPorVencimiento(tareas, dias)

  assert.deepEqual(grupos.get('2026-09-07').map((t) => t.id), [1, 2])
  assert.deepEqual(grupos.get('2026-09-11').map((t) => t.id), [3])
})

test('la semana sin tareas devuelve las siete celdas vacias, no un mapa vacio', () => {
  // Sin las siete claves la grilla no tendria que dibujar y quedaria rota en vez de vacia.
  const grupos = agruparPorVencimiento([], diasDeVista('2026-09-08', 'semana'))

  assert.equal(grupos.size, 7)
  for (const celda of grupos.values()) assert.deepEqual(celda, [])
})

test('una tarea sin vencimiento no entra en ninguna celda', () => {
  const grupos = agruparPorVencimiento([{ id: 1, due_date: null }], diasDeVista('2026-09-08', 'dia'))

  assert.deepEqual(grupos.get('2026-09-08'), [])
})

test('un vencimiento fuera del rango no inventa una celda', () => {
  const grupos = agruparPorVencimiento([{ id: 1, due_date: '2026-12-01' }], diasDeVista('2026-09-08', 'semana'))

  assert.equal(grupos.size, 7)
  assert.equal(grupos.has('2026-12-01'), false)
})

test('un vencimiento con hora igual cae en su dia', () => {
  const grupos = agruparPorVencimiento([{ id: 1, due_date: '2026-09-08 00:00:00' }], diasDeVista('2026-09-08', 'dia'))

  assert.deepEqual(grupos.get('2026-09-08').map((t) => t.id), [1])
})

test('los avisos se cuentan por gravedad y los dos umbrales previos suman uno solo', () => {
  const filas = [
    { aviso: { estado: 'vencido' } },
    { aviso: { estado: 'vencido' } },
    { aviso: { estado: 'hoy' } },
    { aviso: { estado: 'final' } },
    { aviso: { estado: 'temprano' } }
  ]

  assert.deepEqual(contarAvisos(filas), { vencidos: 2, hoy: 1, porVencer: 2 })
  assert.deepEqual(contarAvisos([]), { vencidos: 0, hoy: 0, porVencer: 0 })
})

test('la vista se lee de la URL y lo desconocido cae en semana', () => {
  assert.equal(leerVista('dia'), 'dia')
  assert.equal(leerVista('semana'), 'semana')
  assert.equal(leerVista('mes'), 'semana')
  assert.equal(leerVista(null), 'semana')
})

test('el titulo del periodo nombra el dia y el rango', () => {
  const dia = tituloDePeriodo('2026-09-08', 'dia')
  assert.match(dia, /martes/)
  assert.match(dia, /8/)

  // Misma semana, mismo mes: el mes se dice una sola vez, al final.
  assert.equal(tituloDePeriodo('2026-09-08', 'semana'), '7 – 13 sept 2026')
  // Semana a caballo de dos meses: cada extremo lleva el suyo.
  assert.equal(tituloDePeriodo('2026-10-01', 'semana'), '28 sept – 4 oct 2026')
  // Un dia invalido no rompe la cabecera: se muestra tal cual llego.
  assert.equal(tituloDePeriodo('2026-02-29', 'semana'), '2026-02-29')
})
