/**
 * Pruebas del portal del cliente en «Ops en vivo» (fase 9).
 *
 * Lo que se protege: que el boleto de un contacto solo salga con «en vivo» encendido para su cliente
 * y valga únicamente para la sala de ese cliente (nunca la de otro, nunca una de staff); y que el
 * refresco del portal siga igual de pronto ante un aviso pero deje el minuto como respaldo de cinco
 * solo con el socket conectado.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverBoletoDePortal } from '../src/lib/en-vivo/boleto-portal.ts'
import { emitirBoleto, verificarBoleto } from '../src/lib/en-vivo/boleto.ts'
import {
  AUSENCIA_MINIMA_PORTAL_MS,
  debeRefrescarPortal,
  INTERVALO_REFRESCO_PORTAL_MS,
  intervaloDeRefrescoPortal
} from '../src/datos/refresco-portal.ts'

const SECRETO = 'c'.repeat(32)
const URL_SERVICIO = 'wss://ops.wiwo.me/en-vivo'

/** Una entrada válida; cada prueba cambia solo lo que quiere romper. */
function entrada (cambios = {}) {
  return { yo: { id: 31, client_id: 8, en_vivo: true }, url: URL_SERVICIO, secreto: SECRETO, ...cambios }
}

test('sin sesion de contacto, 401', () => {
  const resultado = resolverBoletoDePortal(entrada({ yo: null }))

  assert.equal(resultado.estado, 401)
  assert.deepEqual(resultado.cuerpo, { error: { code: 'unauthenticated' } })
})

test('un contacto sin client_id valido no recibe boleto', () => {
  for (const client_id of [undefined, null, 0, -3, 1.5, '8', Number.NaN]) {
    const resultado = resolverBoletoDePortal(entrada({ yo: { id: 31, client_id, en_vivo: true } }))

    assert.equal(resultado.estado, 403, String(client_id))
    assert.deepEqual(resultado.cuerpo, { error: { code: 'sala_no_permitida' } })
  }
})

test('sin en_vivo para su cliente, sin URL o sin secreto el servicio figura apagado', () => {
  const casos = [
    entrada({ yo: { id: 31, client_id: 8, en_vivo: false } }),
    entrada({ yo: { id: 31, client_id: 8 } }),
    entrada({ url: '' }),
    entrada({ secreto: null })
  ]

  for (const caso of casos) {
    const resultado = resolverBoletoDePortal(caso)

    assert.equal(resultado.estado, 503)
    assert.deepEqual(resultado.cuerpo, { error: { code: 'en_vivo_apagado' } })
  }
})

test('el boleto de un contacto lleva solo la sala de su cliente', () => {
  const resultado = resolverBoletoDePortal(entrada())

  assert.equal(resultado.estado, 200)

  const { boleto, expira_en: expira, url } = resultado.cuerpo.data
  const payload = verificarBoleto(boleto, SECRETO)

  assert.equal(url, URL_SERVICIO)
  assert.equal(payload.exp, expira)
  assert.equal(payload.suj, 'contacto')
  assert.equal(payload.id, 31)
  assert.deepEqual(payload.salas, ['cliente:8'])
  assert.equal(payload.doc, null)
})

test('un boleto de contacto no puede nombrar salas de staff ni de otro tipo', () => {
  for (const sala of ['equipo', 'staff:31', 'espacio:3', 'recurso:ticket:4', 'pantallas']) {
    assert.throws(() => emitirBoleto({ suj: 'contacto', id: 31, salas: [sala] }, SECRETO), /sala/, sala)
  }
})

test('el intervalo de refresco del portal es un minuto, o cinco con el bus conectado', () => {
  assert.equal(intervaloDeRefrescoPortal(false), INTERVALO_REFRESCO_PORTAL_MS)
  assert.equal(intervaloDeRefrescoPortal(true), 300_000)
})

/** El estado de una pestaña visible y quieta, para variar solo lo que importa. */
function estado (cambios = {}) {
  return { oculto: false, ultimoRefrescoMs: 0, ahoraMs: 0, editando: false, enVuelo: false, ...cambios }
}

test('con el bus conectado el minuto ya no refresca, pero un aviso (escritura) si, de inmediato', () => {
  const alMinuto = estado({ ahoraMs: INTERVALO_REFRESCO_PORTAL_MS })

  assert.equal(debeRefrescarPortal(alMinuto, 'intervalo'), true)
  assert.equal(debeRefrescarPortal({ ...alMinuto, conectado: false }, 'intervalo'), true)
  assert.equal(debeRefrescarPortal({ ...alMinuto, conectado: true }, 'intervalo'), false)
  assert.equal(debeRefrescarPortal({ ...alMinuto, ahoraMs: 299_999, conectado: true }, 'intervalo'), false)
  assert.equal(debeRefrescarPortal({ ...alMinuto, ahoraMs: 300_000, conectado: true }, 'intervalo'), true)

  assert.equal(debeRefrescarPortal(estado({ ahoraMs: 1, conectado: true }), 'escritura'), true)
})

test('un aviso del bus respeta las mismas guardas: oculto, editando o con un refresco en vuelo', () => {
  for (const bloqueo of [{ oculto: true }, { editando: true }, { enVuelo: true }]) {
    assert.equal(debeRefrescarPortal(estado({ ...bloqueo, conectado: true }), 'escritura'), false)
  }
})

test('el regreso a la pestana no cambia con el bus conectado', () => {
  const tras = estado({ ahoraMs: AUSENCIA_MINIMA_PORTAL_MS + 1, conectado: true })

  assert.equal(debeRefrescarPortal(tras, 'regreso'), true)
  assert.equal(debeRefrescarPortal({ ...tras, ahoraMs: AUSENCIA_MINIMA_PORTAL_MS }, 'regreso'), false)
})
