import test from 'node:test'
import assert from 'node:assert/strict'
import { actualizarEjecucion, estaTrabajando, leerEjecucion } from '../src/dominio/ia-ejecucion.ts'

const base = { id: '1', pregunta: 'Crear tarea', estado: 'esperando_confirmacion', plan: { id: '1', version: 'hash-inmutable', resumen: 'Crear y asignar tarea', pasos: [{ id: 'crear', descripcion: 'Crear tarea en MG Motors', estado: 'pendiente' }, { id: 'asignar', descripcion: 'Asignar a ambos responsables', estado: 'pendiente' }] } }
test('acepta plan sin prosa final y preserva la versión aprobable', () => {
  assert.deepEqual(leerEjecucion(base), base)
  assert.equal(estaTrabajando(base), false)
})
test('rechaza respuesta vacía, identidad inválida, estado y plan incompletos', () => {
  for (const valor of [null, {}, { ...base, id: '../otro' }, { ...base, estado: 'inventado' }, { ...base, plan: { ...base.plan, pasos: [null] } }, { ...base, plan: { ...base.plan, version: 1 } }]) assert.throws(() => leerEjecucion(valor))
})
test('recuperación reemplaza snapshot sin duplicar pasos ni mensajes', () => {
  const siguiente = { ...base, estado: 'completada', resultado: { resumen: 'Tarea creada y asignada' } }
  assert.deepEqual(actualizarEjecucion([base], siguiente), [siguiente])
  assert.deepEqual(actualizarEjecucion([], base), [base])
})
test('solo estados de trabajo continúan polling; aprobación y errores esperan intervención', () => {
  for (const estado of ['en_cola', 'planificando', 'ejecutando']) assert.equal(estaTrabajando({ ...base, estado }), true)
  for (const estado of ['esperando_datos', 'esperando_confirmacion', 'incompleta', 'completada', 'error', 'cancelada']) assert.equal(estaTrabajando({ ...base, estado }), false)
})
