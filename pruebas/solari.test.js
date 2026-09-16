/**
 * Pruebas del volteo Solari de la pantalla de area.
 *
 * Lo que se cuida acá es lo que no se ve fallar mirando la pared: un rodillo que no termina en el
 * caracter de verdad —y deja la pared mintiendo para siempre—, un tope que no topa —y lanza cuarenta
 * animaciones por celda en un stick HDMI—, y un caracter raro que se parte por la mitad.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALFABETO_SOLARI, PASOS_POR_GLIFO, TOPE_DE_ESCALON_GLIFO, TOPE_DE_GLIFOS, cintaDeRodillo,
  escalonDeGlifo, rodilloDeGlifo, rodilloDeTexto
} from '../src/dominio/solari.ts'

/** Cuantas posiciones de un texto ya resuelto llevan rodillo. */
function cuantasVoltean (glifos) {
  return glifos.filter((posicion) => posicion.rodillo !== null).length
}

test('el rodillo termina siempre en el caracter de destino', () => {
  for (const glifo of ['A', 'M', 'Z', '0', '9', 'Ñ']) {
    const rodillo = rodilloDeGlifo(glifo)

    assert.equal(rodillo.at(-1), glifo, `el rodillo de ${glifo} no termina en ${glifo}`)
  }
})

test('el rodillo conserva la caja y el acento del destino, aunque el camino sea en mayusculas', () => {
  const rodillo = rodilloDeGlifo('á')

  assert.equal(rodillo.at(-1), 'á')
  // Lo de antes es ruido mecanico, y el ruido de un panel es mayuscula.
  assert.ok(rodillo.slice(0, -1).every((paso) => ALFABETO_SOLARI.includes(paso)))
})

test('el rodillo mide exactamente los pasos pedidos mas el destino', () => {
  assert.equal(rodilloDeGlifo('M').length, PASOS_POR_GLIFO + 1)
  assert.equal(rodilloDeGlifo('M', 3).length, 4)
  assert.equal(rodilloDeGlifo('M', 1).length, 2)
})

test('el camino son los glifos que preceden al destino en el alfabeto, en orden', () => {
  assert.deepEqual(rodilloDeGlifo('E', 3), ['B', 'C', 'D', 'E'])
})

test('el alfabeto da la vuelta: el primer glifo llega desde el final', () => {
  const rodillo = rodilloDeGlifo('A', 2)

  assert.deepEqual(rodillo, ['8', '9', 'A'])
})

test('la eñe no se convierte en ene', () => {
  const rodillo = rodilloDeGlifo('ñ')

  assert.equal(rodillo.at(-1), 'ñ')
  // Entra por su propia casilla del alfabeto, asi que llega desde la `N` y no desde la `M`.
  assert.equal(rodillo.at(-2), 'N')
})

test('lo que no esta en el alfabeto no voltea', () => {
  for (const caracter of [' ', ':', '%', '—', '+', ' ']) {
    assert.equal(rodilloDeGlifo(caracter), null, `${caracter} no deberia voltear`)
  }
})

test('un destino vacio no voltea', () => {
  assert.equal(rodilloDeGlifo(''), null)
})

test('los pasos se acotan: ni cero, ni negativos, ni mas largo que el alfabeto', () => {
  assert.equal(rodilloDeGlifo('M', 0).length, 2)
  assert.equal(rodilloDeGlifo('M', -5).length, 2)
  assert.equal(rodilloDeGlifo('M', 999).length, ALFABETO_SOLARI.length + 1)
  assert.equal(rodilloDeGlifo('M', 2.7).length, 3)
})

test('un rodillo de alfabeto entero no repite el destino a mitad de camino', () => {
  const rodillo = rodilloDeGlifo('M', ALFABETO_SOLARI.length)

  assert.equal(new Set(rodillo).size, ALFABETO_SOLARI.length)
})

test('el texto se resuelve caracter a caracter y en orden', () => {
  const glifos = rodilloDeTexto('AB')

  assert.equal(glifos.length, 2)
  assert.deepEqual(glifos.map((posicion) => posicion.glifo), ['A', 'B'])
})

test('el texto vacio no da ni una posicion', () => {
  assert.deepEqual(rodilloDeTexto(''), [])
})

test('un texto que no es texto no revienta la pared', () => {
  assert.deepEqual(rodilloDeTexto(null), [])
  assert.deepEqual(rodilloDeTexto(undefined), [])
  assert.deepEqual(rodilloDeTexto(42), [])
})

