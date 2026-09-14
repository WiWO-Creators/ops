import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conflictosDePreset, leerPreset, tableroDePresets, TOPE_PRESET } from '../src/componentes/datos/presets.ts'

const definicion = { ruta: 'projects/2/tasks', busqueda: true, filtros: [
  { clave: 'milestone_id', etiqueta: 'Hito', tipo: 'seleccion', desdeLookup: 'milestones' },
  { clave: 'horas', etiqueta: 'Horas', tipo: 'campo', tipoDato: 'numero' },
  { clave: 'vence', etiqueta: 'Vence', tipo: 'rangoFechas' }
] }
const opciones = { milestones: [{ valor: '22', etiqueta: 'Hito destino' }] }
const portable = (filters) => JSON.stringify({ version: 1, board: 'tasks', name: 'Pendientes', filters })

test('importar preserva búsqueda, comas y extremos vacíos; rechaza entradas ajenas y malformadas', () => {
  const filtros = { __q: ['a,b'], vence: ['', '2028-02-29'] }
  assert.deepEqual(leerPreset(portable(filtros), 'tasks').filters, filtros)
  assert.deepEqual(leerPreset(portable({}), 'tasks').filters, {})
  for (const texto of ['null', '[]', 'no JSON', portable(null), portable({ status: '1' }), portable({ status: [null] }), portable({ __q: ['a', 'b'] }), portable({ constructor: ['x'] }), ' '.repeat(TOPE_PRESET + 1)]) {
    assert.throws(() => leerPreset(texto, 'tasks'))
  }
  assert.throws(() => leerPreset(portable({}), 'projects'))
})

test('proyecto destino detecta referencias incompatibles y no borra condiciones silenciosamente', () => {
  const original = { project_id: ['1'], milestone_id: ['11'], horas: ['gte', '3'], __q: ['presupuesto'] }
  assert.deepEqual(conflictosDePreset(original, definicion, opciones).map((c) => c.clave), ['project_id', 'milestone_id'])
  assert.deepEqual(original.milestone_id, ['11'])
  const adaptado = { milestone_id: ['22'], horas: ['gte', '3'] }
  assert.deepEqual(conflictosDePreset(adaptado, definicion, opciones), [])
  assert.equal(conflictosDePreset({ milestone_id: ['22'] }, definicion, {}).length, 1)
})

test('validar números, operadores, fechas reales y rangos abiertos', () => {
  for (const horas of [['contains', '3'], ['gte', 'NaN'], ['eq', ''], ['eq']]) assert.equal(conflictosDePreset({ horas }, definicion, opciones).length, 1)
  for (const vence of [['2026-02-30'], ['2026-12-01', '2026-01-01'], ['fecha']]) assert.equal(conflictosDePreset({ vence }, definicion, opciones).length, 1)
  assert.deepEqual(conflictosDePreset({ horas: ['empty', '1'], vence: ['', '2028-02-29'] }, definicion, opciones), [])
})

test('identidad de recurso independiente del proyecto, presentación y permisos del portal', () => {
  assert.equal(tableroDePresets('projects/1/tasks'), 'tasks')
  assert.equal(tableroDePresets('projects/99/tasks'), 'tasks')
  assert.equal(tableroDePresets('projects/1/milestones'), 'milestones-tabla')
  assert.equal(tableroDePresets('clients'), 'clients')
  assert.equal(tableroDePresets('portal/projects'), null)
  assert.equal(tableroDePresets(''), null)
})
