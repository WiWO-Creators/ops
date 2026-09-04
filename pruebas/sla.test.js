/**
 * Pruebas del compromiso de plazo, del lado del frontend.
 *
 * Lo que se verifica es la **regla de la ausencia**, que es la que se rompe sola: un Proceso sin
 * tipo, sin ETA configurado o sin `due_date` tiene que quedar vacio y nunca en cero, porque un cero
 * se lee como "cumple" y miente sobre un plazo que nadie comprometio.
 *
 * El calculo en si no se prueba aca porque no vive aca: lo hace el backend y llega resuelto.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esEstadoSla, formatearDesviacion, SLA } from '../src/lib/sla.ts'
import { urlClasica } from '../src/lib/panel-clasico.ts'

test('sin desviacion no hay texto, y el cero es un texto y no un vacio', () => {
  // Los tres casos de ausencia del contrato: sin tipo, sin ETA o sin `due_date`.
  assert.equal(formatearDesviacion(null), null)
  assert.equal(formatearDesviacion(undefined), null)

  // Cero es "cerro justo el dia comprometido": es un dato, no una ausencia.
  assert.equal(formatearDesviacion(0), 'a tiempo')
})

test('el atraso lleva signo mas y el adelanto el menos tipografico', () => {
  assert.equal(formatearDesviacion(3), '+3 d')
  // U+2212, no el guion del teclado: en cifras tabulares el guion queda a media altura.
  assert.equal(formatearDesviacion(-2), '−2 d')
  assert.equal(formatearDesviacion(-2).charCodeAt(0), 0x2212)
})

test('un numero que no es numero no se pinta', () => {
  assert.equal(formatearDesviacion(Number.NaN), null)
  assert.equal(formatearDesviacion(Number.POSITIVE_INFINITY), null)
})

test('los tres estados del contrato tienen lectura, y solo esos tres', () => {
  assert.deepEqual(Object.keys(SLA).sort(), ['en_plazo', 'en_riesgo', 'incumplido'])

  // "En plazo" no lleva color: lo normal solo confirma. El color queda para lo que pide accion.
  assert.equal(SLA.en_plazo.tono, 'contorno')
  assert.equal(SLA.en_riesgo.tono, 'aviso')
  assert.equal(SLA.incumplido.tono, 'peligro')
})

test('un estado que el frontend no conoce no se pinta en vez de reventar', () => {
  assert.equal(esEstadoSla('incumplido'), true)
  assert.equal(esEstadoSla('en_pausa'), false)
  assert.equal(esEstadoSla(null), false)
  assert.equal(esEstadoSla(undefined), false)
  // Nada de heredar del prototipo: `toString` no es un estado de SLA.
  assert.equal(esEstadoSla('toString'), false)
})

test('sin la variable de entorno el enlace al panel clasico no existe', () => {
  delete process.env.NEXT_PUBLIC_BOARD_URL
  assert.equal(urlClasica('espacio', 13), null)

  process.env.NEXT_PUBLIC_BOARD_URL = '   '
  assert.equal(urlClasica('espacio', 13), null)
})

test('la barra final de la variable no duplica la del enlace', () => {
  process.env.NEXT_PUBLIC_BOARD_URL = 'https://board.wiwo.me/'
  assert.equal(urlClasica('espacio', 13), 'https://board.wiwo.me/admin/projects/view/13')
  assert.equal(urlClasica('proceso', 900056), 'https://board.wiwo.me/admin/tasks/view/900056')
  assert.equal(urlClasica('espacio-cliente', 13), 'https://board.wiwo.me/clients/project/13')
})

test('un id invalido no arma un enlace roto', () => {
  process.env.NEXT_PUBLIC_BOARD_URL = 'https://board.wiwo.me'
  assert.equal(urlClasica('proceso', 0), null)
  assert.equal(urlClasica('proceso', -1), null)
  assert.equal(urlClasica('proceso', 1.5), null)
  assert.equal(urlClasica('proceso', Number.NaN), null)

  delete process.env.NEXT_PUBLIC_BOARD_URL
})
