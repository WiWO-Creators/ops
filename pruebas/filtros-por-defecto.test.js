/**
 * Pruebas del reposo de una vista (`filtrosPorDefecto`): lo que vale cuando la URL no dice nada, la
 * salida explicita "todos" y que a la API nunca llegue el marcador de la URL.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTRO_TODOS_EN_URL,
  construirConsulta,
  construirConsultaDeUrl,
  leerConsulta,
  mismosValores,
  seApartaDelReposo
} from '../src/datos/consulta.ts'
import { TICKETS, definicionDeTicketsDelProyecto } from '../src/definiciones/tickets.ts'
import { ESTADOS_TICKET_ABIERTOS, ESTADO_TICKET_CERRADO } from '../src/dominio/ticket-vista.ts'

const ABIERTOS = ESTADOS_TICKET_ABIERTOS.map(String)

/** Lee una consulta de URL escrita a mano contra la bandeja de tickets. */
function leer (consulta) {
  return leerConsulta(new URLSearchParams(consulta), TICKETS)
}

test('el reposo de la bandeja son todos los estados menos Cerrado', () => {
  assert.ok(!ESTADOS_TICKET_ABIERTOS.includes(ESTADO_TICKET_CERRADO))
  assert.deepEqual(TICKETS.filtrosPorDefecto, { status: ABIERTOS.join(',') })
  assert.ok(TICKETS.filtros.some((f) => f.clave === 'status' && f.etiquetaDelDefecto === 'Abiertos'))
})

test('cada default apunta a un filtro declarado', () => {
  for (const clave of Object.keys(TICKETS.filtrosPorDefecto)) {
    assert.ok(TICKETS.filtros.some((f) => f.clave === clave), clave)
  }
})

test('una URL sin filtros toma el default', () => {
  assert.deepEqual(leer('').filtros.status, ABIERTOS)
})

test('una URL con otros filtros conserva el default de Estado', () => {
  const estado = leer('filter[priority]=2')

  assert.deepEqual(estado.filtros.status, ABIERTOS)
  assert.deepEqual(estado.filtros.priority, ['2'])
})

test('una URL con estados manda sobre el default', () => {
  assert.deepEqual(leer('filter[status]=5').filtros.status, ['5'])
})

test('"todos" es la salida explicita: estado vacio y nada de Estado hacia la API', () => {
  const estado = leer(`filter[status]=${FILTRO_TODOS_EN_URL}`)

  assert.deepEqual(estado.filtros.status, [])
  assert.ok(!construirConsulta(estado, TICKETS).includes('status'))
})

test('un parametro vacio tambien pide no filtrar', () => {
  assert.deepEqual(leer('filter[status]=').filtros.status, [])
})

test('a la API el default viaja como lista de estados', () => {
  const params = new URLSearchParams(construirConsulta(leer(''), TICKETS))

  assert.equal(params.get('filter[status]'), ABIERTOS.join(','))
})

test('la URL recuerda "todos" y la API no lo recibe nunca', () => {
  const estado = { ...leer(''), filtros: { status: [] } }

  assert.equal(new URLSearchParams(construirConsultaDeUrl(estado, TICKETS)).get('filter[status]'), FILTRO_TODOS_EN_URL)
  assert.equal(new URLSearchParams(construirConsulta(estado, TICKETS)).get('filter[status]'), null)
})

test('la URL con "todos" se lee igual que se escribio', () => {
  const estado = { ...leer(''), filtros: { status: [] } }
  const releido = leerConsulta(new URLSearchParams(construirConsultaDeUrl(estado, TICKETS)), TICKETS)

  assert.deepEqual(releido.filtros.status, [])
})

test('"Limpiar" (filtros vacios) vuelve al default', () => {
  const limpio = { ...leer('filter[status]=5'), filtros: {} }

  assert.deepEqual(leerConsulta(new URLSearchParams(construirConsultaDeUrl(limpio, TICKETS)), TICKETS).filtros.status, ABIERTOS)
})

test('seApartaDelReposo distingue el default de lo cambiado', () => {
  assert.equal(seApartaDelReposo(leer(''), TICKETS), false)
  assert.equal(seApartaDelReposo(leer('filter[status]=5'), TICKETS), true)
  assert.equal(seApartaDelReposo(leer(`filter[status]=${FILTRO_TODOS_EN_URL}`), TICKETS), true)
  assert.equal(seApartaDelReposo(leer('filter[priority]=2'), TICKETS), true)
  assert.equal(seApartaDelReposo(leer('q=hola'), TICKETS), true)
})

test('la pestaña de un Proyecto no tiene default y "todos" no significa nada ahi', () => {
  const definicion = definicionDeTicketsDelProyecto(7)

  assert.equal(definicion.filtrosPorDefecto, undefined)
  assert.deepEqual(leerConsulta(new URLSearchParams(''), definicion).filtros, {})
  assert.deepEqual(leerConsulta(new URLSearchParams('filter[status]=todos'), definicion).filtros.status, ['todos'])
})

test('mismosValores ignora orden y repetidos', () => {
  assert.equal(mismosValores(['1', '2'], ['2', '1']), true)
  assert.equal(mismosValores(['1'], ['1', '2']), false)
})
