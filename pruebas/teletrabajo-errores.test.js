/**
 * Como se le cuenta a alguien que su microfono o su camara no arrancaron.
 *
 * Los tres motivos reales —no dio permiso, no tiene el aparato, lo usa otro programa— se distinguen
 * solo por el `name` del error, y cada uno se arregla de una forma distinta. Un mensaje generico
 * convierte diez segundos de solucion en "la sala esta rota".
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoDelFallo } from '../src/componentes/teletrabajo/errores.ts'

/** Arma un error con el `name` que pone el navegador. */
function errorLlamado (nombre) {
  const error = new Error('lo que sea')
  error.name = nombre
  return error
}

test('cada motivo de fallo dice como se arregla', () => {
  assert.match(motivoDelFallo(errorLlamado('NotAllowedError'), 'la cámara'), /permiso|candado/i)
  assert.match(motivoDelFallo(errorLlamado('NotFoundError'), 'la cámara'), /No encontramos/i)
  assert.match(motivoDelFallo(errorLlamado('NotReadableError'), 'la cámara'), /Otro programa/i)

  // Los tres nombran el aparato del que se habla: el mismo texto sirve para microfono y camara.
  assert.match(motivoDelFallo(errorLlamado('NotFoundError'), 'el micrófono'), /el micrófono/)
})

test('cancelar el dialogo de compartir pantalla no es un fallo', () => {
  // `AbortError` es lo que deja cerrar el selector de pantalla del navegador. Avisar ahi seria
  // regañar a alguien por cambiar de opinion.
  assert.equal(motivoDelFallo(errorLlamado('AbortError'), 'la pantalla compartida'), '')
})

test('lo que no es un Error tambien recibe respuesta', () => {
  // En el camino del WebSocket, LiveKit rechaza con un `Event` pelado: sin esta rama la promesa
  // quedaria sin manejar y en desarrollo levanta la pantalla roja de Next sobre la llamada.
  assert.match(motivoDelFallo(undefined, 'el micrófono'), /No pudimos activar el micrófono/)
  assert.match(motivoDelFallo({ name: 'NotAllowedError' }, 'el micrófono'), /No pudimos activar/)
})
