/**
 * Pruebas del agrupado de la pantalla de inicio.
 *
 * Lo que se protege es que lo urgente quede arriba y que el cronometro de otra persona no se muestre
 * como propio: detener el cronometro de un companero por confundir el dueño es un daño real, no un
 * detalle visual.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorVencimiento,
  cuantosNoListados,
  procesoConCronometro
} from '../src/dominio/inicio.ts'

const HOY = new Date(2026, 7, 25) // 25 de agosto de 2026, hora local

const proceso = (id, due_date, timer_activo = null) => ({ id, name: `Proceso ${id}`, due_date, timer_activo })

test('agrupa de mas urgente a menos y saltea los tramos vacios', () => {
  const grupos = agruparPorVencimiento([
    proceso(1, '2026-08-30'),   // proximo no: son 5 dias -> lejano
    proceso(2, '2026-08-24'),   // vencido
    proceso(3, '2026-08-25'),   // hoy
    proceso(4, '2026-08-27')    // proximo (2 dias)
  ], HOY)

  assert.deepEqual(grupos.map((g) => g.tramo), ['vencido', 'hoy', 'proximo'])
  assert.deepEqual(grupos.map((g) => g.procesos.map((p) => p.id)), [[2], [3], [4]])
})

test('un tramo sin procesos no aparece', () => {
  const grupos = agruparPorVencimiento([proceso(1, '2026-08-25')], HOY)

  assert.deepEqual(grupos.map((g) => g.tramo), ['hoy'])
})

test('una lista vacia no produce grupos', () => {
  assert.deepEqual(agruparPorVencimiento([], HOY), [])
  assert.equal(cuantosNoListados([], 0, HOY), 0)
})

test('lo lejano y lo que no tiene fecha se cuentan aparte, no se muestran', () => {
  const procesos = [
    proceso(1, '2026-12-01'),  // lejano
    proceso(2, null),          // sin fecha
    proceso(3, undefined),     // sin fecha
    proceso(4, '2026-08-25')   // hoy: se lista
  ]

  assert.equal(cuantosNoListados(procesos, procesos.length, HOY), 3)
  assert.deepEqual(agruparPorVencimiento(procesos, HOY).map((g) => g.tramo), ['hoy'])
})

test('cada tramo lista como mucho cinco, pero informa su total', () => {
  const ocho = Array.from({ length: 8 }, (_, i) => proceso(i + 1, '2026-08-24'))

  const [vencidos] = agruparPorVencimiento(ocho, HOY)

  assert.equal(vencidos.procesos.length, 5, 'se listan cinco')
  assert.equal(vencidos.total, 8, 'pero se sabe que son ocho')
})

test('los que no entraron en la pagina tambien se cuentan', () => {
  // La API devolvio 2 de 40: los 38 que faltan no se pueden clasificar, pero existen.
  const pagina = [proceso(1, '2026-08-24'), proceso(2, '2026-08-25')]

  assert.equal(cuantosNoListados(pagina, 40, HOY), 38)
})

test('sin total explicito se asume que llego todo', () => {
  const procesos = [proceso(1, '2026-08-24'), proceso(2, '2026-12-01')]

  assert.equal(cuantosNoListados(procesos, undefined, HOY), 1)
})

test('el cronometro de otra persona no es el mio', () => {
  const procesos = [
    proceso(1, '2026-08-25', { id: 9, staff_id: 42, start_time: '2026-08-25T10:00:00Z' })
  ]

  assert.equal(procesoConCronometro(procesos, 42)?.id, 1)
  assert.equal(procesoConCronometro(procesos, 7), null)
})

test('sin cronometro abierto devuelve null', () => {
  assert.equal(procesoConCronometro([proceso(1, '2026-08-25')], 42), null)
  assert.equal(procesoConCronometro([], 42), null)
})
