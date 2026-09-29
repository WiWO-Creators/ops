/**
 * Las formaciones del recorrido de novedades.
 *
 * Lo que rompe en silencio no es una figura fea sino el contrato con el scroll: una formacion por
 * seccion, una pose por pieza y todas dentro del escenario. Si falta una pose, esa pieza se queda en
 * el centro; si sobra una formacion, el escenario y las secciones dejan de coincidir.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENCUADRE_RECORRIDO, PIEZAS_RECORRIDO, formacion, formacionesDelRecorrido, transformDe
} from '../src/componentes/estructura/bienvenida/formaciones.ts'

const [minX, minY, ancho, alto] = ENCUADRE_RECORRIDO.split(' ').map(Number)
const NOMBRES = ['dispersa', 'grilla', 'tablero', 'gantt', 'calendario', 'barras', 'visto']

test('cada formacion tiene una pose finita por pieza, dentro del escenario', () => {
  for (const nombre of NOMBRES) {
    const poses = formacion(nombre)

    assert.equal(poses.length, PIEZAS_RECORRIDO, nombre)
    for (const pose of poses) {
      for (const valor of Object.values(pose)) assert.ok(Number.isFinite(valor), `${nombre}: ${valor}`)
      assert.ok(pose.x >= minX && pose.x <= minX + ancho, `${nombre} se sale en x: ${pose.x}`)
      assert.ok(pose.y >= minY && pose.y <= minY + alto, `${nombre} se sale en y: ${pose.y}`)
    }
  }
})

test('la formacion dispersa es la misma en cada llamada', () => {
  // Si cambiara entre renders, la pose inicial saltaria al volver a pintar.
  assert.deepEqual(formacion('dispersa'), formacion('dispersa'))
})

test('hay una formacion por seccion: portada, una por novedad y cierre', () => {
  assert.deepEqual(formacionesDelRecorrido(0), ['dispersa', 'visto'])
  assert.equal(formacionesDelRecorrido(5).length, 7)
  assert.equal(formacionesDelRecorrido(5)[0], 'dispersa')
  assert.equal(formacionesDelRecorrido(5).at(-1), 'visto')
  assert.deepEqual(formacionesDelRecorrido(-2), ['dispersa', 'visto'])
})

test('un total invalido no produce poses', () => {
  assert.throws(() => formacion('grilla', 0), RangeError)
  assert.throws(() => formacion('grilla', 2.5), RangeError)
})

test('el transform usa las mismas funciones que anima el timeline', () => {
  assert.equal(
    transformDe({ x: 1, y: -2, rotacion: 45, escala: 0.5 }),
    'translateX(1.00px) translateY(-2.00px) rotate(45.00deg) scale(0.500)'
  )
})
