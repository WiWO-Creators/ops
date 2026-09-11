/**
 * Pruebas del árbol de dependencias: cómo se arma el bosque y qué no se puede ofrecer como superior.
 *
 * Las dos cosas se rompen en silencio y de la peor manera. Un armado que pierde un área la borra de
 * la pantalla —y con ella la posibilidad de arreglarla—; y un ciclo en los datos, que la API rechaza
 * al escribir pero que puede quedar de un `UPDATE` a mano, cuelga el navegador en un bucle infinito
 * en vez de dar un error.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarArbol, areasProhibidasComoSuperior } from '../src/datos/jerarquia.ts'

/** Un área con lo justo para armar el árbol. */
const area = (id, superior, extra = {}) => ({
  id,
  name: `Área ${id}`,
  area_superior_id: superior,
  jefe_staffid: null,
  editable: true,
  personas: [],
  ...extra
})

/** Los ids de un bosque, en profundidad, para comparar sin escribir el objeto entero. */
const idsDe = (nodos) => nodos.flatMap((nodo) => [nodo.area.id, ...idsDe(nodo.hijas)])

test('el árbol vacío es un bosque vacío, que es el estado real de hoy', () => {
  assert.deepEqual(armarArbol([]), [])
})

test('las áreas sin superior son las raíces, y las hijas cuelgan de la suya', () => {
  const raices = armarArbol([area(1, null), area(2, 1), area(3, 2), area(9, null)])

  assert.deepEqual(raices.map((nodo) => nodo.area.id), [1, 9])
  assert.deepEqual(idsDe(raices), [1, 2, 3, 9])
})

test('una jefatura recibe sólo su rama: su raíz cuelga de un área que no le llegó', () => {
  // El área 2 dice colgar de la 1, que no está en la lista. Si no se rescatara como raíz, la
  // jefatura de la 2 no vería nada.
  const raices = armarArbol([area(2, 1), area(3, 2)])

  assert.deepEqual(raices.map((nodo) => nodo.area.id), [2])
  assert.deepEqual(idsDe(raices), [2, 3])
})

test('un ciclo no cuelga la pantalla ni se traga las áreas', () => {
  // 1 -> 2 -> 1. Ninguna es raíz por sí sola, y sin el rescate desaparecerían las dos.
  const raices = armarArbol([area(1, 2), area(2, 1)])

  assert.deepEqual(idsDe(raices).sort(), [1, 2])
})

test('un área que dice colgar de sí misma se dibuja como raíz', () => {
  const raices = armarArbol([area(1, 1)])

  assert.deepEqual(raices.map((nodo) => nodo.area.id), [1])
})

test('no se puede ofrecer como superior ni el área misma ni su descendencia', () => {
  const areas = [area(1, null), area(2, 1), area(3, 2), area(9, null)]
  const prohibidas = areasProhibidasComoSuperior(areas, 1)

  assert.ok(prohibidas.has(1), 'ella misma')
  assert.ok(prohibidas.has(2), 'su hija')
  assert.ok(prohibidas.has(3), 'su nieta')
  assert.ok(!prohibidas.has(9), 'una rama aparte sí se puede elegir')
})

test('colgar una hoja de cualquier otra rama está permitido: reordenar no es dar vueltas', () => {
  const areas = [area(1, null), area(2, 1), area(3, 2)]
  const prohibidas = areasProhibidasComoSuperior(areas, 3)

  assert.deepEqual([...prohibidas], [3])
})

test('un ciclo en los datos no cuelga el cálculo de prohibidas', () => {
  const prohibidas = areasProhibidasComoSuperior([area(1, 2), area(2, 1)], 1)

  assert.deepEqual([...prohibidas].sort(), [1, 2])
})
