import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirDistinta, FRASES_DE_CALABAZA, PALABRAS_SECRETAS, teclear } from '../src/componentes/modos/huevos.ts'

/** Teclea una cadena letra por letra y devuelve el ultimo efecto disparado. */
function escribir (texto, previo = '') {
  let escrito = previo
  let efecto = null

  for (const tecla of texto) ({ escrito, efecto } = teclear(escrito, tecla))

  return efecto
}

test('cada palabra secreta dispara su efecto al cerrarse', () => {
  for (const [palabra, esperado] of Object.entries(PALABRAS_SECRETAS)) {
    assert.equal(escribir(palabra), esperado, palabra)
  }
})

test('la palabra se reconoce aunque venga despues de otras letras y en mayusculas', () => {
  assert.equal(escribir('xxBOO'), 'bu')
  assert.equal(escribir('holaBruja'), 'escoba')
})

test('una palabra a medias o con una tecla de por medio no dispara nada', () => {
  assert.equal(escribir('bo'), null)
  assert.equal(escribir('bo1o'), null)
  assert.equal(escribir('b oo'), null)
})

test('teclas que no son letras reinician lo escrito', () => {
  assert.deepEqual(teclear('bo', 'Enter'), { escrito: '', efecto: null })
  assert.deepEqual(teclear('bo', '1'), { escrito: '', efecto: null })
})

test('lo escrito no crece sin limite', () => {
  const { escrito } = teclear('a'.repeat(200), 'z')

  assert.ok(escrito.length <= 10)
})

test('elegirDistinta no repite la anterior cuando hay mas de una', () => {
  for (let i = 0; i < 50; i++) {
    assert.notEqual(elegirDistinta(FRASES_DE_CALABAZA, FRASES_DE_CALABAZA[0]), FRASES_DE_CALABAZA[0])
  }
  assert.equal(elegirDistinta(['unica'], 'unica'), 'unica')
})
