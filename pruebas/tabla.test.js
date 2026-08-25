/**
 * Pruebas de la logica del motor de tabla.
 *
 * Son las decisiones que se rompen en silencio: una columna que no debia verse, una accion que la
 * persona no puede ejecutar, un selector que ofrece 200 filas cuando el backend corta en 100, o un
 * 422 que se muestra como "algo salio mal" sin decir que filtro lo causo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POR_PAGINA_MAXIMO } from '../src/datos/consulta.ts'
import {
  clavesVisiblesPorDefecto,
  columnasVisibles,
  mensajeDeError,
  opcionesPorPagina,
  podarPorPermisos,
  rutaDeAccion
} from '../src/componentes/datos/tabla.ts'

const presentar = () => null

const COLUMNAS = [
  { clave: 'name', encabezado: 'Nombre', presentar },
  { clave: 'status', encabezado: 'Estado', presentar },
  { clave: 'datecreated', encabezado: 'Creado', presentar, ocultaPorDefecto: true }
]

const FILTROS = [
  { clave: 'status', etiqueta: 'Estado', tipo: 'seleccion' },
  { clave: 'project_id', etiqueta: 'Espacio', tipo: 'seleccion' }
]

test('las columnas ocultas por defecto no arrancan visibles', () => {
  assert.deepEqual(clavesVisiblesPorDefecto(COLUMNAS), ['name', 'status'])
})

test('columnasVisibles respeta el orden de la definicion, no el del selector', () => {
  const visibles = columnasVisibles(COLUMNAS, ['datecreated', 'name'])

  assert.deepEqual(visibles.map((c) => c.clave), ['name', 'datecreated'])
})

test('columnasVisibles ignora claves que la definicion no declara', () => {
  assert.deepEqual(columnasVisibles(COLUMNAS, ['inventada']), [])
})

test('podarPorPermisos deja las acciones sin requisito y las cubiertas', () => {
  const acciones = [
    { clave: 'ver', etiqueta: 'Ver', ruta: 'tasks/:id', metodo: 'POST' },
    { clave: 'editar', etiqueta: 'Editar', ruta: 'tasks/:id', metodo: 'POST', requiere: 'edit' },
    { clave: 'borrar', etiqueta: 'Borrar', ruta: 'tasks/:id', metodo: 'DELETE', requiere: 'delete' }
  ]

  const podadas = podarPorPermisos(acciones, ['view', 'edit'])

  assert.deepEqual(podadas.map((a) => a.clave), ['ver', 'editar'])
})

test('podarPorPermisos sin acciones declaradas devuelve lista vacia', () => {
  assert.deepEqual(podarPorPermisos(undefined, ['view']), [])
})

test('rutaDeAccion reemplaza el :id y lo escapa', () => {
  assert.equal(rutaDeAccion('tasks/:id/actions/mark-complete', 512), 'tasks/512/actions/mark-complete')
  assert.equal(rutaDeAccion('tasks/:id', 'a/b'), 'tasks/a%2Fb')
})

test('el selector de tamaño de pagina nunca ofrece mas que el tope del backend', () => {
  for (const cantidad of opcionesPorPagina(POR_PAGINA_MAXIMO, 25)) {
    assert.ok(cantidad <= POR_PAGINA_MAXIMO, `${cantidad} supera el tope`)
  }

  assert.ok(!opcionesPorPagina(POR_PAGINA_MAXIMO, 25).includes(200))
})

test('el tamaño vigente aparece en el selector aunque no sea uno de los estandar', () => {
  const opciones = opcionesPorPagina(POR_PAGINA_MAXIMO, 30)

  assert.ok(opciones.includes(30))
  assert.deepEqual(opciones, [...opciones].sort((a, b) => a - b))
})

test('un tamaño vigente invalido no se cuela en el selector', () => {
  assert.ok(!opcionesPorPagina(POR_PAGINA_MAXIMO, 0).includes(0))
  assert.ok(!opcionesPorPagina(POR_PAGINA_MAXIMO, 500).includes(500))
})

test('un error comun muestra su mensaje tal cual', () => {
  const mensaje = mensajeDeError({ code: 'not_found', message: 'No existe' }, FILTROS)

  assert.equal(mensaje, 'No existe')
})

test('un 422 nombra el filtro que fallo con su etiqueta visible', () => {
  const mensaje = mensajeDeError(
    {
      code: 'validation_failed',
      message: 'Los datos no son válidos',
      details: { 'filter[status]': ['El valor no está permitido.'] }
    },
    FILTROS
  )

  assert.match(mensaje, /Estado/)
  assert.match(mensaje, /El valor no está permitido\./)
})

test('un 422 en varias notaciones de clave sigue traduciendo el nombre', () => {
  const mensaje = mensajeDeError(
    {
      code: 'validation_failed',
      message: 'Los datos no son válidos',
      details: { 'filter.project_id': ['No existe.'], sort: ['Campo desconocido.'] }
    },
    FILTROS
  )

  assert.match(mensaje, /Espacio/)
  // Lo que no es un filtro declarado se muestra con su clave cruda, no se oculta.
  assert.match(mensaje, /sort/)
})

test('un 422 sin details cae al mensaje del contrato', () => {
  const mensaje = mensajeDeError({ code: 'validation_failed', message: 'Los datos no son válidos' }, FILTROS)

  assert.equal(mensaje, 'Los datos no son válidos')
})
