/**
 * Pruebas del borde de la capa de IA.
 *
 * `leerEventoIA()` es un trust boundary de verdad: el texto viene de la red y lo escribio un modelo.
 * Lo que se verifica no es que entienda lo bueno —eso se ve a simple vista— sino que lo malo
 * devuelva `null` en vez de lanzar. Un `TypeError` a mitad de la escritura tumba el panel entero, y
 * el payload que lo provoca no se puede reproducir a pedido.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerEventoIA } from '../src/dominio/ia.ts'

const frame = (evento, datos) => `event: ${evento}\ndata: ${typeof datos === 'string' ? datos : JSON.stringify(datos)}`

test('lee un delta', () => {
  assert.deepEqual(leerEventoIA(frame('delta', { t: 'Hoy tenés ' })), { tipo: 'delta', texto: 'Hoy tenés ' })
})

test('un JSON invalido devuelve null', () => {
  assert.equal(leerEventoIA('event: delta\ndata: {"t":'), null)
  assert.equal(leerEventoIA('event: delta\ndata: no soy json'), null)
})

test('un evento desconocido devuelve null', () => {
  // Si la API agrega un evento nuevo, la version vieja del front lo ignora en vez de romperse.
  assert.equal(leerEventoIA(frame('herramienta', { nombre: 'crear_tarea' })), null)
})

test('un delta con la forma equivocada devuelve null', () => {
  // El campo se llama `t` y es texto. Ni `{"delta": 3}` ni `{"t": 3}` lo son.
  assert.equal(leerEventoIA(frame('delta', { delta: 3 })), null)
  assert.equal(leerEventoIA(frame('delta', { t: 3 })), null)
  assert.equal(leerEventoIA(frame('delta', { t: null })), null)
})

test('un data que no es objeto devuelve null', () => {
  // El contrato dice objeto JSON siempre. Un array o un numero pelado no es un payload.
  assert.equal(leerEventoIA(frame('delta', '["a"]')), null)
  assert.equal(leerEventoIA(frame('delta', '3')), null)
  assert.equal(leerEventoIA(frame('delta', 'null')), null)
})

test('un frame sin event o sin data devuelve null', () => {
  assert.equal(leerEventoIA('data: {"t":"a"}'), null)
  assert.equal(leerEventoIA('event: delta'), null)
  assert.equal(leerEventoIA(': ping'), null)
  assert.equal(leerEventoIA(''), null)
})

test('lee las citas y descarta solo las que vienen mal', () => {
  // Mismo criterio que el backend con `citas_descartadas`: una cita rota desaparece, las demas
  // sobreviven. Perder las tres porque una vino mal seria peor que no citar.
  const evento = leerEventoIA(frame('citas', {
    citas: [
      { tipo: 'tarea', id: 512, titulo: 'Corregir el informe' },
      { tipo: 'inventado', id: 9, titulo: 'x' },
      { tipo: 'hito', id: 'siete', titulo: 'x' },
      { tipo: 'espacio', id: 44, titulo: 'Colbún' }
    ]
  }))

  assert.deepEqual(evento, {
    tipo: 'citas',
    citas: [
      { tipo: 'tarea', id: 512, titulo: 'Corregir el informe' },
      { tipo: 'espacio', id: 44, titulo: 'Colbún' }
    ]
  })
})

test('un bloque de citas que no es lista devuelve null', () => {
  assert.equal(leerEventoIA(frame('citas', { citas: 'ninguna' })), null)
})

test('lee el fin con su cupo y su consumo', () => {
  const evento = leerEventoIA(frame('fin', {
    generado_en: '2026-09-04T12:00:00Z',
    regeneracion: { restantes_hoy: 1, puede_ahora: true, disponible_desde: null, motivo: null },
    uso: { entrada: 3120, salida: 480 }
  }))

  assert.deepEqual(evento, {
    tipo: 'fin',
    generado_en: '2026-09-04T12:00:00Z',
    regeneracion: { restantes_hoy: 1, puede_ahora: true, disponible_desde: null, motivo: null },
    uso: { entrada: 3120, salida: 480 }
  })
})

test('un fin con bloques rotos igual termina el stream', () => {
  // Excepcion deliberada a la estrictez: descartar el `fin` dejaria a la interfaz escribiendo para
  // siempre. Los bloques opcionales caen a `null`; el evento sobrevive.
  const evento = leerEventoIA(frame('fin', { generado_en: 7, regeneracion: { motivo: 'otro' }, uso: 'mucho' }))

  assert.deepEqual(evento, { tipo: 'fin', generado_en: null, regeneracion: null, uso: null })
})

test('lee el error del stream con su codigo', () => {
  // Una vez abierto el stream el HTTP ya es 200: el error viaja como un frame mas, y perderlo deja
  // la interfaz esperando un `fin` que no va a llegar.
  assert.deepEqual(
    leerEventoIA(frame('error', { code: 'provider_error', message: 'El proveedor no respondió.' })),
    { tipo: 'error', codigo: 'provider_error', mensaje: 'El proveedor no respondió.' }
  )

  assert.equal(leerEventoIA(frame('error', { code: 'provider_error' })), null)
})

test('varias lineas data: se concatenan antes de parsear', () => {
  // Lo manda el protocolo. Este contrato siempre usa una sola linea, pero si alguna vez llega
  // partida el JSON se rearma en vez de perderse.
  assert.deepEqual(
    leerEventoIA('event: citas\ndata: {"citas":\ndata: [{"tipo":"tarea","id":1,"titulo":"a"}]}'),
    { tipo: 'citas', citas: [{ tipo: 'tarea', id: 1, titulo: 'a' }] }
  )
})
