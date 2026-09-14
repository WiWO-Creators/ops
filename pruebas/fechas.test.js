/**
 * Pruebas de formateo de fechas.
 *
 * Cubren el corrimiento de un dia: la API manda instantes UTC y fechas sin hora, y tratarlas igual
 * hace que un vencimiento aparezca el dia anterior en cualquier huso al oeste de Greenwich. Es un bug
 * que no se nota en el servidor y si en la pantalla de quien trabaja.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aFechaDelContrato,
  aFechaLocal,
  enmascararFechaLocal,
  estadoVencimiento,
  formatearFecha,
  formatearRelativo,
  formatearVencimiento,
  SIN_VENCIMIENTO
} from '../src/lib/fechas.ts'

test('una fecha sin hora no se corre de dia', () => {
  // `new Date('2026-08-24')` daria 23 de agosto en Argentina. El texto tiene que decir 24.
  assert.match(formatearFecha('2026-08-24'), /24/)
})

test('la fecha se muestra compacta, sin los "de" que la parten en dos lineas', () => {
  // "24 de ago. de 2026" en una celda angosta ocupa dos lineas y sube el alto de la fila entera.
  const texto = formatearFecha('2026-08-24')
  assert.doesNotMatch(texto, / de /)
  assert.doesNotMatch(texto, /\./)
  // Espacio duro: en una columna angosta la fecha tiene que desbordar antes que partirse.
  assert.match(texto, /^\d{2}\u00a0\w+\u00a0\d{4}$/)
})

test('un valor ausente da el guion largo, no "Invalid Date"', () => {
  assert.equal(formatearFecha(null), '—')
  assert.equal(formatearFecha(undefined), '—')
  assert.equal(formatearFecha(''), '—')
})

test('una fecha con basura no rompe la pantalla', () => {
  assert.equal(formatearFecha('no-es-una-fecha'), '—')
  assert.equal(formatearRelativo('no-es-una-fecha'), '—')
})

test('un instante ISO se formatea con la hora cuando se pide', () => {
  const sinHora = formatearFecha('2026-08-24T14:03:00Z')
  const conHora = formatearFecha('2026-08-24T14:03:00Z', true)
  assert.ok(conHora.length > sinHora.length)
  assert.match(conHora, /\d{2}:\d{2}/)
})

test('el relativo mira hacia atras y hacia adelante', () => {
  const ahora = new Date('2026-08-24T12:00:00Z')
  assert.match(formatearRelativo('2026-08-21T12:00:00Z', ahora), /3/)
  assert.match(formatearRelativo('2026-09-07T12:00:00Z', ahora), /2/)
})

test('el vencimiento se compara por dia, no por instante', () => {
  // Las 18:00 de un dia cuya tarea vencia a las 09:00 no es "vencido": sigue siendo hoy.
  const tarde = new Date('2026-08-24T18:00:00')
  assert.equal(estadoVencimiento('2026-08-24', tarde), 'hoy')
})

test('clasifica vencido, proximo y lejano', () => {
  const hoy = new Date('2026-08-24T09:00:00')
  assert.equal(estadoVencimiento('2026-08-23', hoy), 'vencido')
  assert.equal(estadoVencimiento('2026-08-26', hoy), 'proximo')
  assert.equal(estadoVencimiento('2026-09-30', hoy), 'lejano')
  assert.equal(estadoVencimiento(null, hoy), 'sin-fecha')
})

test('un instante no se clasifica como vencimiento', () => {
  // Solo las fechas sin hora son plazos. Un instante no es un vencimiento y no debe colorearse.
  assert.equal(estadoVencimiento('2026-08-24T14:03:00Z'), 'sin-fecha')
})

test('un vencimiento ausente se lee "Sin fecha", no como dato que falta', () => {
  // Una tarea puede no tener plazo a proposito. El guion largo la haria pasar por un dato sin cargar.
  assert.equal(formatearVencimiento(null), SIN_VENCIMIENTO)
  assert.equal(formatearVencimiento(undefined), SIN_VENCIMIENTO)
  assert.equal(formatearVencimiento(''), SIN_VENCIMIENTO)
  assert.notEqual(SIN_VENCIMIENTO, '—')
})

test('un vencimiento con fecha se formatea igual que cualquier otra fecha', () => {
  assert.equal(formatearVencimiento('2026-08-24'), formatearFecha('2026-08-24'))
})

test('una tarea sin vencimiento nunca queda clasificada como vencida', () => {
  // El color rojo de la tabla y del tablero sale de aca: sin fecha no hay contra que medir.
  assert.equal(estadoVencimiento(null), 'sin-fecha')
  assert.equal(estadoVencimiento(''), 'sin-fecha')
  assert.equal(estadoVencimiento(undefined), 'sin-fecha')
})

/**
 * Escritura de fechas en formato local.
 *
 * `<input type="date">` ordena dia, mes y año segun el idioma del SISTEMA OPERATIVO, no segun el
 * `lang` del documento: en un equipo en ingles el mismo formulario pide MM/DD/AAAA y quien escribe
 * 03/09 pensando en el 3 de septiembre guarda el 9 de marzo. Estas tres funciones son las que
 * sostienen el campo de texto que lo reemplaza, asi que un error acá es una fecha mal guardada.
 */

