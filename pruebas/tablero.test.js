/**
 * Pruebas de la logica del motor de Tablero.
 *
 * Es donde el kanban miente sin que se note: si `columna_completa` no lleva el orden exacto que ve
 * la persona, el backend reordena la columna entera con otro criterio y el arrastre "funciona" pero
 * deja el tablero distinto al del panel viejo. Lo mismo con el orden de las columnas: los ids de
 * estado de Perfex no siguen el orden de visualizacion.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarPagina,
  columnaIncompleta,
  moverTarjeta,
  ordenarGrupos,
  posicionAlSoltar
} from '../src/componentes/datos/tablero.ts'

/** Paginacion de una columna que llego entera. */
const completa = (total) => ({ page: 1, per_page: 25, total, total_pages: 1 })

/**
 * Tablero de prueba con los estados reales de Perfex: ids 1, 4, 3, 2, 5 en orden de visualizacion.
 */
function tablero () {
  return [
    { columna: { id: 1, name: 'Por iniciar', color: '#777', order: 1 }, tarjetas: [{ id: 10 }, { id: 11 }, { id: 12 }], pagination: completa(3) },
    { columna: { id: 4, name: 'En progreso', color: '#03a9f4', order: 2 }, tarjetas: [{ id: 20 }], pagination: completa(1) },
    { columna: { id: 5, name: 'Completado', color: '#84c529', order: 100 }, tarjetas: [], pagination: completa(0) }
  ]
}

test('las columnas se ordenan por `order` y no por id', () => {
  const desordenado = [
    { columna: { id: 5, name: 'Completado', color: null, order: 100 }, tarjetas: [], pagination: completa(0) },
    { columna: { id: 2, name: 'Esperando', color: null, order: 4 }, tarjetas: [], pagination: completa(0) },
    { columna: { id: 4, name: 'En progreso', color: null, order: 2 }, tarjetas: [], pagination: completa(0) },
    { columna: { id: 1, name: 'Por iniciar', color: null, order: 1 }, tarjetas: [], pagination: completa(0) },
    { columna: { id: 3, name: 'Probando', color: null, order: 3 }, tarjetas: [], pagination: completa(0) }
  ]

  assert.deepEqual(
    ordenarGrupos(desordenado).map((g) => g.columna.id),
    [1, 4, 3, 2, 5]
  )
})

test('ordenar no muta el arreglo recibido', () => {
  const grupos = tablero()
  ordenarGrupos(grupos)
  assert.equal(grupos[0].columna.id, 1)
})

test('mover a otra columna saca de la de origen y ajusta los dos contadores', () => {
  const { grupos } = moverTarjeta(tablero(), 11, 4, 0)

  assert.deepEqual(grupos[0].tarjetas.map((t) => t.id), [10, 12])
  assert.equal(grupos[0].pagination.total, 2)
  assert.deepEqual(grupos[1].tarjetas.map((t) => t.id), [11, 20])
  assert.equal(grupos[1].pagination.total, 2)
})

test('el cuerpo lleva la columna destino completa en el orden del cliente', () => {
  const { cuerpo } = moverTarjeta(tablero(), 11, 4, 1)

  // `posicion` es 1-based, no un indice: la API hace `posicion - 1` al insertar
  // (modules/api/Escritura/Tablero.php:44,125). La tarjeta queda segunda, asi que va 2.
  assert.deepEqual(cuerpo, { columna: 4, posicion: 2, columna_completa: [20, 11] })
})

test('reordenar dentro de la misma columna no toca el contador', () => {
  const { grupos, cuerpo } = moverTarjeta(tablero(), 12, 1, 0)

  assert.deepEqual(grupos[0].tarjetas.map((t) => t.id), [12, 10, 11])
  assert.equal(grupos[0].pagination.total, 3)
  assert.deepEqual(cuerpo.columna_completa, [12, 10, 11])
  assert.equal(cuerpo.posicion, 1, 'primera posicion es 1, no 0')
})

test('una posicion mas alla del final deja la tarjeta al fondo', () => {
  const { cuerpo } = moverTarjeta(tablero(), 10, 4, 99)

  assert.deepEqual(cuerpo.columna_completa, [20, 10])
  assert.equal(cuerpo.posicion, 2, 'ultima de dos es 2')
})

test('mover no muta el tablero anterior: revertir es volver a ponerlo', () => {
  const previo = tablero()
  moverTarjeta(previo, 11, 4, 0)

  assert.deepEqual(previo[0].tarjetas.map((t) => t.id), [10, 11, 12])
  assert.equal(previo[1].tarjetas.length, 1)
})

test('mover devuelve null si la tarjeta o la columna no existen', () => {
  assert.equal(moverTarjeta(tablero(), 999, 4, 0), null)
  assert.equal(moverTarjeta(tablero(), 11, 77, 0), null)
})

test('una columna con paginas sin cargar se detecta como incompleta', () => {
  const [primera] = tablero()
  assert.equal(columnaIncompleta(primera), false)

  const paginada = { ...primera, pagination: { page: 1, per_page: 25, total: 346, total_pages: 14 } }
  assert.equal(columnaIncompleta(paginada), true)
})

test('soltar mas abajo en la misma columna descuenta el lugar que libera la tarjeta', () => {
  const [primera] = tablero()

  // La tarjeta 10 esta en el indice 0: al sacarla, el indice 2 pasa a ser el 1.
  assert.equal(posicionAlSoltar(primera, 2, 10), 1)
  // Hacia arriba no hay corrimiento.
  assert.equal(posicionAlSoltar(primera, 0, 12), 0)
  // Viniendo de otra columna tampoco.
  assert.equal(posicionAlSoltar(primera, 2, 20), 2)
})

test('cargar mas extiende solo la columna que lo pidio', () => {
  const grupos = tablero()
  const extendido = agregarPagina(grupos, 1, [{ id: 13 }], { page: 2, per_page: 25, total: 4, total_pages: 2 })

  assert.deepEqual(extendido[0].tarjetas.map((t) => t.id), [10, 11, 12, 13])
  assert.equal(extendido[0].pagination.page, 2)
  assert.equal(extendido[1], grupos[1])
})

test('cargar mas descarta las tarjetas que ya estaban cargadas', () => {
  const grupos = tablero()
  const extendido = agregarPagina(grupos, 1, [{ id: 12 }, { id: 13 }], completa(4))

  assert.deepEqual(extendido[0].tarjetas.map((t) => t.id), [10, 11, 12, 13])
})
