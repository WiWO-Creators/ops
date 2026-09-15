/**
 * Pruebas del editor de pantallas.
 *
 * Lo que se cuida acá es lo que se rompe en silencio al reordenar una lista: un elemento que se
 * pierde al moverlo, una configuracion que se queda sin escenas —y deja un televisor en negro sin que
 * nadie lo vea— o un boton de guardar que se habilita cuando no hay nada que guardar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASES_CONFIGURABLES, SEGUNDOS_MAXIMO, SEGUNDOS_MINIMO, alternar, durar, duracionDeLaVuelta,
  iguales, mover
} from '../src/dominio/pantallas-panel.ts'

/** Las cinco encendidas, como nace una pantalla. */
function todas () {
  return CLASES_CONFIGURABLES.map((clase) => ({ clase, segundos: clase === 'portada' ? 12 : 20 }))
}

test('apagar una escena la saca de la lista y conserva el resto', () => {
  const quedan = alternar(todas(), 'cronometros')

  assert.deepEqual(quedan.map((e) => e.clase), ['portada', 'trabajando', 'procesos', 'espacios'])
})

test('encender una escena la pone al final, donde el ojo la busca', () => {
  const sinPortada = alternar(todas(), 'portada')
  const vuelve = alternar(sinPortada, 'portada')

  assert.equal(vuelve[vuelve.length - 1].clase, 'portada')
  assert.equal(vuelve.length, 5)
})

test('la ultima escena encendida NO se puede apagar', () => {
  const una = [{ clase: 'procesos', segundos: 20 }]

  assert.equal(alternar(una, 'procesos'), una, 'devuelve la misma lista: no pasa nada')
})

test('mover cambia el orden sin perder ni duplicar nada', () => {
  const movida = mover(todas(), 'espacios', -1)

  assert.deepEqual(movida.map((e) => e.clase), ['portada', 'trabajando', 'cronometros', 'espacios', 'procesos'])
  assert.equal(movida.length, 5, 'ni se pierde ni se duplica')
})

test('en los extremos, mover no hace nada', () => {
  const escenas = todas()

  assert.equal(mover(escenas, 'portada', -1), escenas, 'la primera no sube')
  assert.equal(mover(escenas, 'espacios', 1), escenas, 'la ultima no baja')
  assert.equal(mover(escenas, 'inventada', 1), escenas, 'una que no esta, tampoco')
})

test('mover y devolver deja la lista como estaba', () => {
  const antes = todas()
  const ida = mover(antes, 'procesos', -1)
  const vuelta = mover(ida, 'procesos', 1)

  assert.ok(iguales(antes, vuelta))
})

test('la duracion se acota al escribirla, no al guardarla', () => {
  assert.equal(durar(todas(), 'procesos', 9999).find((e) => e.clase === 'procesos').segundos, SEGUNDOS_MAXIMO)
  assert.equal(durar(todas(), 'procesos', 1).find((e) => e.clase === 'procesos').segundos, SEGUNDOS_MINIMO)
  assert.equal(durar(todas(), 'procesos', 45).find((e) => e.clase === 'procesos').segundos, 45)
})

test('un campo vacio no convierte la duracion en NaN', () => {
  const escenas = todas()

  // `Number('')` es 0 y `Number('abc')` es NaN: el segundo llegaria a la API y volveria como 422.
  assert.equal(durar(escenas, 'procesos', Number('abc')), escenas, 'no se toca la lista')
  assert.equal(durar(escenas, 'procesos', Number('')).find((e) => e.clase === 'procesos').segundos, SEGUNDOS_MINIMO)
})

test('iguales compara el orden, no solo el conjunto', () => {
  const antes = todas()
  const reordenadas = mover(antes, 'procesos', -1)

  assert.ok(iguales(antes, [...antes]), 'una copia es igual')
  assert.ok(!iguales(antes, reordenadas), 'mover una de sitio es un cambio')
  assert.ok(!iguales(antes, durar(antes, 'procesos', 45)), 'cambiar la duracion tambien')
  assert.ok(!iguales(antes, alternar(antes, 'portada')), 'y apagar una, tambien')
})

test('la vuelta entera suma lo que dura cada escena', () => {
  assert.equal(duracionDeLaVuelta(todas()), 12 + 20 * 4)
  assert.equal(duracionDeLaVuelta([]), 0)
})
