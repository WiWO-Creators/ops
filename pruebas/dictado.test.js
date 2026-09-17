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
  pideRespaldo,
  nombreDeDictado,
  IDIOMA_DICTADO,
  MOTIVOS_SIN_MOTOR,
  MAXIMO_BYTES_DICTADO,
  SEGUNDOS_MAXIMOS_DICTADO,
  RUTA_DICTADO,
  CAMPO_DICTADO
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
  assert.match(mensajeDeErrorDeDictado('network'), /servicio de reconocimiento/)
  assert.notEqual(mensajeDeErrorDeDictado('codigo-que-no-existe'), '')
})

test('el idioma del motor es una etiqueta BCP 47 configurable', () => {
  assert.match(IDIOMA_DICTADO, /^[a-z]{2}-[A-Z]{2}$/)
  assert.match(leer('../src/dominio/dictado.ts'), /process\.env\.NEXT_PUBLIC_IDIOMA_DICTADO/,
    'el idioma no puede quedar hardcodeado: el motor rinde distinto por variante del español')
})

test('los fallos que no son de la persona mandan al respaldo', () => {
  // Navegadores que declaran la API sin tener el servicio detras: Brave, los Chromium abiertos.
  assert.ok(pideRespaldo('network'))
  assert.ok(pideRespaldo('service-not-allowed'))
})

test('el permiso y la falta de microfono NO mandan al respaldo', () => {
  // Con el respaldo fallarian igual: `getUserMedia` necesita el mismo permiso y el mismo aparato.
  assert.equal(pideRespaldo('not-allowed'), false)
  assert.equal(pideRespaldo('audio-capture'), false)
  assert.equal(pideRespaldo('no-speech'), false)
  assert.equal(pideRespaldo('aborted'), false)
})

test('el mensaje de network no culpa a la conexion', () => {
  // Decia "necesita conexión y no la hubo", y la conexion estaba perfecta: lo que falta es el
  // servicio de voz del navegador.
  const mensaje = mensajeDeErrorDeDictado('network')
  assert.doesNotMatch(mensaje, /conexión/)
  assert.match(mensaje, /servicio/)
})

test('el archivo del respaldo se nombra segun lo que grabo el navegador', () => {
  assert.equal(nombreDeDictado('audio/webm;codecs=opus'), 'dictado.webm')
  assert.equal(nombreDeDictado('audio/mp4'), 'dictado.m4a')
  assert.equal(nombreDeDictado(''), 'dictado.webm')
})

test('los topes del respaldo son los mismos que valida el board', () => {
  // `EntradaDeDictado::MAX_BYTES` en wiwo-board. Si uno de los dos cambia, esto avisa.
  assert.equal(MAXIMO_BYTES_DICTADO, 8388608)
  assert.equal(SEGUNDOS_MAXIMOS_DICTADO, 120)
  assert.equal(RUTA_DICTADO, 'ia/dictado')
  assert.equal(CAMPO_DICTADO, 'audio')
  assert.ok(MOTIVOS_SIN_MOTOR.length > 0)
})

test('el hook cambia de motor sin pedir otro clic', () => {
  const hook = leer('../src/componentes/ia/useDictado.ts')

  assert.match(hook, /if \(pideRespaldo\(evento\.error\)\) \{/,
    'el fallo del motor del navegador tiene que evaluarse contra pideRespaldo')
  assert.match(hook, /descartarMotor\(\)[\s\S]{0,200}void grabar\(\)/,
    'ante un fallo sin arreglo hay que anotarlo y arrancar el respaldo en el mismo gesto')
  assert.match(hook, /sessionStorage/,
    'el descarte del motor tiene que sobrevivir al proximo dictado de la misma sesion')
})

test('el respaldo no sube nada si el chat ya se cerro', () => {
  const hook = leer('../src/componentes/ia/useDictado.ts')

  // Entre pedir el microfono y obtenerlo hay un await: si el chat se cerro ahi, seguir dejaria el
  // microfono abierto y subiria un audio que no tiene donde escribirse.
  assert.match(hook, /if \(!vivo\.current\) \{[\s\S]{0,160}pista\.stop\(\)/)
})

test('el respaldo corta solo', () => {
  const hook = leer('../src/componentes/ia/useDictado.ts')

  assert.match(hook, /setTimeout\([\s\S]{0,200}SEGUNDOS_MAXIMOS_DICTADO \* 1000\)/,
    'sin corte automatico un microfono olvidado abierto se paga en GPU')
  assert.match(hook, /clearTimeout\(corte\.current\)/, 'el temporizador del corte hay que limpiarlo')
})

test('el boton distingue las dos formas de dictar', () => {
  const boton = leer('../src/componentes/ia/BotonDictado.tsx')

  // Con el motor del navegador el texto aparece mientras se habla; con el respaldo hay espera.
  for (const aviso of ['Escuchando…', 'Grabando…', 'Transcribiendo…']) {
    assert.ok(boton.includes(aviso), `falta el aviso de la fase: ${aviso}`)
  }
  assert.match(boton, /disabled=\{deshabilitado \|\| dictado\.fase === 'transcribiendo'\}/,
    'mientras el board transcribe no se puede volver a apretar')
})

test('el boton no se dibuja si el navegador no soporta voz', () => {
  assert.match(leer('../src/componentes/ia/BotonDictado.tsx'), /if \(!dictado\.soportado\) return null/)
})

test('el microfono se cierra al desmontar el chat', () => {
  const hook = leer('../src/componentes/ia/useDictado.ts')

  assert.match(hook, /motor\.current\?\.abort\(\)/,
    'sin abort() el reconocimiento sigue abierto despues de cerrar el chat')
  assert.match(hook, /pista\.stop\(\)/,
    'sin soltar las pistas, el punto rojo del microfono queda encendido en la pestaña')
})

test('los dos chats del orbe tienen microfono', () => {
  for (const chat of ['../src/componentes/ia/ChatOrbe.tsx', '../src/componentes/ia/ChatAgente.tsx']) {
    assert.match(leer(chat), /<BotonDictado/, `${chat} se quedo sin dictado`)
  }
})