test('el tope de glifos animados es duro', () => {
  const largo = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP'
  const glifos = rodilloDeTexto(largo)

  // Se dibujan TODOS los caracteres: el tope apaga la animacion, nunca esconde informacion.
  assert.equal(glifos.length, largo.length)
  assert.equal(cuantasVoltean(glifos), TOPE_DE_GLIFOS)
  assert.equal(glifos.map((posicion) => posicion.glifo).join(''), largo)
})

test('el tope se puede bajar por llamada', () => {
  assert.equal(cuantasVoltean(rodilloDeTexto('ABCDEFGH', PASOS_POR_GLIFO, 3)), 3)
  assert.equal(cuantasVoltean(rodilloDeTexto('ABCDEFGH', PASOS_POR_GLIFO, 0)), 0)
})

test('los espacios no gastan presupuesto del tope', () => {
  // Cinco palabras de tres letras: quince caracteres que voltean y cuatro espacios que no.
  const glifos = rodilloDeTexto('ABC DEF GHI JKL MNO', PASOS_POR_GLIFO, 15)

  assert.equal(cuantasVoltean(glifos), 15)
  assert.equal(glifos.at(-1).rodillo.at(-1), 'O')
})

test('el texto se parte por punto de codigo y no por unidad UTF-16', () => {
  const glifos = rodilloDeTexto('A🙂B')

  assert.deepEqual(glifos.map((posicion) => posicion.glifo), ['A', '🙂', 'B'])
  assert.equal(glifos[1].rodillo, null)
})

test('el escalonado crece con la posicion y deja de crecer en el tope', () => {
  assert.equal(escalonDeGlifo(0), 0)
  assert.equal(escalonDeGlifo(3), 3)
  assert.equal(escalonDeGlifo(TOPE_DE_ESCALON_GLIFO), TOPE_DE_ESCALON_GLIFO)
  assert.equal(escalonDeGlifo(TOPE_DE_ESCALON_GLIFO + 50), TOPE_DE_ESCALON_GLIFO)
})

test('un indice absurdo no deja el escalonado en NaN', () => {
  assert.equal(escalonDeGlifo(-4), 0)
  assert.equal(escalonDeGlifo(Number.NaN), 0)
  assert.equal(escalonDeGlifo(Number.POSITIVE_INFINITY), 0)
})

test('el escalonado del texto viene ya acotado', () => {
  const glifos = rodilloDeTexto('ABCDEFGHIJKLMNOPQRSTUVWXYZ')

  assert.ok(glifos.every((posicion) => posicion.escalon <= TOPE_DE_ESCALON_GLIFO))
  assert.equal(glifos.at(-1).escalon, TOPE_DE_ESCALON_GLIFO)
})

test('la cinta del DOM pone el destino arriba del todo', () => {
  const cinta = cintaDeRodillo(['B', 'C', 'D', 'E'])

  assert.equal(cinta, 'E\nD\nC\nB')
  // La primera linea es la que se ve con `transform: none`, o sea el estado de reposo: el destino.
  assert.equal(cinta.split('\n')[0], 'E')
})

test('la cinta no toca el arreglo que recibe', () => {
  const rodillo = ['B', 'C', 'D']

  cintaDeRodillo(rodillo)

  assert.deepEqual(rodillo, ['B', 'C', 'D'])
})

test('un reloj que avanza un minuto solo cambia un caracter', () => {
  // Es la afirmacion de la que depende que el efecto sea barato: el componente da una `key` por
  // posicion y caracter, asi que solo se remontan —y solo animan— las posiciones que cambiaron.
  const antes = rodilloDeTexto('14:32').map((posicion, indice) => `${indice}:${posicion.glifo}`)
  const despues = rodilloDeTexto('14:33').map((posicion, indice) => `${indice}:${posicion.glifo}`)
  const cambiadas = despues.filter((clave, indice) => clave !== antes[indice])

  assert.deepEqual(cambiadas, ['4:3'])
})

test('un texto que se acorta pierde posiciones y no deja rastro del anterior', () => {
  const largo = rodilloDeTexto('Prioridad')
  const corto = rodilloDeTexto('Quién')

  assert.equal(largo.length, 9)
  assert.equal(corto.length, 5)
  assert.equal(corto.map((posicion) => posicion.glifo).join(''), 'Quién')
})
