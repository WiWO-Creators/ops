/**
 * Pruebas de la secuencia de lecturas del modal de ticket: la lectura mas nueva gana y una escritura
 * confirmada no se deshace con una lectura que salio antes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SECUENCIA_INICIAL,
  confirmarEscritura,
  pedirLectura,
  recibirLectura
} from '../src/dominio/ticket-secuencia.ts'

test('las lecturas toman numeros crecientes y una secuencia nueva no aplica nada todavia', () => {
  const primera = pedirLectura(SECUENCIA_INICIAL)
  const segunda = pedirLectura(primera.secuencia)

  assert.equal(primera.numero, 1)
  assert.equal(segunda.numero, 2)
  assert.equal(segunda.secuencia.aplicadas, 0)
})

test('una lectura lenta que llega despues de una mas nueva se descarta', () => {
  const lenta = pedirLectura(SECUENCIA_INICIAL)
  const rapida = pedirLectura(lenta.secuencia)
  const trasRapida = recibirLectura(rapida.secuencia, rapida.numero)
  const trasLenta = recibirLectura(trasRapida.secuencia, lenta.numero)

  assert.equal(trasRapida.aplica, true)
  assert.equal(trasLenta.aplica, false)
  assert.equal(trasLenta.secuencia, trasRapida.secuencia)
})

test('las lecturas en orden se aplican todas', () => {
  const a = pedirLectura(SECUENCIA_INICIAL)
  const b = pedirLectura(a.secuencia)
  const trasA = recibirLectura(b.secuencia, a.numero)
  const trasB = recibirLectura(trasA.secuencia, b.numero)

  assert.equal(trasA.aplica, true)
  assert.equal(trasB.aplica, true)
  assert.equal(trasB.secuencia.aplicadas, 2)
})

test('una lectura puede aplicarse dos veces si lleva el mismo numero', () => {
  const lectura = pedirLectura(SECUENCIA_INICIAL)
  const una = recibirLectura(lectura.secuencia, lectura.numero)

  assert.equal(recibirLectura(una.secuencia, lectura.numero).aplica, true)
})

test('una escritura confirmada invalida las lecturas que salieron antes', () => {
  const enVuelo = pedirLectura(SECUENCIA_INICIAL)
  const escrita = confirmarEscritura(enVuelo.secuencia)
  const llegada = recibirLectura(escrita, enVuelo.numero)

  assert.equal(llegada.aplica, false)
  assert.equal(escrita.aplicadas, escrita.solicitadas)
})

test('despues de una escritura, la lectura siguiente si se aplica', () => {
  const escrita = confirmarEscritura(pedirLectura(SECUENCIA_INICIAL).secuencia)
  const refresco = pedirLectura(escrita)

  assert.equal(recibirLectura(refresco.secuencia, refresco.numero).aplica, true)
})
