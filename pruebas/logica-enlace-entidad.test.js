/**
 * Pruebas de `puedeEnlazarEntidad`: la regla compartida de `EnlacePersona`, `EnlaceCliente` y
 * `EnlaceProyecto` para decidir si enlazan a la ficha o se quedan en texto plano.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeEnlazarEntidad } from '../src/componentes/presentadores/logica-enlace-entidad.ts'

test('en el portal nunca enlaza, tenga o no la capacidad', () => {
  assert.equal(puedeEnlazarEntidad(['view'], 'staff', true), false)
  assert.equal(puedeEnlazarEntidad(['view', 'create', 'edit', 'delete'], 'customers', true), false)
  assert.equal(puedeEnlazarEntidad([], 'projects', true), false)
})

test('fuera del portal, persona exige la capacidad view sobre staff', () => {
  assert.equal(puedeEnlazarEntidad(['view'], 'staff'), true)
  assert.equal(puedeEnlazarEntidad(['create', 'edit', 'delete'], 'staff'), false)
  assert.equal(puedeEnlazarEntidad([], 'staff'), false)
})

test('fuera del portal, cliente alcanza con cualquier capacidad sobre customers', () => {
  assert.equal(puedeEnlazarEntidad(['create'], 'customers'), true)
  assert.equal(puedeEnlazarEntidad(['view'], 'customers'), true)
  assert.equal(puedeEnlazarEntidad([], 'customers'), false)
})

test('fuera del portal, proyecto enlaza siempre: el listado nunca se deniega', () => {
  assert.equal(puedeEnlazarEntidad([], 'projects'), true)
  assert.equal(puedeEnlazarEntidad(['view'], 'projects'), true)
})

test('esPortal por defecto es false: sin pasarlo, decide solo la capacidad', () => {
  assert.equal(puedeEnlazarEntidad(['view'], 'staff'), true)
})
