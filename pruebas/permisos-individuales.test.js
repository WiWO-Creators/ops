/**
 * Pruebas de la matriz de permisos individuales.
 *
 * Lo que se protege es el contrato de `PATCH /staff/{id}`: la API reescribe **solo las areas que
 * vienen nombradas** en `permissions`. Si el cuerpo nombra un area que la pantalla no mostro, borra
 * permisos que nadie quiso tocar y no deja rastro. Las dos reglas que evitan eso —no nombrar lo que
 * no esta en la matriz, y no ofrecer lo que quien edita no tiene— viven en `permisos.ts` y se
 * verifican aca.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alternar,
  areasFueraDeLaMatriz,
  cuerpoDePermisos,
  matrizEditable,
  seleccionInicial
} from '../src/componentes/equipo/permisos.ts'

/** Recorte del catalogo real de `GET /roles/catalogo`. */
const CATALOGO = [
  {
    feature: 'tasks',
    name: 'Tasks',
    capabilities: [
      { key: 'view', name: 'View' },
      { key: 'create', name: 'Create' },
      { key: 'delete', name: 'Delete' }
    ]
  },
  {
    feature: 'invoices',
    name: 'Invoices',
    capabilities: [
      { key: 'view', name: 'View' },
      { key: 'edit', name: 'Edit' }
    ]
  }
]

test('un administrador puede otorgar todo el catalogo', () => {
  const matriz = matrizEditable(CATALOGO, {}, true)

  assert.deepEqual(matriz.map((area) => area.feature), ['tasks', 'invoices'])
  assert.ok(matriz.every((area) => area.capacidades.every((capacidad) => capacidad.editable)))
})

test('las areas y capacidades salen traducidas, y las desconocidas con el nombre de la API', () => {
  const catalogo = [{ feature: 'inventado', name: 'Made up', capabilities: [{ key: 'raro', name: 'Weird' }] }]
  const [area] = matrizEditable(catalogo, {}, true)

  assert.equal(matrizEditable(CATALOGO, {}, true)[0].nombre, 'Tareas')
  assert.equal(matrizEditable(CATALOGO, {}, true)[0].capacidades[0].nombre, 'ver')
  assert.equal(area.nombre, 'Made up')
  assert.equal(area.capacidades[0].nombre, 'Weird')
})

test('quien no es administrador solo puede otorgar lo que tiene', () => {
  const matriz = matrizEditable(CATALOGO, { tasks: ['view', 'create'] }, false)

  // `invoices` desaparece entera: no puede otorgar nada ahi, y nombrarla en el PATCH la vaciaria.
  assert.deepEqual(matriz.map((area) => area.feature), ['tasks'])
  assert.deepEqual(
    matriz[0].capacidades.map((capacidad) => [capacidad.clave, capacidad.editable]),
    [['view', true], ['create', true], ['delete', false]]
  )
})

test('sin permisos propios no hay matriz que dibujar', () => {
  assert.deepEqual(matrizEditable(CATALOGO, {}, false), [])
})

test('la seleccion inicial es lo que la persona tiene hoy, acotado a la matriz', () => {
  const matriz = matrizEditable(CATALOGO, {}, true)
  const seleccion = seleccionInicial({ tasks: ['view', 'delete'], goals: ['view'] }, matriz)

  assert.deepEqual(seleccion, { tasks: ['view', 'delete'], invoices: [] })
})

test('una persona sin ningun permiso arranca con todas las areas vacias', () => {
  const matriz = matrizEditable(CATALOGO, {}, true)

  assert.deepEqual(seleccionInicial({}, matriz), { tasks: [], invoices: [] })
})

test('alternar marca, desmarca y no muta la seleccion anterior', () => {
  const antes = { tasks: ['view'] }
  const marcada = alternar(antes, 'tasks', 'create')

  assert.deepEqual(marcada.tasks, ['view', 'create'])
  assert.deepEqual(antes.tasks, ['view'])
  assert.deepEqual(alternar(marcada, 'tasks', 'view').tasks, ['create'])
  assert.deepEqual(alternar(antes, 'invoices', 'view').invoices, ['view'])
})

test('el cuerpo nombra todas las areas de la matriz y ninguna otra', () => {
  const matriz = matrizEditable(CATALOGO, {}, true)
  const cuerpo = cuerpoDePermisos({ tasks: ['delete'], goals: ['view'] }, matriz)

  // `invoices` vacia = "quitale todo lo de facturas"; `goals` no viaja = "no la toques".
  assert.deepEqual(cuerpo, { tasks: ['delete'], invoices: [] })
})

test('el cuerpo respeta el orden del catalogo, no el de marcado', () => {
  const matriz = matrizEditable(CATALOGO, {}, true)

  assert.deepEqual(cuerpoDePermisos({ tasks: ['delete', 'view'] }, matriz).tasks, ['view', 'delete'])
})

test('las capacidades bloqueadas que la persona ya tenia viajan intactas', () => {
  const matriz = matrizEditable(CATALOGO, { tasks: ['view', 'create'] }, false)
  const seleccion = seleccionInicial({ tasks: ['view', 'delete'] }, matriz)

  // `delete` no la puede otorgar quien edita, pero la persona la tiene: se conserva.
  assert.deepEqual(cuerpoDePermisos(seleccion, matriz), { tasks: ['view', 'delete'] })
})

test('lo que la matriz no muestra se lista aparte, ya traducido', () => {
  const matriz = matrizEditable(CATALOGO, { tasks: ['view'] }, false)
  const fuera = areasFueraDeLaMatriz({ tasks: ['view'], invoices: ['view'], goals: ['view'], vacia: [] }, matriz)

  assert.deepEqual(fuera, [
    { nombre: 'Facturas', capacidades: 'ver' },
    { nombre: 'Metas', capacidades: 'ver' }
  ])
})
