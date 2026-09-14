/**
 * Pruebas de la logica del menu que cambia el Hito de una Tarea desde su ficha.
 *
 * Lo que se rompe en silencio aca es la etiqueta: el cambio se pinta en optimista antes de que la
 * API conteste, y si el nombre no sale de las opciones ya cargadas la insignia se queda mostrando el
 * hito viejo aunque la tarea ya se haya movido.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaDeHito, rutaHitosDeEspacio } from '../src/componentes/proyecto/hito-de-tarea.ts'

test('la ruta de hitos pide el Espacio con el tope de la API', () => {
  assert.equal(rutaHitosDeEspacio(12), 'projects/12/milestones?per_page=100')
})

test('la etiqueta sale de las opciones cargadas', () => {
  const opciones = [
    { valor: '0', etiqueta: 'Sin hito' },
    { valor: '7', etiqueta: 'SEMANA 1' }
  ]

  assert.equal(etiquetaDeHito(opciones, 7, '#7'), 'SEMANA 1')
  assert.equal(etiquetaDeHito(opciones, 0, 'Sin hito'), 'Sin hito')
})

test('un hito que no esta entre las opciones cae al respaldo', () => {
  assert.equal(etiquetaDeHito([], 7, '#7'), '#7')
})
