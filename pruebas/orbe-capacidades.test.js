/**
 * Pruebas de la lectura de capacidades del orbe (`dominio/orbe-capacidades.ts`).
 *
 * La respuesta viene de la red y de un backend que cambia en paralelo: cualquier campo ausente o
 * inválido tiene que caer a su valor por defecto, y el agente tiene que quedar apagado ante la duda.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerCapacidadesOrbe } from '../src/dominio/orbe-capacidades.ts'
import { MAXIMO_PREGUNTA_AGENTE, UMBRAL_DETENIDA_SEGUNDOS } from '../src/dominio/ia-ejecucion.ts'

const DEFECTO = {
  habilitado: false,
  agente: {
    habilitado: false,
    intervalo_consulta_ms: 1500,
    nuevas_habilitadas: true,
    maximo_pregunta: MAXIMO_PREGUNTA_AGENTE,
    umbral_detenida_segundos: UMBRAL_DETENIDA_SEGUNDOS
  }
}

test('sin datos, con datos que no son un objeto o con el 404 convertido en {} queda todo apagado y por defecto', () => {
  for (const valor of [undefined, null, 'x', 7, [], {}]) assert.deepEqual(leerCapacidadesOrbe(valor), DEFECTO)
})

test('lee el agente completo, incluido el umbral de ejecución detenida', () => {
  const leidas = leerCapacidadesOrbe({
    habilitado: true,
    agente: { habilitado: true, intervalo_consulta_ms: 2500, nuevas_habilitadas: false, maximo_pregunta: 4000, umbral_detenida_segundos: 90 }
  })

  assert.deepEqual(leidas, {
    habilitado: true,
    agente: { habilitado: true, intervalo_consulta_ms: 2500, nuevas_habilitadas: false, maximo_pregunta: 4000, umbral_detenida_segundos: 90 }
  })
})

test('el agente solo está habilitado con true exacto', () => {
  for (const habilitado of ['true', 1, null, undefined]) {
    assert.equal(leerCapacidadesOrbe({ agente: { habilitado } }).agente.habilitado, false)
  }
})

test('un intervalo menor a 500 ms o no numérico cae al defecto', () => {
  for (const intervalo of [0, 499, -1, '1500', null]) {
    assert.equal(leerCapacidadesOrbe({ agente: { intervalo_consulta_ms: intervalo } }).agente.intervalo_consulta_ms, 1500)
  }
  assert.equal(leerCapacidadesOrbe({ agente: { intervalo_consulta_ms: 500 } }).agente.intervalo_consulta_ms, 500)
})

test('el máximo de pregunta y el umbral de detenida exigen enteros positivos', () => {
  for (const valor of [0, -5, 1.5, '10', NaN]) {
    const { agente } = leerCapacidadesOrbe({ agente: { maximo_pregunta: valor, umbral_detenida_segundos: valor } })

    assert.equal(agente.maximo_pregunta, MAXIMO_PREGUNTA_AGENTE)
    assert.equal(agente.umbral_detenida_segundos, 180)
  }
})

test('las solicitudes nuevas están habilitadas salvo que el servidor diga false', () => {
  assert.equal(leerCapacidadesOrbe({ agente: {} }).agente.nuevas_habilitadas, true)
  assert.equal(leerCapacidadesOrbe({ agente: { nuevas_habilitadas: false } }).agente.nuevas_habilitadas, false)
})
