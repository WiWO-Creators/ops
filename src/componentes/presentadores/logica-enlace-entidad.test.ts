/**
 * Pruebas de `puedeEnlazarEntidad`: la regla compartida de `EnlacePersona`, `EnlaceCliente` y
 * `EnlaceProyecto` para decidir si enlazan a la ficha o se quedan en texto plano.
 *
 * No corre hoy dentro de `pnpm test` (que solo mira `mock/*.test.js` y `pruebas/*.test.js`): queda
 * junto al componente porque el alcance de esta tarea solo permite archivos nuevos dentro de
 * `src/componentes/presentadores/`. Se corre a mano con
 * `node --test src/componentes/presentadores/logica-enlace-entidad.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeEnlazarEntidad } from './logica-enlace-entidad.ts'

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
