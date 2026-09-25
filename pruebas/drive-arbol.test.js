/**
 * Reglas puras del árbol de Drive: el nombre que se acepta, los destinos que admite un traslado y
 * los valores por defecto de los campos que un backend viejo no manda.
 *
 * Son las mismas reglas que valida la API: si divergen, la pantalla deja mandar lo que el servidor
 * rechaza, o bloquea lo que el servidor aceptaría.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LARGO_MAXIMO_NOMBRE_DRIVE, esEditable, motivoNombreInvalido, puedeEscribirEn, quitarNodo, reemplazarNodo
} from '../src/dominio/drive-arbol.ts'
import { motivoParaNoSoltar } from '../src/dominio/drive-explorador.ts'

/** Los destinos del diálogo de mover, con la forma de antes: la ruta, el item y su carpeta. */
function motivoDestinoInvalido (ruta, itemId, padreId) {
  return motivoParaNoSoltar({ id: ruta[ruta.length - 1], ruta }, { ids: [itemId], padreId })
}

test('un nombre vacío o de puros espacios no sirve', () => {
  assert.notEqual(motivoNombreInvalido(''), null)
  assert.notEqual(motivoNombreInvalido('   '), null)
})

test('el tope de largo se mide sobre el nombre recortado', () => {
  assert.equal(motivoNombreInvalido('a'.repeat(LARGO_MAXIMO_NOMBRE_DRIVE)), null)
  assert.equal(motivoNombreInvalido(`  ${'a'.repeat(LARGO_MAXIMO_NOMBRE_DRIVE)}  `), null)
  assert.notEqual(motivoNombreInvalido('a'.repeat(LARGO_MAXIMO_NOMBRE_DRIVE + 1)), null)
})

test('la barra no se acepta en ninguna posición', () => {
  assert.notEqual(motivoNombreInvalido('01/Bases'), null)
  assert.notEqual(motivoNombreInvalido('/'), null)
  assert.equal(motivoNombreInvalido('01_Bases (versión final)'), null)
})

test('el propio item no es destino', () => {
  assert.notEqual(motivoDestinoInvalido(['raiz', 'a'], 'a', 'raiz'), null)
})

test('nada que cuelgue del item es destino', () => {
  assert.notEqual(motivoDestinoInvalido(['raiz', 'a', 'b'], 'a', 'raiz'), null)
  assert.notEqual(motivoDestinoInvalido(['raiz', 'a', 'b', 'c'], 'a', 'raiz'), null)
})

test('la carpeta donde ya está no es destino', () => {
  assert.notEqual(motivoDestinoInvalido(['raiz', 'x'], 'a', 'x'), null)
  assert.notEqual(motivoDestinoInvalido(['raiz'], 'a', 'raiz'), null)
})

test('una carpeta hermana, la raíz o una prima sí son destino', () => {
  assert.equal(motivoDestinoInvalido(['raiz', 'b'], 'a', 'raiz'), null)
  assert.equal(motivoDestinoInvalido(['raiz'], 'a', 'x'), null)
  assert.equal(motivoDestinoInvalido(['raiz', 'b', 'c'], 'a', 'raiz'), null)
})

test('sin can_write se puede escribir, y sin locked el nodo es editable', () => {
  assert.equal(puedeEscribirEn({}), true)
  assert.equal(puedeEscribirEn({ can_write: false }), false)
  assert.equal(esEditable({ id: 'a', name: 'a', is_folder: true, web_view_link: '' }), true)
  assert.equal(esEditable({ id: 'a', name: 'a', is_folder: true, web_view_link: '', locked: true }), false)
})

test('reemplazar conserva el orden y quitar saca solo ese id', () => {
  const lista = [
    { id: 'a', name: 'A', is_folder: true, web_view_link: '' },
    { id: 'b', name: 'B', is_folder: false, web_view_link: '' }
  ]

  assert.deepEqual(reemplazarNodo(lista, { ...lista[0], name: 'A2' }).map((n) => n.name), ['A2', 'B'])
  assert.deepEqual(quitarNodo(lista, 'a').map((n) => n.id), ['b'])
  assert.deepEqual(quitarNodo(lista, 'z').map((n) => n.id), ['a', 'b'])
})
