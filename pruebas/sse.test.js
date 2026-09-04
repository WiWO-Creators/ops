/**
 * Pruebas del splitter de Server-Sent Events.
 *
 * Es la prueba mas valiosa de la capa de IA, y no porque el codigo sea dificil: porque su fallo es
 * mudo. Un splitter que corta mal no lanza nada — se come el ultimo frame, o parte uno por la mitad
 * y el JSON deja de parsear — y el sintoma es una respuesta truncada que parece del modelo. Sin esta
 * prueba, la unica forma de enterarse es que alguien note que el resumen "termina raro".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirEventos } from '../src/datos/sse.ts'

const frame = (evento, datos) => `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`

test('un frame completo sale entero y no deja resto', () => {
  const { eventos, resto } = partirEventos(frame('delta', { t: 'Hoy tenés ' }))

  assert.deepEqual(eventos, ['event: delta\ndata: {"t":"Hoy tenés "}'])
  assert.equal(resto, '')
})

test('un frame partido entre dos chunks se rearma', () => {
  // El caso real: TCP no respeta los limites del protocolo y el corte cae donde cae.
  const completo = frame('delta', { t: 'Quedaron 3 tareas' })
  const mitad = Math.floor(completo.length / 2)

  const primera = partirEventos(completo.slice(0, mitad))
  assert.deepEqual(primera.eventos, [], 'un frame a medias no se entrega')

  const segunda = partirEventos(primera.resto + completo.slice(mitad))
  assert.equal(segunda.eventos.length, 1)
  assert.match(segunda.eventos[0], /"t":"Quedaron 3 tareas"/)
  assert.equal(segunda.resto, '')
})

test('los saltos \\r\\n cuentan igual que los \\n', () => {
  const crudo = 'event: delta\r\ndata: {"t":"a"}\r\n\r\nevent: fin\r\ndata: {}\r\n\r\n'
  const { eventos, resto } = partirEventos(crudo)

  assert.equal(eventos.length, 2)
  assert.equal(eventos[0], 'event: delta\ndata: {"t":"a"}')
  assert.equal(eventos[1], 'event: fin\ndata: {}')
  assert.equal(resto, '')
})

test('un \\r\\n partido entre dos chunks no inventa un fin de frame', () => {
  // El `\r` es el ultimo byte del chunk y su `\n` llega en el siguiente. Si se normalizara ahi
  // mismo, el `\r` se volveria `\n` y con el anterior formaria una linea en blanco: el frame se
  // partiria por la mitad y su JSON dejaria de parsear.
  const primera = partirEventos('event: delta\ndata: {"t":"a"}\r')
  assert.deepEqual(primera.eventos, [])

  const segunda = partirEventos(primera.resto + '\n\r\n')
  assert.deepEqual(segunda.eventos, ['event: delta\ndata: {"t":"a"}'])
})

test('varios data: en un mismo frame no lo parten en dos', () => {
  // El separador es la linea EN BLANCO, no el salto de linea. Partir por `\n` daria dos eventos
  // rotos donde hay uno solo.
  const { eventos, resto } = partirEventos('event: citas\ndata: {"citas":\ndata: []}\n\n')

  assert.equal(eventos.length, 1)
  assert.equal(eventos[0], 'event: citas\ndata: {"citas":\ndata: []}')
  assert.equal(resto, '')
})

test('el frame incompleto queda en resto y no se pierde', () => {
  const { eventos, resto } = partirEventos(frame('delta', { t: 'uno' }) + 'event: delta\ndata: {"t":"do')

  assert.equal(eventos.length, 1)
  assert.equal(resto, 'event: delta\ndata: {"t":"do')
})

test('los frames vacios se descartan', () => {
  // Dos lineas en blanco juntas, o el arranque de un stream que abre con un salto: ninguno es un
  // evento, y entregarlos obligaria a que cada consumidor los filtre.
  const { eventos, resto } = partirEventos('\n\n' + frame('fin', {}) + '\n\n')

  assert.deepEqual(eventos, ['event: fin\ndata: {}'])
  assert.equal(resto, '')
})

test('un buffer vacio no produce nada', () => {
  assert.deepEqual(partirEventos(''), { eventos: [], resto: '' })
})

test('varios frames en un solo chunk salen todos, en orden', () => {
  // El proveedor manda rafagas: es normal que tres deltas lleguen juntos.
  const crudo = frame('delta', { t: 'a' }) + frame('delta', { t: 'b' }) + frame('delta', { t: 'c' })
  const { eventos } = partirEventos(crudo)

  assert.deepEqual(eventos.map((e) => JSON.parse(e.split('data: ')[1]).t), ['a', 'b', 'c'])
})

test('un comentario de keepalive no rompe el corte', () => {
  // La API real manda `: ping` cada 15 segundos sin token. Es un frame valido del protocolo y tiene
  // que salir como tal: quien lo interpreta lo descarta, el splitter no decide eso.
  const { eventos, resto } = partirEventos(': ping\n\n' + frame('delta', { t: 'a' }))

  assert.deepEqual(eventos, [': ping', 'event: delta\ndata: {"t":"a"}'])
  assert.equal(resto, '')
})
