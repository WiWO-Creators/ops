/**
 * Pruebas de que secciones se dibujan segun los permisos.
 *
 * Lo que importa no es que un administrador vea todo, sino el caso que rompio: un perfil que trabaja
 * con `create`/`edit` o con `view_own` y nunca tuvo `view` global tiene que ver sus Procesos y sus
 * Espacios igual. Y al reves: Equipo sin `view` no se dibuja, porque la API contesta 403.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeVerSeccion } from '../src/dominio/permisos.ts'

test('procesos y espacios se ven sin view global: la API filtra las filas', () => {
  for (const capacidades of [[], ['view_own'], ['create', 'edit', 'delete', 'edit_timesheet']]) {
    assert.equal(puedeVerSeccion(capacidades, 'tasks'), true)
    assert.equal(puedeVerSeccion(capacidades, 'projects'), true)
  }
})

test('clientes se ve con cualquier capacidad, no solo con view', () => {
  assert.equal(puedeVerSeccion(['create'], 'customers'), true)
  assert.equal(puedeVerSeccion(['view_own'], 'customers'), true)
  assert.equal(puedeVerSeccion([], 'customers'), false)
})

test('equipo exige view: sin el la API contesta 403', () => {
  assert.equal(puedeVerSeccion(['view'], 'staff'), true)
  assert.equal(puedeVerSeccion(['create', 'edit'], 'staff'), false)
  assert.equal(puedeVerSeccion([], 'staff'), false)
})
