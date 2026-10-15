/**
 * Pruebas de la firma HMAC entre el board y el servicio de «Ops en vivo».
 *
 * Lo que se protege: que el esquema firmado sea exactamente el que implementa el lado PHP
 * (`marca \n nonce \n METODO \n ruta \n sha256(cuerpo)`), que una petición alterada o repetida no pase
 * y que el secreto corto se rechace antes de firmar nada.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import {
  AlmacenDeNonces,
  CABECERA_FIRMA,
  CABECERA_MARCA,
  CABECERA_NONCE,
  firmar,
  rutaCanonica,
  verificarFirma
} from '../src/lib/en-vivo/firma.ts'

const SECRETO = 'a'.repeat(32)
const AHORA = 1_792_080_000
const CUERPO = '{"eventos":[]}'

function cabecerasDe (firmadas) {
  return { marca: firmadas[CABECERA_MARCA], nonce: firmadas[CABECERA_NONCE], firma: firmadas[CABECERA_FIRMA] }
}

test('la firma sigue el esquema que implementa el board', () => {
  const firmadas = firmar(SECRETO, 'post', '/interno/eventos?x=1', CUERPO, AHORA)
  const huella = createHash('sha256').update(CUERPO).digest('hex')
  const esperada = 'v1=' + createHmac('sha256', SECRETO)
    .update(`${AHORA}\n${firmadas[CABECERA_NONCE]}\nPOST\ninterno/eventos\n${huella}`)
    .digest('hex')

  assert.equal(firmadas[CABECERA_MARCA], String(AHORA))
  assert.match(firmadas[CABECERA_NONCE], /^[0-9a-f]{32}$/)
  assert.equal(firmadas[CABECERA_FIRMA], esperada)
})

test('una petición bien firmada pasa', () => {
  const firmadas = firmar(SECRETO, 'POST', 'interno/eventos', CUERPO, AHORA)

  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, cabecerasDe(firmadas), AHORA), 'ok')
})

test('ruta, método o cuerpo alterados invalidan la firma', () => {
  const firmadas = firmar(SECRETO, 'PUT', 'en-vivo/actas/12', CUERPO, AHORA)
  const cabeceras = cabecerasDe(firmadas)

  assert.equal(verificarFirma(SECRETO, 'PUT', 'en-vivo/actas/13', CUERPO, cabeceras, AHORA), 'firma_invalida')
  assert.equal(verificarFirma(SECRETO, 'GET', 'en-vivo/actas/12', CUERPO, cabeceras, AHORA), 'firma_invalida')
  assert.equal(verificarFirma(SECRETO, 'PUT', 'en-vivo/actas/12', CUERPO + ' ', cabeceras, AHORA), 'firma_invalida')
  assert.equal(verificarFirma('b'.repeat(32), 'PUT', 'en-vivo/actas/12', CUERPO, cabeceras, AHORA), 'firma_invalida')
})

test('la ruta se canoniza: sin query, sin barras de los extremos', () => {
  assert.equal(rutaCanonica('/interno/actas/12/aplicar?x=1#y'), 'interno/actas/12/aplicar')
  assert.equal(rutaCanonica('en-vivo/actas/12/'), 'en-vivo/actas/12')

  const firmadas = firmar(SECRETO, 'GET', '/en-vivo/actas/12?cache=1', '', AHORA)

  assert.equal(verificarFirma(SECRETO, 'GET', 'en-vivo/actas/12', '', cabecerasDe(firmadas), AHORA), 'ok')
})

test('la ventana es de 60 segundos hacia los dos lados', () => {
  const firmadas = firmar(SECRETO, 'POST', 'interno/eventos', CUERPO, AHORA)
  const cabeceras = cabecerasDe(firmadas)

  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, cabeceras, AHORA + 60), 'ok')
  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, cabeceras, AHORA - 60), 'ok')
  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, cabeceras, AHORA + 61), 'fuera_de_ventana')
  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, cabeceras, AHORA - 61), 'fuera_de_ventana')
})

test('faltan cabeceras o el nonce no tiene la forma esperada', () => {
  const firmadas = firmar(SECRETO, 'POST', 'interno/eventos', CUERPO, AHORA)
  const cabeceras = cabecerasDe(firmadas)

  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, {}, AHORA), 'sin_cabeceras')
  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, { ...cabeceras, firma: null }, AHORA), 'sin_cabeceras')
  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, { ...cabeceras, nonce: 'corto' }, AHORA), 'nonce_invalido')
  assert.equal(verificarFirma(SECRETO, 'POST', 'interno/eventos', CUERPO, { ...cabeceras, marca: 'abc' }, AHORA), 'fuera_de_ventana')
})

test('un secreto de menos de 32 caracteres no firma ni verifica', () => {
  assert.throws(() => firmar('corto', 'GET', 'x', '', AHORA), /32 caracteres/)

  const firmadas = firmar(SECRETO, 'GET', 'x', '', AHORA)

  assert.equal(verificarFirma('corto', 'GET', 'x', '', cabecerasDe(firmadas), AHORA), 'firma_invalida')
})

test('el almacén de nonces rechaza la repetición dentro del TTL y la olvida después', () => {
  const almacen = new AlmacenDeNonces(120)

  assert.equal(almacen.registrar('n1', 1_000), true)
  assert.equal(almacen.registrar('n1', 60_000), false)
  assert.equal(almacen.registrar('n2', 60_000), true)
  // Pasados 120 s desde el primero, ya se olvidó; el segundo sigue recordado.
  assert.equal(almacen.registrar('n1', 121_001), true)
  assert.equal(almacen.registrar('n2', 121_001), false)
})
