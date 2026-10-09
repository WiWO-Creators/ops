/**
 * Reintento seguro de escrituras con red lenta.
 *
 * Una escritura sin respuesta se reintenta con la misma clave, se comprueba el estado real antes de
 * rendirse y un POST sin idempotencia en el servidor nunca se repite.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mutarConReintento } from '../src/datos/reintento.ts'

const INCIERTA = { ok: false, mensaje: 'no sabemos', incierta: true }
const OK = { ok: true, datos: { id: 1 } }
const sinEspera = async () => {}

test('si responde a la primera no reintenta', async () => {
  let llamadas = 0
  const r = await mutarConReintento(async () => { llamadas++; return OK }, { metodo: 'PATCH', esperar: sinEspera })

  assert.equal(r.ok, true)
  assert.equal(llamadas, 1)
})

test('un error definitivo no se reintenta', async () => {
  let llamadas = 0
  const r = await mutarConReintento(async () => { llamadas++; return { ok: false, mensaje: 'prohibido', estado: 403 } }, { metodo: 'PATCH', esperar: sinEspera })

  assert.equal(r.ok, false)
  assert.equal(llamadas, 1)
})

test('reintenta con la misma clave hasta que responde', async () => {
  const claves = []
  const respuestas = [INCIERTA, INCIERTA, OK]
  const r = await mutarConReintento(async (clave) => { claves.push(clave); return respuestas.shift() }, { metodo: 'PATCH', esperar: sinEspera })

  assert.equal(r.ok, true)
  assert.equal(claves.length, 3)
  assert.equal(new Set(claves).size, 1)
})

test('si el estado real ya coincide, da por aplicada sin reintentar', async () => {
  let llamadas = 0
  const r = await mutarConReintento(async () => { llamadas++; return INCIERTA }, {
    metodo: 'PATCH', esperar: sinEspera, yaAplicada: async () => true
  })

  assert.equal(r.ok, true)
  assert.equal(r.verificada, true)
  assert.equal(llamadas, 1)
})

test('una incierta que nadie logra aclarar sigue incierta tras los reintentos', async () => {
  let llamadas = 0
  const r = await mutarConReintento(async () => { llamadas++; return INCIERTA }, {
    metodo: 'DELETE', esperar: sinEspera, yaAplicada: async () => false
  })

  assert.equal(r.ok, false)
  assert.equal(r.incierta, true)
  assert.equal(llamadas, 3)
})

test('un POST no se repite mientras el servidor no sea idempotente', async () => {
  let llamadas = 0
  const r = await mutarConReintento(async () => { llamadas++; return INCIERTA }, {
    metodo: 'POST', esperar: sinEspera, servidorIdempotente: false
  })

  assert.equal(r.incierta, true)
  assert.equal(llamadas, 1)
})

test('un POST con servidor idempotente se reintenta con la misma clave', async () => {
  const claves = []
  const respuestas = [INCIERTA, OK]
  const r = await mutarConReintento(async (clave) => { claves.push(clave); return respuestas.shift() }, {
    metodo: 'POST', esperar: sinEspera, servidorIdempotente: true
  })

  assert.equal(r.ok, true)
  assert.equal(new Set(claves).size, 1)
  assert.equal(claves.length, 2)
})

test('un fallo al comprobar el estado no rompe el reintento', async () => {
  const respuestas = [INCIERTA, OK]
  const r = await mutarConReintento(async () => respuestas.shift(), {
    metodo: 'PATCH', esperar: sinEspera, yaAplicada: async () => { throw new Error('red') }
  })

  assert.equal(r.ok, true)
})
