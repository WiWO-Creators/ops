/**
 * Registro de escrituras pendientes y deteccion de navegaciones internas.
 *
 * Lo que importa con red lenta: una escritura sin respuesta queda visible como "sin confirmar" en vez
 * de desaparecer, y solo los clics que de verdad navegan encienden la barra de carga.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  descartarSinConfirmar,
  pendientesAhora,
  registrarEscritura,
  reiniciarPendientes
} from '../src/datos/pendientes.ts'
import { esNavegacionInterna } from '../src/datos/navegacion.ts'

test('una escritura cuenta mientras viaja y se cierra una sola vez', () => {
  reiniciarPendientes()
  const cerrar = registrarEscritura('tasks/1')
  assert.equal(pendientesAhora().enCurso, 1)

  cerrar('ok')
  cerrar('ok')
  assert.equal(pendientesAhora().enCurso, 0)
  assert.equal(pendientesAhora().sinConfirmar.length, 0)
})

test('una escritura incierta queda sin confirmar hasta que se descarta', () => {
  reiniciarPendientes()
  registrarEscritura('tasks/2')('incierta')
  registrarEscritura('tasks/3')('error')

  assert.deepEqual(pendientesAhora().sinConfirmar.map((e) => e.ruta), ['tasks/2'])
  assert.equal(pendientesAhora().enCurso, 0)

  descartarSinConfirmar()
  assert.equal(pendientesAhora().sinConfirmar.length, 0)
})

test('varias escrituras simultaneas se cuentan por separado', () => {
  reiniciarPendientes()
  const a = registrarEscritura('a')
  const b = registrarEscritura('b')
  assert.equal(pendientesAhora().enCurso, 2)
  a('ok')
  assert.equal(pendientesAhora().enCurso, 1)
  b('ok')
  assert.equal(pendientesAhora().enCurso, 0)
})

const ORIGEN = 'https://ops.wiwo.me'
const CLIC = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
const enlace = (href, extra = {}) => ({ href, target: '', hasAttribute: () => false, ...extra })

test('un enlace interno a otra ruta enciende la navegacion', () => {
  assert.equal(esNavegacionInterna(enlace(`${ORIGEN}/tareas`), CLIC, ORIGEN, '/proyectos'), true)
  assert.equal(esNavegacionInterna(enlace('/tareas?x=1'), CLIC, ORIGEN, '/tareas'), true)
})

test('no navega: misma ruta, otro origen, otra pestana, descarga o clic con modificador', () => {
  assert.equal(esNavegacionInterna(enlace(`${ORIGEN}/tareas`), CLIC, ORIGEN, '/tareas'), false)
  assert.equal(esNavegacionInterna(enlace('https://otro.com/x'), CLIC, ORIGEN, '/'), false)
  assert.equal(esNavegacionInterna(enlace('/x', { target: '_blank' }), CLIC, ORIGEN, '/'), false)
  assert.equal(esNavegacionInterna(enlace('/x', { hasAttribute: () => true }), CLIC, ORIGEN, '/'), false)
  assert.equal(esNavegacionInterna(enlace('/x'), { ...CLIC, ctrlKey: true }, ORIGEN, '/'), false)
  assert.equal(esNavegacionInterna(enlace('/x'), { ...CLIC, button: 1 }, ORIGEN, '/'), false)
})

import { destinoSoloDeModal } from '../src/datos/navegacion.ts'

test('un enlace que solo cambia ?tarea= se resuelve sin pasar por el servidor', () => {
  assert.equal(destinoSoloDeModal('/tareas?tarea=12', ORIGEN, '/tareas', ''), '/tareas?tarea=12')
  assert.equal(destinoSoloDeModal('/tareas?q=a&tarea=12', ORIGEN, '/tareas', '?q=a'), '/tareas?q=a&tarea=12')
  assert.equal(destinoSoloDeModal('/tareas?q=a', ORIGEN, '/tareas', '?q=a&tarea=12'), '/tareas?q=a')
  assert.equal(destinoSoloDeModal('/tareas?ticket=3', ORIGEN, '/tareas', '?tarea=1'), '/tareas?ticket=3')
})

test('si cambia la pagina o cualquier otro parametro, navega normal', () => {
  assert.equal(destinoSoloDeModal('/proyectos/1?tarea=12', ORIGEN, '/tareas', ''), null)
  assert.equal(destinoSoloDeModal('/tareas?q=b&tarea=12', ORIGEN, '/tareas', '?q=a'), null)
  assert.equal(destinoSoloDeModal('https://otro.com/tareas?tarea=1', ORIGEN, '/tareas', ''), null)
})
