/**
 * Agrupacion del feed de actividad por dia.
 *
 * Lo que se prueba es lo que se rompe en silencio: que el dia se decida en la zona del panel y no en
 * UTC —una entrada de las 23:00 de Buenos Aires es 02:00 UTC del dia siguiente, y agruparla mal
 * mueve media jornada al dia equivocado— y que la agrupacion no reordene lo que el backend ordeno.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorDia,
  autorDeEntrada,
  horaDeEntrada
} from '../src/componentes/proyecto/actividad.ts'

/** Una entrada del feed con lo minimo que la agrupacion mira. */
function entrada (id, fecha, extra = {}) {
  return {
    id,
    description: `evento ${id}`,
    additional_data: null,
    date_added: fecha,
    visible_to_customer: false,
    staff: null,
    contact: null,
    ...extra
  }
}

test('un feed vacio no produce ningun dia', () => {
  assert.deepEqual(agruparPorDia([]), [])
})

test('las entradas del mismo dia caen en un solo bloque', () => {
  const dias = agruparPorDia([
    entrada(1, '2026-08-24T14:03:00Z'),
    entrada(2, '2026-08-24T09:30:00Z')
  ])

  assert.equal(dias.length, 1)
  assert.deepEqual(dias[0].entradas.map((e) => e.id), [1, 2])
})

test('el dia se decide en la zona del panel, no en UTC', () => {
  // 02:00 UTC del 25 son las 23:00 del 24 en Buenos Aires: es el MISMO dia que la primera entrada.
  const dias = agruparPorDia([
    entrada(1, '2026-08-25T02:00:00Z'),
    entrada(2, '2026-08-24T14:03:00Z')
  ])

  assert.equal(dias.length, 1, 'agrupar en UTC habria partido el dia en dos')
})

test('cambiar de dia abre un bloque nuevo', () => {
  const dias = agruparPorDia([
    entrada(1, '2026-08-24T14:03:00Z'),
    entrada(2, '2026-08-23T14:03:00Z')
  ])

  assert.equal(dias.length, 2)
  assert.deepEqual(dias.map((d) => d.entradas.length), [1, 1])
})

test('no se reordena el feed: un dia que vuelve mas abajo es otro bloque', () => {
  const dias = agruparPorDia([
    entrada(1, '2026-08-24T14:03:00Z'),
    entrada(2, '2026-08-23T14:03:00Z'),
    entrada(3, '2026-08-24T08:00:00Z')
  ])

  assert.equal(dias.length, 3)
  assert.deepEqual(dias.map((d) => d.entradas[0].id), [1, 2, 3])
})

test('las entradas sin fecha se agrupan bajo el guion largo', () => {
  const dias = agruparPorDia([entrada(1, null), entrada(2, null)])

  assert.equal(dias.length, 1)
  assert.equal(dias[0].titulo, '—')
})

test('la hora sale sin la fecha', () => {
  // El texto exacto lo pone `Intl` segun el locale ("11:03 a. m." en es-AR, con el espacio que el
  // CLDR decida): lo que se comprueba es que quede la hora y no quede nada de la fecha.
  const hora = horaDeEntrada('2026-08-24T14:03:00Z')

  assert.ok(hora.startsWith('11:03'), `esperaba que empezara con la hora, llego "${hora}"`)
  assert.ok(!hora.includes('2026'), `esperaba que no quedara la fecha, llego "${hora}"`)
})

test('una entrada sin fecha muestra el guion largo, no un hueco', () => {
  assert.equal(horaDeEntrada(null), '—')
  assert.equal(horaDeEntrada('no es una fecha'), '—')
})

test('el autor es el staff, el contacto, o el sistema', () => {
  assert.equal(
    autorDeEntrada(entrada(1, null, { staff: { id: 3, full_name: 'Ana Ruiz', profile_image_url: null } })),
    'Ana Ruiz'
  )
  assert.equal(
    autorDeEntrada(entrada(1, null, { contact: { id: 9, full_name: 'Cliente Uno' } })),
    'Cliente Uno'
  )
  assert.equal(autorDeEntrada(entrada(1, null)), 'Sistema')
})
