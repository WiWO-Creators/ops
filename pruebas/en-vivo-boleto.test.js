/**
 * Pruebas del boleto de «Ops en vivo».
 *
 * Lo que se protege: que un boleto vencido, con la firma tocada, de otra versión, con demasiadas
 * salas o con la sala de otra persona no abra nada, aunque quien lo fabrique conozca el formato.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { emitirBoleto, TTL_DE_BOLETO_SEGUNDOS, verificarBoleto } from '../src/lib/en-vivo/boleto.ts'

const SECRETO = 'b'.repeat(32)
const AHORA = 1_792_080_000

/** Fabrica un boleto con payload arbitrario y la firma correcta, para probar lo que `emitirBoleto` impide. */
function fabricar (payload, secreto = SECRETO) {
  const parte = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const firma = createHmac('sha256', secreto).update(parte).digest('base64url')

  return `${parte}.${firma}`
}

const BASE = { v: 1, suj: 'staff', id: 7, salas: ['staff:7', 'equipo'], doc: null, esp: null, exp: AHORA + 100, jti: '0123456789abcdef' }

test('emitir y verificar devuelve el payload con 120 s de vida', () => {
  const { boleto, exp } = emitirBoleto({ suj: 'staff', id: 7, salas: ['staff:7', 'equipo', 'espacio:3'], doc: 'acta:12', esp: 3 }, SECRETO, AHORA)
  const payload = verificarBoleto(boleto, SECRETO, AHORA + 10)

  assert.equal(exp, AHORA + TTL_DE_BOLETO_SEGUNDOS)
  assert.equal(TTL_DE_BOLETO_SEGUNDOS, 120)
  assert.deepEqual({ ...payload, jti: undefined }, {
    v: 1, suj: 'staff', id: 7, salas: ['staff:7', 'equipo', 'espacio:3'], doc: 'acta:12', esp: 3, esc: true, exp, jti: undefined
  })
  assert.match(payload.jti, /^[0-9a-f]{16}$/)
})

test('la escritura viaja en el boleto: por defecto sí, y `escritura: false` lo deja en solo lectura', () => {
  const sinDecir = emitirBoleto({ suj: 'staff', id: 7, salas: ['equipo'], doc: 'tarea:5' }, SECRETO, AHORA).boleto
  const soloLectura = emitirBoleto({ suj: 'staff', id: 7, salas: ['equipo'], doc: 'tarea:5', escritura: false }, SECRETO, AHORA).boleto
  const conEscritura = emitirBoleto({ suj: 'staff', id: 7, salas: ['equipo'], doc: 'tarea:5', escritura: true }, SECRETO, AHORA).boleto

  assert.equal(verificarBoleto(sinDecir, SECRETO, AHORA).esc, true)
  assert.equal(verificarBoleto(conEscritura, SECRETO, AHORA).esc, true)
  assert.equal(verificarBoleto(soloLectura, SECRETO, AHORA).esc, false)
})

test('un boleto anterior, sin el campo de escritura, sigue valiendo y cuenta como con escritura', () => {
  assert.equal(verificarBoleto(fabricar(BASE), SECRETO, AHORA).esc, true)
  assert.equal(verificarBoleto(fabricar({ ...BASE, esc: false }), SECRETO, AHORA).esc, false)
  assert.equal(verificarBoleto(fabricar({ ...BASE, esc: 'no' }), SECRETO, AHORA), null, 'un valor que no es booleano no vale')
})

test('un boleto vencido no vale, ni en el segundo exacto del vencimiento', () => {
  const { boleto, exp } = emitirBoleto({ suj: 'staff', id: 7, salas: ['equipo'] }, SECRETO, AHORA)

  assert.notEqual(verificarBoleto(boleto, SECRETO, exp - 1), null)
  assert.equal(verificarBoleto(boleto, SECRETO, exp), null)
  assert.equal(verificarBoleto(boleto, SECRETO, exp + 500), null)
})

