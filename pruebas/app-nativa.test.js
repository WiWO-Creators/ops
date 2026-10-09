/**
 * Pruebas de la detección de la app nativa y del puente con ella.
 *
 * Lo que se protege: que un navegador normal NUNCA se tome por la app (ahí se apagarían el service
 * worker y las notificaciones), que el sufijo del UA se lea con la versión, y que los mensajes del
 * puente salgan con la forma que la app valida (`v: 1`, sin campos vacíos).
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { enAppNativa, esAppNativa, versionDeApp } from '../src/lib/app-nativa.ts'
import {
  avisarCambioDeJornada,
  enviarAlApp,
  leerMensajeDeLaApp,
  leerTraspaso,
  mensajeAjustes,
  mensajeGoogle,
  mensajeAuth,
  mensajeCardEnd,
  mensajeCardStart,
  mensajeCardUpdate,
  mensajeLogout,
  mensajeReady,
  mismaTarjeta
} from '../src/lib/puente-app.ts'

const UA_APP = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 WiwoOpsApp/1.0'
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'

const TARJETA = {
  cardId: '0b1f4d1e-8a64-4f43-9d5c-3a1d2a3f0001',
  tipo: 'jornada',
  titulo: 'Jornada',
  origen: { label: 'Inicio', hora: '09:00' },
  destino: { label: 'Cierre', hora: '18:00' },
  inicio: 1_790_000_000,
  finEstimado: 1_790_032_400,
  estado: 'en_curso',
  chip: '',
  discreto: true,
  actualizadoEn: 1_790_000_100
}

afterEach(() => {
  delete globalThis.window
})

test('mismaTarjeta ignora la hora de lectura y el modo discreto, no el contenido', () => {
  assert.equal(mismaTarjeta(TARJETA, { ...TARJETA, actualizadoEn: TARJETA.actualizadoEn + 60, discreto: false }), true)
  assert.equal(mismaTarjeta(TARJETA, { ...TARJETA, finEstimado: TARJETA.finEstimado + 1800 }), false)
  assert.equal(mismaTarjeta(TARJETA, { ...TARJETA, destino: { label: 'Cierre', hora: '18:30' } }), false)
  assert.equal(mismaTarjeta(TARJETA, { ...TARJETA, estado: 'atrasada', chip: 'Cierre' }), false)
})

test('esAppNativa reconoce el sufijo y rechaza navegadores y vacíos', () => {
  assert.equal(esAppNativa(UA_APP), true)
  assert.equal(esAppNativa(UA_CHROME), false)
  assert.equal(esAppNativa(''), false)
  assert.equal(esAppNativa(null), false)
  assert.equal(esAppNativa(undefined), false)
})

test('versionDeApp lee la versión o devuelve null', () => {
  assert.equal(versionDeApp(UA_APP), '1.0')
  assert.equal(versionDeApp(`${UA_CHROME} WiwoOpsApp/2.3.1-beta`), '2.3.1-beta')
  assert.equal(versionDeApp(UA_CHROME), null)
  assert.equal(versionDeApp('WiwoOpsApp/'), null)
  assert.equal(versionDeApp(null), null)
})

test('enAppNativa: falso sin window, y verdadero por UA o por window.WiwoOpsApp', () => {
  assert.equal(enAppNativa(), false)

  globalThis.window = { navigator: { userAgent: UA_CHROME } }
  assert.equal(enAppNativa(), false)

  globalThis.window = { navigator: { userAgent: UA_APP } }
  assert.equal(enAppNativa(), true)

  globalThis.window = { navigator: { userAgent: UA_CHROME }, WiwoOpsApp: { v: 1, plataforma: 'ios', vinculado: false, reto: null } }
  assert.equal(enAppNativa(), true)
})

test('los constructores arman mensajes con v:1', () => {
  assert.deepEqual(mensajeAuth('abc'), { v: 1, tipo: 'auth', codigo: 'abc' })
  assert.deepEqual(mensajeCardStart(TARJETA), { v: 1, tipo: 'card.start', card: TARJETA })
  assert.deepEqual(mensajeCardUpdate(TARJETA), { v: 1, tipo: 'card.update', card: TARJETA })
  assert.deepEqual(mensajeCardEnd(TARJETA.cardId), { v: 1, tipo: 'card.end', cardId: TARJETA.cardId })
  assert.deepEqual(mensajeLogout(), { v: 1, tipo: 'logout' })
  assert.deepEqual(mensajeAjustes(), { v: 1, tipo: 'app.ajustes' })
  assert.deepEqual(mensajeGoogle(), { v: 1, tipo: 'app.google' })
  assert.deepEqual(mensajeReady(), { v: 1, tipo: 'ready' })
})

test('los constructores rechazan códigos e ids vacíos', () => {
  assert.throws(() => mensajeAuth(' '), RangeError)
  assert.throws(() => mensajeCardEnd(''), RangeError)
  assert.throws(() => mensajeCardStart({ ...TARJETA, cardId: '' }), RangeError)
  assert.throws(() => mensajeCardUpdate({ ...TARJETA, cardId: '' }), RangeError)
})

test('enviarAlApp: sin puente no hace nada; con puente manda el JSON', () => {
  assert.equal(enviarAlApp(mensajeLogout()), false)

  globalThis.window = {}
  assert.equal(enviarAlApp(mensajeLogout()), false)

  const enviados = []
  globalThis.window = { ReactNativeWebView: { postMessage: (texto) => enviados.push(texto) } }
  assert.equal(enviarAlApp(mensajeLogout()), true)
  assert.deepEqual(enviados, ['{"v":1,"tipo":"logout"}'])

  globalThis.window = { ReactNativeWebView: { postMessage: () => { throw new Error('caído') } } }
  assert.equal(enviarAlApp(mensajeLogout()), false)
})

test('leerTraspaso acepta solo un traspaso completo y no se cruza con el estado', () => {
  assert.deepEqual(leerTraspaso({ tipo: 'traspaso', codigo: 'abc', verifier: 'xyz' }), { tipo: 'traspaso', codigo: 'abc', verifier: 'xyz' })
  assert.deepEqual(leerTraspaso('{"tipo":"traspaso","codigo":"abc","verifier":"xyz"}'), { tipo: 'traspaso', codigo: 'abc', verifier: 'xyz' })
  assert.equal(leerTraspaso({ tipo: 'traspaso', codigo: '', verifier: 'xyz' }), null)
  assert.equal(leerTraspaso({ tipo: 'traspaso', codigo: 'abc' }), null)
  assert.equal(leerTraspaso({ tipo: 'estado', vinculado: true, reto: null }), null)
  assert.equal(leerMensajeDeLaApp({ tipo: 'traspaso', codigo: 'abc', verifier: 'xyz' }), null)
  assert.equal(leerTraspaso('no es json'), null)
})

test('leerMensajeDeLaApp valida el estado y descarta lo demás', () => {
  assert.deepEqual(leerMensajeDeLaApp({ tipo: 'estado', vinculado: false, reto: 'x' }), { tipo: 'estado', vinculado: false, reto: 'x' })
  assert.deepEqual(leerMensajeDeLaApp({ tipo: 'estado', vinculado: true }), { tipo: 'estado', vinculado: true, reto: null })
  assert.deepEqual(leerMensajeDeLaApp('{"tipo":"estado","vinculado":true,"reto":null}'), { tipo: 'estado', vinculado: true, reto: null })
  assert.equal(leerMensajeDeLaApp({ tipo: 'estado', vinculado: 'si' }), null)
  assert.equal(leerMensajeDeLaApp({ tipo: 'estado', vinculado: false, reto: 5 }), null)
  assert.equal(leerMensajeDeLaApp({ tipo: 'otro' }), null)
  assert.equal(leerMensajeDeLaApp('no es json'), null)
  assert.equal(leerMensajeDeLaApp(null), null)
})

test('avisarCambioDeJornada despacha jornada-cambio y no falla sin window', () => {
  assert.doesNotThrow(() => { avisarCambioDeJornada() })

  const nombres = []
  globalThis.window = { dispatchEvent: (evento) => nombres.push(evento.type) }
  avisarCambioDeJornada()
  assert.deepEqual(nombres, ['jornada-cambio'])
})
