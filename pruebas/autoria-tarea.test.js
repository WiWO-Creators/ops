import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorQuienAsigno } from '../src/dominio/autoria-tarea.ts'

const renata = { id: 16, full_name: 'Renata Valenzuela', profile_image_url: null }
const oscar = { id: 68, full_name: 'Óscar Canelo', profile_image_url: null }
const juan = { id: 181, full_name: 'Juan Poblete', profile_image_url: null }
const deborah = { id: 54, full_name: 'Deborah González', profile_image_url: null }

test('un solo asignador agrupa a todos sus asignados', () => {
  const grupos = agruparPorQuienAsigno([
    { ...juan, assigned_by: oscar },
    { ...deborah, assigned_by: oscar }
  ])

  assert.deepEqual(grupos, [{ quien: oscar, asignados: [juan, deborah] }])
})

test('varios asignadores salen en el orden en que aparecen', () => {
  const grupos = agruparPorQuienAsigno([
    { ...juan, assigned_by: renata },
    { ...deborah, assigned_by: oscar },
    { ...oscar, assigned_by: renata }
  ])

  assert.deepEqual(grupos.map((g) => g.quien.id), [16, 68])
  assert.deepEqual(grupos[0].asignados.map((p) => p.id), [181, 68])
})

test('quien se asignó solo cuenta como su propio asignador', () => {
  assert.deepEqual(agruparPorQuienAsigno([{ ...juan, assigned_by: juan }]), [{ quien: juan, asignados: [juan] }])
})

test('sin assigned_by, con null, vacío o undefined no hay grupos', () => {
  assert.deepEqual(agruparPorQuienAsigno([{ ...juan, assigned_by: null }, { ...deborah }]), [])
  assert.deepEqual(agruparPorQuienAsigno([]), [])
  assert.deepEqual(agruparPorQuienAsigno(undefined), [])
})