test('una fecha del contrato se lee en el orden de acá', () => {
  assert.equal(aFechaLocal('2026-12-31'), '31/12/2026')
  assert.equal(aFechaLocal('2026-01-05'), '05/01/2026')
})

test('lo que no es una fecha del contrato vuelve intacto, para no borrar lo que se esta tipeando', () => {
  assert.equal(aFechaLocal('31/1'), '31/1')
  assert.equal(aFechaLocal(''), '')
  assert.equal(aFechaLocal(null), '')
  assert.equal(aFechaLocal(undefined), '')
})

test('lo escrito vuelve al formato que viaja a la API', () => {
  assert.equal(aFechaDelContrato('31/12/2026'), '2026-12-31')
  assert.equal(aFechaDelContrato(' 05/01/2026 '), '2026-01-05')
})

test('una fecha a medio escribir todavia no es una fecha', () => {
  assert.equal(aFechaDelContrato('31/12/20'), null)
  assert.equal(aFechaDelContrato('31/12'), null)
  assert.equal(aFechaDelContrato(''), null)
  assert.equal(aFechaDelContrato(null), null)
  assert.equal(aFechaDelContrato(undefined), null)
})

test('un dia que no existe se rechaza en vez de correrse al mes siguiente', () => {
  // `Date` desborda en silencio: el 31 de febrero se vuelve el 3 de marzo, y ese dato despues nadie
  // entiende de donde salio.
  assert.equal(aFechaDelContrato('31/02/2026'), null)
  assert.equal(aFechaDelContrato('29/02/2025'), null)
  assert.equal(aFechaDelContrato('29/02/2024'), '2024-02-29')
  assert.equal(aFechaDelContrato('00/01/2026'), null)
  assert.equal(aFechaDelContrato('01/13/2026'), null)
})

test('el ida y vuelta no corre el dia', () => {
  for (const fecha of ['2026-01-01', '2026-02-29', '2024-02-29', '2026-12-31', '2026-07-15']) {
    const local = aFechaLocal(fecha)
    const vuelta = aFechaDelContrato(local)

    // El 29/02/2026 no existe: `aFechaLocal` lo escribe igual porque solo reordena, y es
    // `aFechaDelContrato` quien lo ataja. Los que existen tienen que volver identicos.
    assert.equal(vuelta, fecha === '2026-02-29' ? null : fecha)
  }
})

test('la mascara pone las barras sola y no deja entrar nada que no sea un digito', () => {
  assert.equal(enmascararFechaLocal('3'), '3')
  assert.equal(enmascararFechaLocal('31'), '31')
  assert.equal(enmascararFechaLocal('312'), '31/2')
  assert.equal(enmascararFechaLocal('31122026'), '31/12/2026')
  assert.equal(enmascararFechaLocal('31/12/2026'), '31/12/2026')
  assert.equal(enmascararFechaLocal('31-12-2026'), '31/12/2026')
  assert.equal(enmascararFechaLocal('31 12 2026'), '31/12/2026')
  assert.equal(enmascararFechaLocal('abc'), '')
  assert.equal(enmascararFechaLocal(''), '')
})

test('la mascara corta en ocho digitos: no hay fecha mas larga', () => {
  assert.equal(enmascararFechaLocal('311220269999'), '31/12/2026')
})
