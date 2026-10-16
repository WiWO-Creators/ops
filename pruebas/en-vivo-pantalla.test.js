/**
 * Pruebas de las pantallas de oficina en «Ops en vivo» (fase 7).
 *
 * Lo que se protege: que el boleto de un televisor solo salga para un código real con `en_vivo`
 * encendido y que valga únicamente para la sala `pantallas` (sin id); que el sondeo pase a respaldo de
 * cinco minutos solo con el socket conectado; y que los avisos del bus no hagan pedir más seguido
 * que cada cinco segundos.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverBoletoDePantalla } from '../src/lib/en-vivo/boleto-pantalla.ts'
import { verificarBoleto } from '../src/lib/en-vivo/boleto.ts'
import {
  debeConectarPantalla,
  ESPERA_MINIMA_ENTRE_PEDIDOS_MS,
  esperaParaPedirDeNuevo,
  intervaloDeSondeoDePantalla
} from '../src/dominio/pantalla-en-vivo.ts'

const SECRETO = 'p'.repeat(32)
const URL_SERVICIO = 'wss://ops.wiwo.me/en-vivo'

/** Una entrada válida; cada prueba cambia solo lo que quiere romper. */
function entrada (cambios = {}) {
  return {
    codigo: 'ABC23',
    url: URL_SERVICIO,
    secreto: SECRETO,
    leerPantalla: async () => ({ estado: 200, enVivo: true }),
    ...cambios
  }
}

test('un codigo con forma invalida da 404 sin llamar a la API', async () => {
  let llamadas = 0
  const leerPantalla = async () => { llamadas += 1; return { estado: 200, enVivo: true } }

  for (const codigo of ['', 'ABC2', 'ABC234', 'ABC0O', 'AB/..', '../x12', 'AB C2']) {
    const resultado = await resolverBoletoDePantalla(entrada({ codigo, leerPantalla }))

    assert.equal(resultado.estado, 404, codigo)
    assert.deepEqual(resultado.cuerpo, { error: { code: 'not_found' } })
  }

  assert.equal(llamadas, 0)
})

test('una pantalla que la API no conoce da 404', async () => {
  const resultado = await resolverBoletoDePantalla(entrada({ leerPantalla: async () => ({ estado: 404, enVivo: false }) }))

  assert.equal(resultado.estado, 404)
  assert.deepEqual(resultado.cuerpo, { error: { code: 'not_found' } })
})

test('si la API falla o no contesta, 503 upstream_down y no un boleto', async () => {
  const caida = await resolverBoletoDePantalla(entrada({ leerPantalla: async () => { throw new TypeError('fetch failed') } }))
  const error = await resolverBoletoDePantalla(entrada({ leerPantalla: async () => ({ estado: 500, enVivo: false }) }))

  for (const resultado of [caida, error]) {
    assert.equal(resultado.estado, 503)
    assert.deepEqual(resultado.cuerpo, { error: { code: 'upstream_down' } })
  }
})

test('sin meta.en_vivo, sin URL o sin secreto el servicio figura apagado', async () => {
  const apagadoEnBoard = entrada({ leerPantalla: async () => ({ estado: 200, enVivo: false }) })
  const sinUrl = entrada({ url: '' })
  const sinSecreto = entrada({ secreto: null })

  for (const caso of [apagadoEnBoard, sinUrl, sinSecreto]) {
    const resultado = await resolverBoletoDePantalla(caso)

    assert.equal(resultado.estado, 503)
    assert.deepEqual(resultado.cuerpo, { error: { code: 'en_vivo_apagado' } })
  }
})

test('el boleto de un televisor lleva solo la sala pantallas, con id 0 y sin documento', async () => {
  const resultado = await resolverBoletoDePantalla(entrada({ codigo: 'abc23' }))

  assert.equal(resultado.estado, 200)

  const { boleto, expira_en: expira, url } = resultado.cuerpo.data
  const payload = verificarBoleto(boleto, SECRETO)

  assert.equal(url, URL_SERVICIO)
  assert.equal(payload.exp, expira)
  assert.equal(payload.suj, 'pantalla')
  assert.equal(payload.id, 0)
  assert.deepEqual(payload.salas, ['pantallas'])
  assert.equal(payload.doc, null)
  assert.equal(payload.esp, null)
})

test('con el socket conectado el sondeo es respaldo de cinco minutos como minimo', () => {
  assert.equal(intervaloDeSondeoDePantalla(30, false), 30_000)
  assert.equal(intervaloDeSondeoDePantalla(30, true), 300_000)
  assert.equal(intervaloDeSondeoDePantalla(600, true), 600_000)
  assert.equal(intervaloDeSondeoDePantalla(600, false), 600_000)
})

test('un aviso del bus no hace pedir antes de cinco segundos desde el ultimo pedido', () => {
  assert.equal(ESPERA_MINIMA_ENTRE_PEDIDOS_MS, 5000)
  assert.equal(esperaParaPedirDeNuevo(null, 1000), 0)
  assert.equal(esperaParaPedirDeNuevo(10_000, 10_000), 5000)
  assert.equal(esperaParaPedirDeNuevo(10_000, 12_000), 3000)
  assert.equal(esperaParaPedirDeNuevo(10_000, 15_000), 0)
  assert.equal(esperaParaPedirDeNuevo(10_000, 99_000), 0)
})

test('la pantalla solo conecta si el board lo declara y hay URL', () => {
  assert.equal(debeConectarPantalla(true, URL_SERVICIO), true)
  assert.equal(debeConectarPantalla(true, ''), false)
  assert.equal(debeConectarPantalla(false, URL_SERVICIO), false)
  assert.equal(debeConectarPantalla(undefined, URL_SERVICIO), false)
})
