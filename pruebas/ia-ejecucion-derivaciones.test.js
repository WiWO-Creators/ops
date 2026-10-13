/**
 * Pruebas de las derivaciones puras del agente (`dominio/ia-ejecucion.ts`) que antes vivían dentro
 * de `ChatAgente`: qué bloquea el compositor, cuándo se edita el plan, cuándo un snapshot cuenta
 * como «nuevo» y cómo crece el intervalo del seguimiento.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esDescartable,
  esperaReintentoSeguimiento,
  estaBloqueado,
  estaEditando,
  estaPendiente,
  firmaDeEjecucion,
  intervaloSeguimiento,
  leerEjecucion,
  mismaInstantanea,
  motivoBloqueo,
  respondeEjecucion,
  UMBRAL_DETENIDA_SEGUNDOS
} from '../src/dominio/ia-ejecucion.ts'

const PLAN = { id: '1', version: 'v1', resumen: 'r', pasos: [{ id: 'a', descripcion: 'A', estado: 'pendiente' }] }
const ejecucion = (estado, extra = {}) => ({ id: '1', pregunta: 'p', estado, ...extra })
const libre = { enviando: false, conError: false, nuevasHabilitadas: true }

test('editar el plan es esperar confirmación con plan; sin plan es solo pendiente', () => {
  assert.equal(estaEditando(ejecucion('esperando_confirmacion', { plan: PLAN })), true)
  assert.equal(estaEditando(ejecucion('esperando_confirmacion')), false)
  assert.equal(estaEditando(ejecucion('ejecutando', { plan: PLAN })), false)
  assert.equal(estaEditando(undefined), false)
  assert.equal(estaPendiente(ejecucion('esperando_confirmacion', { plan: PLAN })), false)
  assert.equal(estaPendiente(ejecucion('esperando_confirmacion')), true)
})

test('lo escrito responde a la ejecución abierta si edita el plan o esperan datos', () => {
  assert.equal(respondeEjecucion(ejecucion('esperando_datos')), true)
  assert.equal(respondeEjecucion(ejecucion('esperando_confirmacion', { plan: PLAN })), true)
  assert.equal(respondeEjecucion(ejecucion('completada')), false)
  assert.equal(respondeEjecucion(undefined), false)
})

test('pendiente: incompleta y error esperan una decisión; completada y cancelada no', () => {
  for (const estado of ['incompleta', 'error']) assert.equal(estaPendiente(ejecucion(estado)), true)
  for (const estado of ['completada', 'cancelada', 'ejecutando', 'esperando_datos']) assert.equal(estaPendiente(ejecucion(estado)), false)
  assert.equal(estaPendiente(undefined), false)
})

test('descartable: incompleta, o error que no se puede reintentar', () => {
  assert.equal(esDescartable(ejecucion('incompleta')), true)
  assert.equal(esDescartable(ejecucion('error', { error: { codigo: 'x', mensaje: 'm', reintentable: false } })), true)
  assert.equal(esDescartable(ejecucion('error', { error: { codigo: 'x', mensaje: 'm', reintentable: true } })), false)
  assert.equal(esDescartable(ejecucion('ejecutando')), false)
})

test('el compositor está libre sin ejecución y bloqueado por cada causa con su motivo', () => {
  assert.equal(estaBloqueado(undefined, libre), false)
  assert.equal(motivoBloqueo(undefined, libre), null)

  const casos = [
    [undefined, { ...libre, enviando: true }, 'Enviando…'],
    [ejecucion('planificando'), libre, 'Espera a que termine la ejecución en curso…'],
    [undefined, { ...libre, conError: true }, 'Pulsa Reintentar para seguir escribiendo…'],
    [ejecucion('incompleta'), libre, 'Responde o detén la ejecución pendiente para preguntar…'],
    [undefined, { ...libre, nuevasHabilitadas: false }, 'Las nuevas solicitudes están pausadas…']
  ]
  for (const [ultima, entorno, motivo] of casos) {
    assert.equal(estaBloqueado(ultima, entorno), true, motivo)
    assert.equal(motivoBloqueo(ultima, entorno), motivo)
  }
})

test('con las solicitudes nuevas pausadas aún se puede responder a la ejecución abierta', () => {
  const pausadas = { ...libre, nuevasHabilitadas: false }

  assert.equal(estaBloqueado(ejecucion('esperando_datos'), pausadas), false)
  assert.equal(estaBloqueado(ejecucion('esperando_confirmacion', { plan: PLAN }), pausadas), false)
})

test('la huella cambia con estado, progreso, versión del plan, actualizada_en y estado de pasos, largo del mensaje y preguntas', () => {
  const base = ejecucion('ejecutando', { progreso: 'Paso 1', plan: PLAN, actualizada_en: '2026-10-13T10:00:00Z' })

  assert.equal(mismaInstantanea(base, { ...base }), true)
  assert.equal(mismaInstantanea(undefined, base), false)
  assert.equal(mismaInstantanea(base, { ...base, estado: 'completada' }), false)
  assert.equal(mismaInstantanea(base, { ...base, progreso: 'Paso 2' }), false)
  assert.equal(mismaInstantanea(base, { ...base, plan: { ...PLAN, version: 'v2' } }), false)
  assert.equal(mismaInstantanea(base, { ...base, actualizada_en: '2026-10-13T10:00:05Z' }), false)
  assert.equal(mismaInstantanea(base, { ...base, plan: { ...PLAN, pasos: [{ ...PLAN.pasos[0], estado: 'hecho' }] } }), false)
  assert.notEqual(firmaDeEjecucion(base), firmaDeEjecucion({ ...base, mensaje: 'prosa nueva' }), 'el largo del mensaje cuenta')
  assert.equal(firmaDeEjecucion({ ...base, mensaje: 'aaaa' }), firmaDeEjecucion({ ...base, mensaje: 'bbbb' }), 'solo cuenta el largo, no el texto')
})

test('el seguimiento crece de 1,5 s a 5 s sin cambios y respeta una base mayor', () => {
  const esperas = [0, 1, 2, 3, 4, 10].map(n => intervaloSeguimiento(1500, n))

  assert.deepEqual(esperas, [1500, 2250, 3375, 5000, 5000, 5000])
  assert.equal(intervaloSeguimiento(8000, 3), 8000)
  assert.equal(intervaloSeguimiento(1500, -2), 1500)
})

test('la espera entre reintentos es exponencial y acotada', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(esperaReintentoSeguimiento), [1000, 2000, 4000, 5000, 5000])
})

test('actualizada_en es opcional pero, si viene, debe ser texto; el umbral por defecto son 180 s', () => {
  assert.equal(leerEjecucion(ejecucion('ejecutando', { actualizada_en: '2026-10-13T10:00:00Z' })).actualizada_en, '2026-10-13T10:00:00Z')
  assert.doesNotThrow(() => leerEjecucion(ejecucion('ejecutando')))
  assert.throws(() => leerEjecucion(ejecucion('ejecutando', { actualizada_en: 123 })))
  assert.equal(UMBRAL_DETENIDA_SEGUNDOS, 180)
})
