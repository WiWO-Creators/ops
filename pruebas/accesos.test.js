/**
 * Pruebas del panel de accesos.
 *
 * Lo que se protege son cuatro cosas que, si se rompen, reparten permisos mal y en silencio:
 *
 *   1. Que los filtros vacíos **no viajen** en la consulta de personas. Mandar `escalon=` obligaría a
 *      la API a decidir si eso es "sin escalón" o "cualquiera".
 *   2. Que el árbol **no se trague a nadie**: quien cuelga de un jefe que no está en la lista tiene
 *      que subir a la raíz, no desaparecer. Un árbol que esconde gente es el problema que esta
 *      pantalla vino a resolver.
 *   3. Que un árbol con un **ciclo** no cuelgue la pantalla ni pierda filas. Los datos pueden traerlo
 *      —la base no siempre lo impidió— y el recorrido tiene que terminar igual.
 *   4. Que el buscador de jefe **no ofrezca un ciclo**: la persona y toda su descendencia quedan
 *      fuera, porque la API las rechaza con 422 y descubrirlo al guardar no explica nada.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  arbolDePersonas,
  consultaDePersonas,
  descendenciaDe,
  estaEncendido,
  jefesPosiblesPara,
  motivoParaRechazarNombre
} from '../src/dominio/accesos.ts'

/** Un nodo del árbol con lo mínimo, para no repetir el objeto entero en cada prueba. */
function nodo (staffid, nombre, jefe = null, escalon = 'staff') {
  return { staffid, nombre, escalon, jefe_staffid: jefe }
}

test('los filtros vacíos no viajan en la consulta de personas', () => {
  assert.equal(consultaDePersonas({ buscar: '', escalon: '', area: '' }, 1), '')
  assert.equal(consultaDePersonas({ buscar: '  ', escalon: '', area: '' }, 1), '')
})

test('la consulta lleva lo que sí está puesto, y la página solo a partir de la segunda', () => {
  assert.equal(
    consultaDePersonas({ buscar: ' Ana ', escalon: 'lead', area: '3' }, 2),
    '?buscar=Ana&escalon=lead&area=3&pagina=2'
  )
  assert.equal(consultaDePersonas({ buscar: '', escalon: 'gerencia', area: '' }, 1), '?escalon=gerencia')
})

test('un nombre vacío, uno larguísimo y uno repetido se frenan antes del viaje', () => {
  assert.equal(motivoParaRechazarNombre('   '), 'El nombre no puede quedar vacío.')
  assert.match(motivoParaRechazarNombre('x'.repeat(81)), /80 caracteres/)
  assert.match(motivoParaRechazarNombre('Diseño', ['  diseño ']), /Ya existe/)
  assert.equal(motivoParaRechazarNombre('Diseño', ['Producto']), null)
})

test('solo el uno enciende un interruptor de tbloptions', () => {
  assert.equal(estaEncendido('1'), true)
  assert.equal(estaEncendido('0'), false)
  assert.equal(estaEncendido(''), false)
})

test('el árbol cuelga a cada persona de su jefe y ordena por nombre', () => {
  const ramas = arbolDePersonas([
    nodo(3, 'Carla', 1),
    nodo(1, 'Ana', null, 'gerencia'),
    nodo(2, 'Bruno', 1),
    nodo(4, 'Diego', 2)
  ])

  assert.equal(ramas.length, 1, 'una sola raíz: Ana')
  assert.equal(ramas[0].nodo.nombre, 'Ana')
  assert.deepEqual(ramas[0].hijas.map((hija) => hija.nodo.nombre), ['Bruno', 'Carla'])
  assert.equal(ramas[0].hijas[0].hijas[0].nodo.nombre, 'Diego')
  assert.equal(ramas[0].hijas[0].hijas[0].profundidad, 2)
})

/** Un jefe que no está en la lista —una cuenta de baja— no puede hacer desaparecer a su gente. */
test('quien cuelga de alguien que no está en la lista sube a la raíz', () => {
  const ramas = arbolDePersonas([nodo(1, 'Ana', 99), nodo(2, 'Bruno', null)])

  assert.deepEqual(ramas.map((rama) => rama.nodo.nombre), ['Ana', 'Bruno'])
})

test('un ciclo en los datos no cuelga el recorrido ni pierde a nadie', () => {
  const ramas = arbolDePersonas([nodo(1, 'Ana', 2), nodo(2, 'Bruno', 1)])

  assert.equal(ramas.length, 1, 'el grupo encerrado en el ciclo se promueve a raíz')
  assert.equal(ramas[0].nodo.nombre, 'Ana')
  assert.deepEqual(ramas[0].hijas.map((hija) => hija.nodo.nombre), ['Bruno'])
  assert.equal(ramas[0].hijas[0].hijas.length, 0, 'la cadena se corta antes de repetir')
})

test('la descendencia incluye a la persona y a todo lo que cuelga de ella', () => {
  const nodos = [nodo(1, 'Ana'), nodo(2, 'Bruno', 1), nodo(3, 'Carla', 2), nodo(4, 'Diego')]

  assert.deepEqual([...descendenciaDe(nodos, 1)].sort(), [1, 2, 3])
  assert.deepEqual([...descendenciaDe(nodos, 4)], [4])
})

test('el buscador de jefe no ofrece a la persona ni a su propia gente', () => {
  const nodos = [nodo(1, 'Ana'), nodo(2, 'Bruno', 1), nodo(3, 'Carla', 2), nodo(4, 'Diego')]
  const persona = { staffid: 1, nombre: 'Ana', correo: 'ana@wiwo.me', escalon: 'gerencia', jefe_staffid: null, jefe_nombre: null, area_id: null, cargo_id: null, activo: true }

  assert.deepEqual(jefesPosiblesPara(nodos, persona).map((uno) => uno.nombre), ['Diego'])
})
