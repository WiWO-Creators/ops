/**
 * Pruebas de que secciones se dibujan segun los permisos.
 *
 * Lo que importa no es que un administrador vea todo, sino el caso que rompio: un perfil que trabaja
 * con `create`/`edit` o con `view_own` y nunca tuvo `view` global tiene que ver sus Procesos y sus
 * Espacios igual. Y al reves: Equipo sin `view` no se dibuja, porque la API contesta 403.
 *
 * Focals y "Mi Area" no se deciden con la matriz de Perfex sino con la PERTENENCIA —de quien se es
 * focal, a que area se pertenece—, y por eso tienen sus propias funciones. Los casos que importan
 * son los del dato ausente: ninguna de las dos puede quedarse escondiendo una seccion porque la API
 * todavia no manda un campo. Esconder no autoriza: el 403 del servidor sigue siendo la compuerta.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeVerFocals, puedeVerMiArea, puedeVerSeccion } from '../src/dominio/permisos.ts'

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

test('Focals se ve solo si se es focal de alguien, sin importar el escalon', () => {
  assert.equal(puedeVerFocals({ es_focal: true }), true)
  assert.equal(puedeVerFocals({ es_focal: false }), false)
})

test('la direccion y la superadministracion tampoco ven Focals sin cuentas a cargo', () => {
  assert.equal(puedeVerFocals({ es_focal: false, is_admin: true, is_superadmin: true }), false)
  assert.equal(puedeVerFocals({ es_focal: false, nivel: 'gerente' }), false)
})

test('sin es_focal en la sesion la entrada se muestra: falla abierta como antes', () => {
  assert.equal(puedeVerFocals({}), true)
  assert.equal(puedeVerFocals({ es_focal: undefined }), true)
})

test('Mi Area se ve con el area principal de siempre', () => {
  assert.equal(puedeVerMiArea({ area_id: 3, area_ids: [3] }), true)
  assert.equal(puedeVerMiArea({ area_id: 3 }), true)
})

test('Mi Area se ve con la tabla multiarea aunque el area principal sea nula', () => {
  assert.equal(puedeVerMiArea({ area_id: null, area_ids: [7] }), true)
})

test('sin area por ninguna de las dos vias, Mi Area no se dibuja', () => {
  assert.equal(puedeVerMiArea({ area_id: null, area_ids: [] }), false)
  assert.equal(puedeVerMiArea({ area_id: null }), false)
})
