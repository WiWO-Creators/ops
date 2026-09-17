/**
 * Pruebas de los pendientes de una Licitacion.
 *
 * Desde que el alta permite crear una licitacion sin persona de contacto y sin Focal, lo unico que
 * impide que esos huecos queden ahi para siempre es este calculo. Que la ficha los pinte se ve
 * mirando; que los DETECTE —y que no moleste con una licitacion ya cerrada, donde completarlos no
 * cambia nada— no, y es lo que se comprueba aca.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pendientesDeLicitacion } from '../src/dominio/pendientes-licitacion.ts'

/** Una licitacion abierta y completa; cada prueba le saca lo que quiere comprobar. */
function licitacion (cambios = {}) {
  return {
    id: 93,
    estado: 'abierta',
    prospecto_id: 5,
    prospecto: { empresa: 'Consalud', contactos_count: 2 },
    focal_id: 7,
    ...cambios
  }
}

/** Las claves de los pendientes, que es lo que decide el criterio. El texto se lee, no se compara. */
function claves (unaLicitacion) {
  return pendientesDeLicitacion(unaLicitacion).map((pendiente) => pendiente.clave)
}

test('una licitación completa no reclama nada', () => {
  assert.deepEqual(claves(licitacion()), [])
})

test('sin contactos en el prospecto, falta la persona de contacto', () => {
  assert.deepEqual(claves(licitacion({ prospecto: { empresa: 'Consalud', contactos_count: 0 } })), ['contacto'])
})

test('sin focal nombrado, falta el focal', () => {
  assert.deepEqual(claves(licitacion({ focal_id: null })), ['focal'])
})

test('los dos huecos se reclaman juntos, y el contacto va primero', () => {
  const ambos = licitacion({ prospecto: { empresa: 'Consalud', contactos_count: 0 }, focal_id: null })

  assert.deepEqual(claves(ambos), ['contacto', 'focal'])
})

test('una licitación ganada o perdida ya no reclama nada: completarla no cambia nada', () => {
  const vacia = { prospecto: { empresa: 'Consalud', contactos_count: 0 }, focal_id: null }

  assert.deepEqual(claves(licitacion({ ...vacia, estado: 'ganada' })), [])
  assert.deepEqual(claves(licitacion({ ...vacia, estado: 'perdida' })), [])
})

test('el contacto manda al prospecto y el focal se resuelve en la ficha', () => {
  const [contacto, focal] = pendientesDeLicitacion(
    licitacion({ prospecto: { empresa: 'Consalud', contactos_count: 0 }, focal_id: null })
  )

  // El contacto es de la EMPRESA y vive en el prospecto: el aviso lleva hasta donde se edita.
  assert.equal(contacto.enlace.href, '/prospectos/5?tab=contactos')
  // El focal es del EQUIPO y se guarda en la licitacion: no hay a donde mandar a nadie.
  assert.equal(focal.enlace, null)
})

test('el nombre de la empresa entra en el aviso del contacto, para saber a quién le falta', () => {
  const [contacto] = pendientesDeLicitacion(
    licitacion({ prospecto: { empresa: 'Neumaticon', contactos_count: 0 } })
  )

  assert.match(contacto.detalle, /Neumaticon/)
})

test('una cuenta negativa o rara se trata como ausencia y no como contacto cargado', () => {
  assert.deepEqual(claves(licitacion({ prospecto: { empresa: 'Consalud', contactos_count: -1 } })), ['contacto'])
})
