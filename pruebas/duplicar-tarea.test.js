/**
 * Selector de "qué se copia" al duplicar una Tarea.
 *
 * Se prueba porque falla en silencio: una copia a la que le faltan los asignados, o a la que le
 * sobran, no rompe ninguna pantalla —se descubre despues, mirando la tarea nueva—. Lo que se fija
 * aca es que el modal arranque en lo mismo que hace la API con el cuerpo vacio y que el cuerpo que
 * viaja tenga exactamente las ocho claves del contrato.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COPIABLES,
  ETIQUETAS,
  copiaPorDefecto,
  cuantasMarcadas,
  cuerpoDeDuplicado,
  seleccionUniforme,
  todasMarcadas
} from '../src/componentes/proyecto/duplicar-tarea.ts'

test('por defecto solo se copia la descripcion, igual que la API con el cuerpo vacio', () => {
  assert.deepEqual(copiaPorDefecto(), {
    descripcion: true,
    asignados: false,
    seguidores: false,
    checklist: false,
    adjuntos: false,
    campos_personalizados: false,
    etiquetas: false,
    recordatorios: false
  })
})

test('cada cosa copiable tiene su nombre en la interfaz', () => {
  for (const clave of COPIABLES) {
    assert.equal(typeof ETIQUETAS[clave], 'string')
    assert.notEqual(ETIQUETAS[clave], '')
  }
})

test('marcar todo enciende las ocho y desmarcar todo las apaga', () => {
  assert.equal(todasMarcadas(seleccionUniforme(true)), true)
  assert.equal(cuantasMarcadas(seleccionUniforme(true)), COPIABLES.length)
  assert.equal(todasMarcadas(seleccionUniforme(false)), false)
  assert.equal(cuantasMarcadas(seleccionUniforme(false)), 0)
})

test('la seleccion por defecto no cuenta como "todo marcado"', () => {
  assert.equal(todasMarcadas(copiaPorDefecto()), false)
  assert.equal(cuantasMarcadas(copiaPorDefecto()), 1)
})

test('el cuerpo recorta el nombre y manda las ocho claves', () => {
  const cuerpo = cuerpoDeDuplicado('  Revisión semanal  ', copiaPorDefecto())

  assert.equal(cuerpo.nombre, 'Revisión semanal')
  assert.deepEqual(Object.keys(cuerpo.copiar).sort(), [...COPIABLES].sort())
})

test('una clave de mas en el estado no se cuela en el cuerpo', () => {
  const conBasura = { ...copiaPorDefecto(), comentarios: true }
  const cuerpo = cuerpoDeDuplicado('Copia', conBasura)

  assert.equal('comentarios' in cuerpo.copiar, false)
})

test('un nombre solo con espacios queda vacio, que es lo que el modal corta antes de enviar', () => {
  assert.equal(cuerpoDeDuplicado('   ', copiaPorDefecto()).nombre, '')
})
