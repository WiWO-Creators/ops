/**
 * Columnas dinamicas y valores de campo personalizado del listado de Espacios.
 *
 * Las columnas de campos personalizados las administra Perfex: si `show_on_table` deja de respetarse
 * aparecen columnas que nadie pidio, y si el `<br />` de los `textarea` no se limpia la celda muestra
 * HTML crudo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESPACIOS,
  columnasDeCamposPersonalizados,
  espaciosConCampos,
  textoDeCampo,
  valorDeCampo
} from '../src/definiciones/espacios.ts'
import { hoyLocal } from '../src/lib/fechas.ts'

const CAMPOS = [
  { id: 8, slug: 'projects_palabra_clave', name: 'Palabra Clave', type: 'textarea', options: null, required: false, order: 2, default_value: '', only_admin: false, show_on_table: true },
  { id: 4, slug: 'projects_n_de_cotizaciion', name: 'N° de Cotización', type: 'number', options: null, required: true, order: 1, default_value: '', only_admin: false, show_on_table: true },
  { id: 9, slug: 'projects_interno', name: 'Interno', type: 'input', options: null, required: false, order: 3, default_value: '', only_admin: false, show_on_table: false }
]

test('solo los campos con show_on_table se vuelven columna, ordenados por order', () => {
  const columnas = columnasDeCamposPersonalizados(CAMPOS)

  assert.deepEqual(columnas.map((c) => c.encabezado), ['N° de Cotización', 'Palabra Clave'])
  assert.equal(columnas[0].numerica, true)
})

test('las columnas de campo personalizado no son ordenables: el backend no lo acepta', () => {
  for (const columna of columnasDeCamposPersonalizados(CAMPOS)) {
    assert.equal(columna.ordenPor, undefined)
  }
})

test('espaciosConCampos no muta la definicion base', () => {
  const antes = ESPACIOS.columnas.length
  const ampliada = espaciosConCampos(CAMPOS)

  assert.equal(ESPACIOS.columnas.length, antes)
  assert.equal(ampliada.columnas.length, antes + 2)
  assert.equal(ampliada.ruta, ESPACIOS.ruta)
})

test('textoDeCampo devuelve saltos reales y nunca etiquetas', () => {
  assert.equal(textoDeCampo('uno<br />dos'), 'uno\ndos')
  assert.equal(textoDeCampo('<b>hola</b>'), 'hola')
  assert.equal(textoDeCampo(null), '')
})

test('valorDeCampo tolera una fila sin custom_fields', () => {
  assert.equal(valorDeCampo({ custom_fields: undefined }, 'projects_palabra_clave'), '')
  assert.equal(
    valorDeCampo({ custom_fields: [{ id: 4, slug: 'projects_n_de_cotizaciion', name: 'N', type: 'number', value: '00000' }] }, 'projects_n_de_cotizaciion'),
    '00000'
  )
})

test('la columna # ordena por un campo declarado en ordenables', () => {
  const columna = ESPACIOS.columnas.find((c) => c.clave === 'id')

  assert.equal(columna.ordenPor, 'id')
  assert.ok(ESPACIOS.ordenables.includes('id'))
})

test('hoyLocal toma el dia local, no el de UTC', () => {
  // 23:30 en Buenos Aires (UTC-3) ya es el dia siguiente en UTC: el formulario tiene que abrir con hoy.
  const fecha = new Date(2026, 7, 25, 23, 30)

  assert.equal(hoyLocal(fecha), '2026-08-25')
})
