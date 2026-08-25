/**
 * Exportacion a CSV.
 *
 * El escapado es la parte que se rompe en silencio: un nombre de proyecto con coma parte la fila y la
 * planilla queda corrida sin que nadie se entere hasta que la abre el cliente.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarCsv, celdaComoTexto, nombreDeExportacion } from '../src/componentes/datos/csv.ts'

const COLUMNAS = [
  { clave: 'name', encabezado: 'Nombre', presentar: (f) => f.name },
  { clave: 'total', encabezado: 'Total', presentar: (f) => f.total }
]

test('escapa comas, comillas y saltos de linea', () => {
  const csv = armarCsv(COLUMNAS, [{ name: 'NESTLÉ, S.A.', total: 3 }, { name: 'Dice "hola"', total: 0 }])

  assert.equal(csv, 'Nombre,Total\r\n"NESTLÉ, S.A.",3\r\n"Dice ""hola""",0')
})

test('una lista vacia deja solo el encabezado', () => {
  assert.equal(armarCsv(COLUMNAS, []), 'Nombre,Total')
})

test('celdaComoTexto descarta lo que no es texto ni numero', () => {
  assert.equal(celdaComoTexto(null), '')
  assert.equal(celdaComoTexto(undefined), '')
  assert.equal(celdaComoTexto({ type: 'div' }), '')
  assert.equal(celdaComoTexto(NaN), '')
  assert.equal(celdaComoTexto(0), '0')
})

test('el nombre del archivo no lleva acentos ni espacios', () => {
  assert.equal(nombreDeExportacion('Proyectos', new Date('2026-08-25T12:00:00Z')), 'proyectos-2026-08-25.csv')
})
