/**
 * Pruebas del estado compartido de fase del orbe (`dominio/fase-orbe.ts`) y de las fases que
 * derivan los dos motores.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ambitoDeOrbe, faseDeSujeto, leerFaseOrbe, publicarFaseOrbe, vaciarFasesOrbe } from '../src/dominio/fase-orbe.ts'
import { faseDeEjecucion } from '../src/dominio/ia-ejecucion.ts'
import { faseDeHilo } from '../src/dominio/ia-chat.ts'

beforeEach(() => { vaciarFasesOrbe() })

test('el ámbito es sujeto:proyecto y global cuando no hay Proyecto', () => {
  assert.equal(ambitoDeOrbe('staff'), 'staff:global')
  assert.equal(ambitoDeOrbe('contacto', 9), 'contacto:9')
})

test('un ámbito sin publicar está en reposo, y reposo borra la entrada', () => {
  const ambito = ambitoDeOrbe('staff')

  assert.equal(leerFaseOrbe(ambito), 'reposo')
  publicarFaseOrbe(ambito, 'generando')
  assert.equal(leerFaseOrbe(ambito), 'generando')
  publicarFaseOrbe(ambito, 'reposo')
  assert.equal(leerFaseOrbe(ambito), 'reposo')
  assert.equal(faseDeSujeto('staff'), 'reposo')
})

test('la fase de un sujeto es la más urgente de sus ámbitos y no se mezcla con otro sujeto', () => {
  publicarFaseOrbe(ambitoDeOrbe('staff'), 'error')
  publicarFaseOrbe(ambitoDeOrbe('staff', 3), 'esperando')
  publicarFaseOrbe(ambitoDeOrbe('contacto', 3), 'generando')

  assert.equal(faseDeSujeto('staff'), 'esperando')
  assert.equal(faseDeSujeto('contacto'), 'generando')

  publicarFaseOrbe(ambitoDeOrbe('staff', 4), 'generando')
  assert.equal(faseDeSujeto('staff'), 'generando')
})

const ejecucion = (estado, extra = {}) => ({ id: '1', pregunta: 'p', estado, ...extra })
const sinEntorno = { enviando: false, conError: false }

test('la fase del agente sale de la última ejecución y del entorno', () => {
  assert.equal(faseDeEjecucion(undefined, sinEntorno), 'reposo')
  assert.equal(faseDeEjecucion(undefined, { enviando: true, conError: false }), 'generando')
  for (const estado of ['en_cola', 'planificando', 'ejecutando']) assert.equal(faseDeEjecucion(ejecucion(estado), sinEntorno), 'generando')
  for (const estado of ['esperando_datos', 'esperando_confirmacion', 'incompleta']) assert.equal(faseDeEjecucion(ejecucion(estado), sinEntorno), 'esperando')
  for (const estado of ['completada', 'cancelada']) assert.equal(faseDeEjecucion(ejecucion(estado), sinEntorno), 'reposo')
  assert.equal(faseDeEjecucion(ejecucion('error'), sinEntorno), 'error')
  assert.equal(faseDeEjecucion(ejecucion('ejecutando'), { enviando: false, conError: true }), 'error')
})

const persona = { rol: 'persona', texto: 'hola', citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' }
const ia = (extra = {}) => ({ rol: 'ia', texto: 'ok', citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo', ...extra })

test('la fase del chat de consulta sale del hilo', () => {
  assert.equal(faseDeHilo([], false, true), 'reposo')
  assert.equal(faseDeHilo([persona, ia({ fase: 'generando' })], true, true), 'generando')
  assert.equal(faseDeHilo([persona, ia({ fase: 'error' })], false, true), 'error')
  assert.equal(faseDeHilo([persona, ia({ fase: 'interrumpido' })], false, true), 'reposo')
})

test('una pregunta de la IA sin contestar es esperando, y contestada o sin tarjetas (portal) es reposo', () => {
  const conPregunta = ia({ preguntas: [{ pregunta: '¿Cuál?', opciones: ['a', 'b'] }] })

  assert.equal(faseDeHilo([persona, conPregunta], false, true), 'esperando')
  assert.equal(faseDeHilo([persona, conPregunta, persona], false, true), 'reposo')
  assert.equal(faseDeHilo([persona, conPregunta], false, false), 'reposo')
})
