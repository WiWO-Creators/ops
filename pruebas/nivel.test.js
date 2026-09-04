/**
 * Pruebas del nivel de una persona.
 *
 * Lo que se protege son dos cosas que se escriben en `tblstaff`:
 *
 *   1. Que un nivel nunca produzca la combinación inválida —superadministrador sin ser
 *      administrador—, que en el panel viejo deja a la persona **sin permisos**: `staff_can()` de
 *      Perfex no conoce la columna `superadmin`, así que con `admin = 0` la manda a
 *      `tblstaff_permissions`, donde un superadmin no tiene filas.
 *   2. Que el `PATCH` mande **solo lo que cambia**. Repetir el valor que ya estaba dispara los guards
 *      de la API —bajarse el nivel a uno mismo, dejar la instalación sin superadministrador— aunque
 *      el estado final sea idéntico al inicial.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { banderasDe, cuerpoDeNivel, nivelDe, nombreDeNivel } from '../src/componentes/equipo/nivel.ts'

test('las dos banderas se leen como un solo nivel', () => {
  assert.equal(nivelDe({ is_admin: false, is_superadmin: false }), 'colaborador')
  assert.equal(nivelDe({ is_admin: true, is_superadmin: false }), 'admin')
  assert.equal(nivelDe({ is_admin: true, is_superadmin: true }), 'superadmin')
})

test('el estado invalido se lee como superadministrador, que es lo que la persona cree ser', () => {
  // Existe en la base: una cuenta con `superadmin = 1` y `admin = 0`. Leerla como colaborador haría
  // que la ficha ofrezca "subirla" a un nivel que ya tiene.
  assert.equal(nivelDe({ is_admin: false, is_superadmin: true }), 'superadmin')
})

test('superadministrador escribe LAS DOS banderas', () => {
  // Es la razón de ser de este módulo: con `admin = 0` el panel viejo lo deja sin permisos.
  assert.deepEqual(banderasDe('superadmin'), { is_admin: true, is_superadmin: true })
  assert.deepEqual(banderasDe('admin'), { is_admin: true, is_superadmin: false })
  assert.deepEqual(banderasDe('colaborador'), { is_admin: false, is_superadmin: false })
})

test('el cuerpo del PATCH solo lleva lo que cambia', () => {
  const admin = { is_admin: true, is_superadmin: false }

  assert.deepEqual(cuerpoDeNivel('admin', admin), {}, 'el mismo nivel no manda nada')
  assert.deepEqual(cuerpoDeNivel('superadmin', admin), { is_superadmin: true }, 'solo la que sube')
  assert.deepEqual(
    cuerpoDeNivel('colaborador', admin),
    { is_admin: false },
    'no manda is_superadmin: ya estaba en false y repetirlo dispara el guard'
  )
})

test('subir desde el estado invalido escribe la bandera que falta', () => {
  // `nivelDe()` ya lo lee como superadministrador, así que sin mirar las banderas reales el cuerpo
  // saldría vacío y la cuenta quedaría rota.
  assert.deepEqual(
    cuerpoDeNivel('superadmin', { is_admin: false, is_superadmin: true }),
    { is_admin: true }
  )
})

test('bajar a colaborador desde superadministrador apaga las dos', () => {
  assert.deepEqual(
    cuerpoDeNivel('colaborador', { is_admin: true, is_superadmin: true }),
    { is_admin: false, is_superadmin: false }
  )
})

test('el nombre del nivel es el que se muestra en la tabla y la cabecera', () => {
  assert.equal(nombreDeNivel({ is_admin: false, is_superadmin: false }), 'Colaborador')
  assert.equal(nombreDeNivel({ is_admin: true, is_superadmin: false }), 'Administrador')
  assert.equal(nombreDeNivel({ is_admin: true, is_superadmin: true }), 'Superadministrador')
})
