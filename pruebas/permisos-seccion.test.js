/**
 * Pruebas de que secciones se dibujan segun los permisos.
 *
 * Lo que importa no es que un administrador vea todo, sino el caso que rompio: un perfil que trabaja
 * con `create`/`edit` o con `view_own` y nunca tuvo `view` global tiene que ver sus Procesos y sus
 * Espacios igual. Y al reves: Equipo sin `view` no se dibuja, porque la API contesta 403.
 *
 * Focals y "Mi Area" no se deciden con la matriz de Perfex sino con la PERTENENCIA —de quien se es
 * focal, a que area se pertenece—, y por eso tienen sus propias funciones. Focals suma una segunda
 * lectura: para la superadministracion y la gerencia la pantalla no es la cartera propia sino la de
 * todos, y ahi la llave es el puesto y no la pertenencia. Los casos que importan
 * son los del dato ausente: ninguna de las dos puede quedarse escondiendo una seccion porque la API
 * todavia no manda un campo. Esconder no autoriza: el 403 del servidor sigue siendo la compuerta.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  puedeVerFocals,
  puedeVerMiArea,
  puedeVerSeccion,
  puedeVerTodosLosFocals
} from '../src/dominio/permisos.ts'

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

test('Focals se ve si se es focal de alguien, sin importar el escalon', () => {
  assert.equal(puedeVerFocals({ es_focal: true }), true)
  assert.equal(puedeVerFocals({ es_focal: true, escalon: 'staff' }), true)
  assert.equal(puedeVerFocals({ es_focal: false }), false)
})

test('la superadministracion y la gerencia la ven sin cuentas a cargo: para ellas es la cartera entera', () => {
  assert.equal(puedeVerFocals({ es_focal: false, is_superadmin: true }), true)
  assert.equal(puedeVerFocals({ es_focal: false, escalon: 'gerencia' }), true)
})

test('un admin o un director sin cuentas a cargo sigue sin ver Focals', () => {
  assert.equal(puedeVerFocals({ es_focal: false, is_admin: true, escalon: 'director' }), false)
  assert.equal(puedeVerFocals({ es_focal: false, escalon: 'lead' }), false)
})

test('la cartera entera es de superadministracion y gerencia, y de nadie mas', () => {
  assert.equal(puedeVerTodosLosFocals({ is_superadmin: true, escalon: 'staff' }), true)
  assert.equal(puedeVerTodosLosFocals({ is_superadmin: false, escalon: 'gerencia' }), true)
  assert.equal(puedeVerTodosLosFocals({ is_superadmin: false, escalon: 'director' }), false)
  assert.equal(puedeVerTodosLosFocals({ is_superadmin: false, escalon: 'lead' }), false)
  assert.equal(puedeVerTodosLosFocals({}), false)
})

test('sin es_focal en la sesion la entrada se muestra: falla abierta como antes', () => {
  assert.equal(puedeVerFocals({}), true)
  assert.equal(puedeVerFocals({ es_focal: undefined }), true)
})

test('Mi Area se dibuja siempre: el organigrama le responde algo a todo el mundo', () => {
  // Quien no tiene area ni gente se ve a si mismo y a sus jefes, asi que la pantalla nunca queda
  // vacia. Las 31 cuentas sin area son justamente las que mas necesitan mirarla, y la llave vieja
  // —tener area puesta— era la unica que se la escondia.
  assert.equal(puedeVerMiArea(), true)
})
