/**
 * Pruebas del resumen, el filtro y el orden de la pantalla de Focals.
 *
 * Lo que se verifica es lo que nadie ve fallar: un recuento equivocado dice un número cualquiera con
 * toda confianza, y es el número con el que alguien decide a quién llamar. Se prueba también que
 * "sin focal" sea una condición aparte y no un tramo —una cuenta al día sin focal tiene que caer en
 * ese filtro— y que buscar sin acentos encuentre lo que los tiene, que es como se escribe en la vida
 * real.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  filtrarCartera,
  nombreDeCuenta,
  ordenarCartera,
  resumirCartera
} from '../src/dominio/cartera.ts'

/** Las tres señales, con la forma mínima que el tipo exige. */
function senales () {
  return {
    plazos: { valor: 0, peso: 0, tareas: 0, incumplidas: 0, atraso_promedio: 0 },
    carga: { valor: 0, peso: 0, abiertas: 0, por_persona: 0 },
    vencimientos: { valor: 0, peso: 0, vencidas: 0, proximas: 0 }
  }
}

/**
 * Una cuenta de la cartera.
 *
 * @param id el cliente
 * @param semaforo su tramo
 * @param focales los nombres de quienes responden por ella
 * @param espacios los tramos de sus Proyectos, en orden
 */
function cuenta (id, semaforo, focales = [], espacios = [], nombre = `Cliente ${id}`) {
  return {
    cliente: {
      client_id: id,
      cliente: nombre,
      fecha: '2026-09-14',
      score: semaforo === 'sin_datos' ? null : 50,
      semaforo,
      variacion: null,
      espacios: espacios.length,
      procesos: 0,
      senales: senales(),
      focales: focales.map((full_name, indice) => ({ staffid: indice + 1, full_name }))
    },
    espacios: espacios.map((tramo, indice) => ({
      project_id: id * 100 + indice,
      espacio: `Proyecto ${id}-${indice}`,
      client_id: id,
      cliente: nombre,
      fecha: '2026-09-14',
      score: tramo === 'sin_datos' ? null : 40,
      semaforo: tramo,
      variacion: null,
      procesos: 0,
      senales: senales(),
      estado: null
    }))
  }
}

test('el resumen cuenta cada tramo, los Proyectos y las cuentas sin focal', () => {
  const cartera = [
    cuenta(1, 'rojo', ['Ana'], ['rojo', 'rojo', 'verde']),
    cuenta(2, 'rojo', [], ['rojo']),
    cuenta(3, 'verde', ['Beto'], ['verde']),
    cuenta(4, 'sin_datos', [], [])
  ]

  const resumen = resumirCartera(cartera)

  assert.equal(resumen.cuentas, 4)
  assert.equal(resumen.porTramo.rojo, 2)
  assert.equal(resumen.porTramo.verde, 1)
  assert.equal(resumen.porTramo.amarillo, 0)
  assert.equal(resumen.porTramo.sin_datos, 1)
  assert.equal(resumen.sinFocal, 2)
  assert.equal(resumen.espacios, 5)
  assert.equal(resumen.espaciosCriticos, 3)
})

test('un focal con el nombre en blanco cuenta como cuenta sin focal', () => {
  // Una persona dada de alta sin nombre pinta una insignia vacía: para esta pantalla es lo mismo que
  // no tener a nadie nombrado, y el recuento tiene que decir lo mismo que se ve.
  const resumen = resumirCartera([cuenta(1, 'verde', ['   '], [])])

  assert.equal(resumen.sinFocal, 1)
})

test('el resumen de una cartera vacía es todo ceros y no revienta', () => {
  const resumen = resumirCartera([])

  assert.deepEqual(resumen.porTramo, { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 })
  assert.equal(resumen.cuentas, 0)
  assert.equal(resumen.espacios, 0)
})

test('el filtro por tramo deja solo las cuentas de ese tramo', () => {
  const cartera = [cuenta(1, 'rojo'), cuenta(2, 'verde'), cuenta(3, 'rojo')]

  assert.deepEqual(
    filtrarCartera(cartera, '', 'rojo').map((una) => una.cliente.client_id),
    [1, 3]
  )
})

test('"sin focal" atrapa también a una cuenta al día', () => {
  // Es justamente el caso que el filtro existe para encontrar: nada arde, pero no hay a quién
  // reclamarle cuando empiece a arder.
  const cartera = [cuenta(1, 'verde', []), cuenta(2, 'verde', ['Ana'])]

  assert.deepEqual(
    filtrarCartera(cartera, '', 'sin_focal').map((una) => una.cliente.client_id),
    [1]
  )
})

test('el buscador encuentra sin acentos y por el nombre del Proyecto o del focal', () => {
  const cartera = [
    cuenta(1, 'rojo', ['Ana Pérez'], [], 'Analítica Sur'),
    cuenta(2, 'verde', ['Beto'], ['rojo'], 'Otra cuenta')
  ]

  cartera[1].espacios[0].espacio = 'Rediseño del sitio'

  assert.deepEqual(filtrarCartera(cartera, 'analitica', 'todas').map(nombreDeCuenta), ['Analítica Sur'])
  assert.deepEqual(filtrarCartera(cartera, 'PEREZ', 'todas').map(nombreDeCuenta), ['Analítica Sur'])
  assert.deepEqual(filtrarCartera(cartera, 'rediseno', 'todas').map(nombreDeCuenta), ['Otra cuenta'])
  assert.equal(filtrarCartera(cartera, '   ', 'todas').length, 2)
})

test('el filtro y el texto se aplican juntos, no uno o el otro', () => {
  const cartera = [cuenta(1, 'rojo', [], [], 'Norte'), cuenta(2, 'verde', [], [], 'Norte grande')]

  assert.deepEqual(filtrarCartera(cartera, 'norte', 'rojo').map(nombreDeCuenta), ['Norte'])
})

test('"peor primero" respeta el orden que puso el servidor', () => {
  const cartera = [cuenta(3, 'rojo'), cuenta(1, 'verde'), cuenta(2, 'amarillo')]

  assert.deepEqual(
    ordenarCartera(cartera, 'peor').map((una) => una.cliente.client_id),
    [3, 1, 2]
  )
})

test('ordenar por críticos cuenta los Proyectos en rojo, no el score del cliente', () => {
  const cartera = [
    cuenta(1, 'rojo', [], ['rojo']),
    cuenta(2, 'verde', [], ['rojo', 'rojo', 'verde']),
    cuenta(3, 'rojo', [], [])
  ]

  assert.deepEqual(
    ordenarCartera(cartera, 'criticos').map((una) => una.cliente.client_id),
    [2, 1, 3]
  )
})

test('ordenar por nombre usa el orden del español y no toca el arreglo de entrada', () => {
  const cartera = [cuenta(1, 'rojo', [], [], 'Ñandú'), cuenta(2, 'rojo', [], [], 'Abastible')]
  const copia = ordenarCartera(cartera, 'nombre')

  assert.deepEqual(copia.map(nombreDeCuenta), ['Abastible', 'Ñandú'])
  assert.deepEqual(cartera.map(nombreDeCuenta), ['Ñandú', 'Abastible'])
})

test('un cliente sin nombre se muestra con su id y se puede buscar igual', () => {
  const sinNombre = cuenta(7, 'rojo')
  sinNombre.cliente.cliente = null

  assert.equal(nombreDeCuenta(sinNombre), 'Cliente #7')
  assert.equal(filtrarCartera([sinNombre], '#7', 'todas').length, 1)
})
