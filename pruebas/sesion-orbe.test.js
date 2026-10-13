/**
 * Pruebas del cierre de sesión del orbe (`dominio/sesion-orbe.ts`), de la caché de capacidades
 * (`dominio/cache-capacidades.ts`) y de la caducidad de las fases conservadas.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarSesionOrbe } from '../src/dominio/sesion-orbe.ts'
import { capacidadesEnCache, pedirCapacidadesCacheadas, vaciarCapacidadesOrbe } from '../src/dominio/cache-capacidades.ts'
import { ambitoDeOrbe, conservarFaseOrbe, faseDeSujeto, leerFaseOrbe, publicarFaseOrbe, vaciarFasesOrbe } from '../src/dominio/fase-orbe.ts'
import { guardarHilo, leerHilo } from '../src/dominio/ia-chat.ts'
import { firmaDeEjecucion } from '../src/dominio/ia-ejecucion.ts'

const CAPACIDADES = { habilitado: true, agente: { habilitado: true } }

beforeEach(() => { vaciarFasesOrbe(); vaciarCapacidadesOrbe() })

test('cerrarSesionOrbe vacía hilos, capacidades y fases a la vez', async () => {
  guardarHilo({ mensajes: [{ rol: 'persona', texto: 'hola' }], cargado: true }, undefined, 'staff')
  await pedirCapacidadesCacheadas('ia/capacidades', async () => CAPACIDADES)
  publicarFaseOrbe(ambitoDeOrbe('staff'), 'esperando')

  cerrarSesionOrbe()

  assert.deepEqual(leerHilo(undefined, 'staff'), { mensajes: [], cargado: false })
  assert.equal(capacidadesEnCache('ia/capacidades'), null)
  assert.equal(faseDeSujeto('staff'), 'reposo')
})

test('unas capacidades que llegan tarde, tras cerrar sesión, no se guardan', async () => {
  let responder
  const lenta = pedirCapacidadesCacheadas('ia/capacidades', () => new Promise(resolver => { responder = resolver }))

  cerrarSesionOrbe()
  responder(CAPACIDADES)

  assert.deepEqual(await lenta, CAPACIDADES)
  assert.equal(capacidadesEnCache('ia/capacidades'), null)
})

test('la caché sirve la segunda lectura y comparte la petición en vuelo', async () => {
  let llamadas = 0
  const cargar = async () => { llamadas += 1; return CAPACIDADES }

  await Promise.all([pedirCapacidadesCacheadas('a', cargar), pedirCapacidadesCacheadas('a', cargar)])
  await pedirCapacidadesCacheadas('a', cargar)

  assert.equal(llamadas, 1)
})

test('la caché caduca y un fallo no se guarda', async () => {
  await pedirCapacidadesCacheadas('a', async () => CAPACIDADES)
  assert.equal(capacidadesEnCache('a', Date.now() + 61_000), null)

  await assert.rejects(pedirCapacidadesCacheadas('b', async () => { throw new Error('caído') }), /caído/)
  assert.equal(capacidadesEnCache('b'), null)
})

test('una fase conservada caduca pasado su TTL y republicarla lo cancela', async () => {
  const ambito = ambitoDeOrbe('staff', 4)

  publicarFaseOrbe(ambito, 'esperando')
  conservarFaseOrbe(ambito, 20)
  assert.equal(leerFaseOrbe(ambito), 'esperando')
  assert.equal(faseDeSujeto('staff', Date.now() + 25), 'reposo')

  await new Promise(resolver => setTimeout(resolver, 40))
  assert.equal(leerFaseOrbe(ambito), 'reposo')

  publicarFaseOrbe(ambito, 'esperando')
  conservarFaseOrbe(ambito, 20)
  publicarFaseOrbe(ambito, 'esperando')
  await new Promise(resolver => setTimeout(resolver, 40))
  assert.equal(leerFaseOrbe(ambito), 'esperando')
})

test('la firma de una ejecución cambia con el largo del mensaje y el número de preguntas', () => {
  const base = { id: '1', estado: 'planificando', pregunta: 'x' }
  const firma = firmaDeEjecucion(base)

  assert.notEqual(firmaDeEjecucion({ ...base, mensaje: 'hola' }), firma)
  assert.notEqual(firmaDeEjecucion({ ...base, preguntas: [{ pregunta: '¿?' }] }), firma)
  assert.equal(firmaDeEjecucion({ ...base }), firma)
})
