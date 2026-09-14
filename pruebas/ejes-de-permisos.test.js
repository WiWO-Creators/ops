/**
 * Pruebas de los dos ejes del modelo de permisos.
 *
 * Reemplazan a las del nivel viejo, que probaban una escalera de siete escalones donde el puesto y el
 * alcance eran lo mismo. Ahora son dos ejes independientes y lo que hay que proteger es justamente
 * que sigan siéndolo:
 *
 *   1. Que `escalon.ts` sea la ÚNICA lista de los cuatro escalones, y que `esJefatura()` no confunda
 *      "conduce un equipo" con "ve todo".
 *   2. Que el rol de sistema nunca pueda quedar en el estado inválido —superadministrador sin ser
 *      administrador—, que en el panel viejo deja a la cuenta sin permisos.
 *   3. Que el `PATCH` mande **solo la bandera que cambia**: repetir la que ya estaba dispara los
 *      guards de la API aunque el estado final sea idéntico al inicial.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESCALONES, esEscalon, esJefatura, etiquetaDeEscalon } from '../src/dominio/escalon.ts'
import {
  banderasDeRol, cuerpoDeRolDeSistema, nombreDeRolDeSistema, rolDeSistemaDe
} from '../src/dominio/rol-sistema.ts'

test('los escalones son cuatro, fijos y en orden', () => {
  assert.deepEqual(ESCALONES.map((escalon) => escalon.clave), ['staff', 'lead', 'director', 'gerencia'])
  assert.deepEqual(ESCALONES.map((escalon) => escalon.orden), [1, 2, 3, 4])
})

test('esEscalon deja fuera las claves del modelo viejo', () => {
  for (const clave of ['staff', 'lead', 'director', 'gerencia']) {
    assert.equal(esEscalon(clave), true, `${clave} es un escalón`)
  }

  for (const clave of ['usuario', 'focal', 'lider', 'head', 'gerente', 'admin', 'superadmin']) {
    assert.equal(esEscalon(clave), false, `${clave} ya no es un escalón`)
  }
})

test('etiquetaDeEscalon cae a la clave en vez de dejar la celda vacía', () => {
  assert.equal(etiquetaDeEscalon('director'), 'Director')
  assert.equal(etiquetaDeEscalon('inventado'), 'inventado')
  assert.equal(etiquetaDeEscalon(null), '—')
})

/** El escalón nombra el puesto: staff es el piso y no conduce a nadie. */
test('esJefatura es verdadera de lead hacia arriba', () => {
  assert.equal(esJefatura('staff'), false)

  for (const escalon of ['lead', 'director', 'gerencia']) {
    assert.equal(esJefatura(escalon), true, `${escalon} conduce gente`)
  }
})

test('el rol de sistema sale de las dos banderas, con superadmin primero', () => {
  assert.equal(rolDeSistemaDe({ is_admin: false, is_superadmin: false }), 'usuario')
  assert.equal(rolDeSistemaDe({ is_admin: true, is_superadmin: false }), 'admin')
  assert.equal(rolDeSistemaDe({ is_admin: true, is_superadmin: true }), 'superadmin')
  // El estado invalido que hay en la base: se lee como superadministrador, no como usuario.
  assert.equal(rolDeSistemaDe({ is_admin: false, is_superadmin: true }), 'superadmin')
})

test('superadministrador escribe las DOS banderas: el estado inválido no se puede expresar', () => {
  assert.deepEqual(banderasDeRol('superadmin'), { is_admin: true, is_superadmin: true })
  assert.deepEqual(banderasDeRol('admin'), { is_admin: true, is_superadmin: false })
  assert.deepEqual(banderasDeRol('usuario'), { is_admin: false, is_superadmin: false })
})

test('el cuerpo del PATCH lleva solo la bandera que cambia', () => {
  const admin = { is_admin: true, is_superadmin: false }

  assert.deepEqual(cuerpoDeRolDeSistema('admin', admin), {}, 'el mismo rol no manda nada')
  assert.deepEqual(cuerpoDeRolDeSistema('superadmin', admin), { is_superadmin: true }, 'solo la que sube')
  assert.deepEqual(
    cuerpoDeRolDeSistema('usuario', admin),
    { is_admin: false },
    'la que ya estaba en false no se repite'
  )
  assert.deepEqual(
    cuerpoDeRolDeSistema('superadmin', { is_admin: false, is_superadmin: true }),
    { is_admin: true },
    'una cuenta en el estado invalido se arregla escribiendo la que le falta'
  )
})

test('el nombre del rol de sistema es el que se lee en la ficha', () => {
  assert.equal(nombreDeRolDeSistema({ is_admin: false, is_superadmin: false }), 'Usuario')
  assert.equal(nombreDeRolDeSistema({ is_admin: true, is_superadmin: false }), 'Administrador')
  assert.equal(nombreDeRolDeSistema({ is_admin: true, is_superadmin: true }), 'Superadministrador')
})
