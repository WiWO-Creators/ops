/**
 * Pruebas de la mini llamada de Teletrabajo.
 *
 * Lo que se protege es a quien se ve en la ventanita mientras se trabaja en otra pantalla: si la
 * eleccion falla, la mini llamada muestra la camara propia aunque haya alguien hablando, o queda
 * vacia en una sala con gente.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pistaDestacada } from '../src/componentes/teletrabajo/destacada.ts'

/** Una pista de camara falsa: con `conCamara` lleva publicacion prendida; sin ella, es marcador. */
function pista (identidad, conCamara = false) {
  return {
    participant: { identity: identidad },
    publication: conCamara ? { isMuted: false } : undefined,
    source: 'camera'
  }
}

test('sin nadie en la sala no hay nada que mostrar', () => {
  assert.equal(pistaDestacada([], [], 'yo'), null)
})

test('a solas se muestra la ficha propia', () => {
  const propia = pista('yo', true)
  assert.equal(pistaDestacada([propia], ['yo'], 'yo'), propia)
})

test('quien habla gana, aunque tenga la cámara apagada', () => {
  const ana = pista('ana', true)
  const beto = pista('beto')
  assert.equal(pistaDestacada([pista('yo', true), ana, beto], ['beto'], 'yo'), beto)
})

test('hablar uno mismo no le quita el lugar a los demás', () => {
  const ana = pista('ana', true)
  assert.equal(pistaDestacada([pista('yo', true), ana], ['yo'], 'yo'), ana)
})

test('sin nadie hablando, primero quien tiene cámara', () => {
  const beto = pista('beto', true)
  assert.equal(pistaDestacada([pista('yo', true), pista('ana'), beto], [], 'yo'), beto)
})

test('sin cámaras ajenas, cualquier otra persona antes que uno mismo', () => {
  const ana = pista('ana')
  assert.equal(pistaDestacada([pista('yo', true), ana], [], 'yo'), ana)
})

test('una cámara silenciada no cuenta como prendida', () => {
  const ana = pista('ana')
  const beto = { ...pista('beto'), publication: { isMuted: true } }
  const carla = pista('carla', true)
  assert.equal(pistaDestacada([ana, beto, carla], [], 'yo'), carla)
})
