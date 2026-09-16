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
import { textoDeAprobacion } from '../src/definiciones/procesos.ts'
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

/**
 * Lectura de la aprobacion en el listado.
 *
 * Lo que se prueba es que las tres situaciones que antes se veian iguales queden distintas: "nadie
 * se lo pidio al cliente", "el cliente lo tiene y no contesto" y "el cliente contesto". Las dos
 * primeras comparten `estado: 'pendiente'` y significan cosas opuestas para quien tiene que actuar.
 *
 * Y que el numero de rondas aparezca solo cuando hubo mas de una: hasta la migracion 0690 cada
 * pedido nuevo pisaba al anterior y ese dato no existia.
 */

test('sin bloque de aprobacion se lee "No requiere", no un vacio', () => {
  assert.equal(textoDeAprobacion({ approval: undefined }), 'No requiere')
  assert.equal(textoDeAprobacion({ approval: { requerida: false, estado: null, solicitada_en: null, resuelta_en: null, comentario: null } }), 'No requiere')
})

test('pendiente sin pedir no se lee igual que pendiente ya pedida', () => {
  const sinPedir = { requerida: true, estado: 'pendiente', solicitada_en: null, resuelta_en: null, comentario: null }
  const pedida = { requerida: true, estado: 'pendiente', solicitada_en: '2026-09-10 10:00:00', resuelta_en: null, comentario: null }

  assert.equal(textoDeAprobacion({ approval: sinPedir }), 'Sin pedir')
  assert.equal(textoDeAprobacion({ approval: pedida }), 'Pendiente')
})

test('la segunda ronda en adelante se anota; la primera no', () => {
  const base = { requerida: true, estado: 'aprobada', solicitada_en: '2026-09-10 10:00:00', resuelta_en: '2026-09-11 10:00:00', comentario: null }

  assert.equal(textoDeAprobacion({ approval: { ...base, ronda: 1, rondas: 1 } }), 'Aprobada')
  assert.equal(textoDeAprobacion({ approval: { ...base, ronda: 3, rondas: 3 } }), 'Aprobada ×3')
  assert.equal(textoDeAprobacion({ approval: { ...base, estado: 'rechazada', ronda: 2, rondas: 2 } }), 'Rechazada ×2')
})

test('una base sin la migracion 0690 no manda rondas y no se inventa un numero', () => {
  const sinRondas = { requerida: true, estado: 'aprobada', solicitada_en: '2026-09-10 10:00:00', resuelta_en: '2026-09-11 10:00:00', comentario: null }

  assert.equal(textoDeAprobacion({ approval: sinRondas }), 'Aprobada')
})
