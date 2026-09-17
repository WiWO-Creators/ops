/**
 * El contrato del dictado por voz del Thinking Orb.
 *
 * No hay navegador aca, asi que no se prueba que el microfono grabe: se prueba lo que sale mal
 * cuando nadie mira, que es la composicion del texto. El motor entrega resultados parciales que
 * reescribe y resultados finales que no, y mezclarlos duplica o triplica la frase en el campo.
 *
 * Tambien se verifica que el boton no se dibuje sin soporte del navegador y que el motor se aborte
 * al desmontar: un microfono abierto despues de cerrar el chat es un problema de privacidad, no de
 * estetica.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  componerDictado,
  crearMotorDeDictado,
  leerTrozos,
  mensajeDeErrorDeDictado,
  unirDictado,
  IDIOMA_DICTADO
} from '../src/dominio/dictado.ts'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

/** Un evento del motor como el que llega en `onresult`. */
const evento = (resultIndex, trozos) => ({
  resultIndex,
  results: Object.assign(
    trozos.map(([texto, isFinal]) => ({ isFinal, 0: { transcript: texto } })),
    { length: trozos.length }
  )
})

test('lo final se acumula y lo parcial se separa', () => {
  const trozos = leerTrozos(evento(0, [['hola ', true], ['que ta', false]]))

  assert.equal(trozos.confirmado, 'hola ')
  assert.equal(trozos.parcial, 'que ta')
})

test('los resultados anteriores a resultIndex no se releen', () => {
  // El motor manda la lista entera en cada evento; releerla desde cero duplica la frase.
  const trozos = leerTrozos(evento(1, [['ya leido', true], ['nuevo', true]]))

  assert.equal(trozos.confirmado, 'nuevo')
})

test('lo confirmado y la apuesta no se pegan sin espacio', () => {
  // El motor entrega 'de la semana' y luego 'y el siguiente': pegarlos de frente da 'semanay'.
  assert.equal(unirDictado('de la semana', 'y el sigui'), 'de la semana y el sigui')
  assert.equal(unirDictado('de la semana ', 'y el sigui'), 'de la semana y el sigui')
  assert.equal(unirDictado('de la semana', ' y el sigui'), 'de la semana y el sigui')
  assert.equal(unirDictado('', 'hola'), 'hola')
  assert.equal(unirDictado('hola', ''), 'hola')
})

test('lo dictado se pega despues de lo que ya estaba escrito a mano', () => {
  assert.equal(componerDictado('Revisa el hito', 'de la semana', 500), 'Revisa el hito de la semana')
})

test('el campo vacio no arranca con un espacio', () => {
  assert.equal(componerDictado('', 'crea una tarea', 500), 'crea una tarea')
})

test('un dictado en blanco deja el campo como estaba', () => {
  assert.equal(componerDictado('lo mio', '   ', 500), 'lo mio')
  assert.equal(componerDictado('', '', 500), '')
})

test('el texto se recorta al maximo del campo', () => {
  // `maxLength` del textarea no frena lo que se escribe por codigo: el recorte tiene que ser aca.
  assert.equal(componerDictado('abc', 'defghij', 6).length, 6)
  assert.equal(componerDictado('abc', 'defghij', 6), 'abc de')
  assert.equal(componerDictado('abcdefghij', '', 4), 'abcd')
})

test('los espacios de mas del motor se aplastan', () => {
  assert.equal(componerDictado('', 'una    tarea\nnueva', 500), 'una tarea nueva')
})

test('sin navegador no hay motor y nadie explota', () => {
  assert.equal(crearMotorDeDictado(), null)
})

test('parar a mano no se reporta como error', () => {
  assert.equal(mensajeDeErrorDeDictado('aborted'), '')
})

test('cada fallo conocido dice como salir de el', () => {
  assert.match(mensajeDeErrorDeDictado('not-allowed'), /micrófono/)
  assert.match(mensajeDeErrorDeDictado('audio-capture'), /micrófono/)
  assert.match(mensajeDeErrorDeDictado('no-speech'), /No se escuchó/)
  assert.match(mensajeDeErrorDeDictado('network'), /conexión/)
  assert.notEqual(mensajeDeErrorDeDictado('codigo-que-no-existe'), '')
})

test('el idioma del motor es una etiqueta BCP 47 configurable', () => {
  assert.match(IDIOMA_DICTADO, /^[a-z]{2}-[A-Z]{2}$/)
  assert.match(leer('../src/dominio/dictado.ts'), /process\.env\.NEXT_PUBLIC_IDIOMA_DICTADO/,
    'el idioma no puede quedar hardcodeado: el motor rinde distinto por variante del español')
})

test('el boton no se dibuja si el navegador no soporta voz', () => {
  assert.match(leer('../src/componentes/ia/BotonDictado.tsx'), /if \(!dictado\.soportado\) return null/)
})

test('el microfono se cierra al desmontar el chat', () => {
  assert.match(leer('../src/componentes/ia/useDictado.ts'), /motor\.current\?\.abort\(\)/,
    'sin abort() el microfono sigue abierto despues de cerrar el chat')
})

test('los dos chats del orbe tienen microfono', () => {
  for (const chat of ['../src/componentes/ia/ChatOrbe.tsx', '../src/componentes/ia/ChatAgente.tsx']) {
    assert.match(leer(chat), /<BotonDictado/, `${chat} se quedo sin dictado`)
  }
})