test('la firma tocada, el payload tocado o otro secreto lo invalidan', () => {
  const { boleto } = emitirBoleto({ suj: 'staff', id: 7, salas: ['equipo'] }, SECRETO, AHORA)
  const [parte, firma] = boleto.split('.')
  const otroPayload = Buffer.from(JSON.stringify({ ...BASE, id: 8 })).toString('base64url')

  assert.equal(verificarBoleto(`${parte}.${firma.slice(0, -2)}AA`, SECRETO, AHORA), null)
  assert.equal(verificarBoleto(`${otroPayload}.${firma}`, SECRETO, AHORA), null)
  assert.equal(verificarBoleto(boleto, 'c'.repeat(32), AHORA), null)
  assert.equal(verificarBoleto(boleto, 'corto', AHORA), null)
})

test('formas inválidas se rechazan sin lanzar', () => {
  for (const texto of ['', 'sin-punto', 'a.b.c', '.', 'ñ.ñ', null, undefined, 42, {}]) {
    assert.equal(verificarBoleto(texto, SECRETO, AHORA), null)
  }

  assert.equal(verificarBoleto('x'.repeat(5000), SECRETO, AHORA), null)
})

test('una versión distinta de 1 se rechaza aunque la firma sea buena', () => {
  assert.notEqual(verificarBoleto(fabricar(BASE), SECRETO, AHORA), null)
  assert.equal(verificarBoleto(fabricar({ ...BASE, v: 2 }), SECRETO, AHORA), null)
})

test('más de 20 salas se rechaza al emitir y al verificar', () => {
  const salas = Array.from({ length: 21 }, (_, i) => `espacio:${i + 1}`)

  assert.throws(() => emitirBoleto({ suj: 'staff', id: 7, salas }, SECRETO, AHORA), /20 salas/)
  assert.equal(verificarBoleto(fabricar({ ...BASE, salas }), SECRETO, AHORA), null)

  const justas = salas.slice(0, 20)

  assert.notEqual(verificarBoleto(fabricar({ ...BASE, salas: justas }), SECRETO, AHORA), null)
})

test('una sala ajena al sujeto no entra: ni al emitir ni al verificar', () => {
  // Staff con la sala personal de otra persona, la de un cliente o la de pantallas.
  for (const ajena of ['staff:99', 'cliente:5', 'pantallas']) {
    assert.throws(() => emitirBoleto({ suj: 'staff', id: 7, salas: [ajena] }, SECRETO, AHORA), /no corresponde/)
    assert.equal(verificarBoleto(fabricar({ ...BASE, salas: [ajena] }), SECRETO, AHORA), null)
  }

  // Un contacto solo puede nombrar salas de cliente; una pantalla, solo `pantallas`.
  assert.equal(verificarBoleto(fabricar({ ...BASE, suj: 'contacto', salas: ['equipo'] }), SECRETO, AHORA), null)
  assert.notEqual(verificarBoleto(fabricar({ ...BASE, suj: 'contacto', salas: ['cliente:5'] }), SECRETO, AHORA), null)
  assert.equal(verificarBoleto(fabricar({ ...BASE, suj: 'pantalla', id: 0, salas: ['equipo'] }), SECRETO, AHORA), null)
  assert.notEqual(verificarBoleto(fabricar({ ...BASE, suj: 'pantalla', id: 0, salas: ['pantallas'] }), SECRETO, AHORA), null)
})

test('una sala con forma inválida se rechaza', () => {
  assert.equal(verificarBoleto(fabricar({ ...BASE, salas: ['espacio:abc'] }), SECRETO, AHORA), null)
  assert.equal(verificarBoleto(fabricar({ ...BASE, salas: ['recurso:orden:1'] }), SECRETO, AHORA), null)
})

test('emitir con un secreto corto lanza', () => {
  assert.throws(() => emitirBoleto({ suj: 'staff', id: 7, salas: [] }, 'corto', AHORA), /32 caracteres/)
})
