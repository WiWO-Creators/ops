/**
 * Pruebas de los avisos de ticket nuevo (T3): cuando se puede guardar y que cuerpo viaja.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisosCambiaron,
  borradorDeAvisos,
  cuerpoDeAvisos,
  problemaDeAvisos,
  TOPE_PERSONAS_AVISADAS
} from '../src/dominio/avisos-de-ticket.ts'

const guardado = { aviso_al_equipo: true, correos: [], personas: [{ id: 2, nombre: 'Ana', email: 'ana@x' }] }

test('el borrador arranca de lo guardado', () => {
  assert.deepEqual(borradorDeAvisos(guardado), { avisoAlEquipo: true, personas: [2] })
})

test('apagar sin nadie no se puede guardar, salvo que haya correos', () => {
  assert.ok(problemaDeAvisos({ avisoAlEquipo: false, personas: [] }, []) !== null)
  assert.equal(problemaDeAvisos({ avisoAlEquipo: false, personas: [] }, ['soporte@x.cl']), null)
  assert.equal(problemaDeAvisos({ avisoAlEquipo: false, personas: [3] }, []), null)
  assert.equal(problemaDeAvisos({ avisoAlEquipo: true, personas: [] }, []), null)
})

test('mas del tope no se puede guardar', () => {
  const personas = Array.from({ length: TOPE_PERSONAS_AVISADAS + 1 }, (_, i) => i + 1)
  assert.ok(problemaDeAvisos({ avisoAlEquipo: false, personas }, []) !== null)
})

test('el cuerpo conserva correos y personas, sin duplicados', () => {
  assert.deepEqual(
    cuerpoDeAvisos({ avisoAlEquipo: true, personas: [2, 2, 5] }, ['a@x.cl']),
    { aviso_al_equipo: true, correos: ['a@x.cl'], personas: [2, 5] }
  )
})

test('detecta cambios sin importar el orden', () => {
  assert.equal(avisosCambiaron({ avisoAlEquipo: true, personas: [2] }, guardado), false)
  assert.equal(avisosCambiaron({ avisoAlEquipo: false, personas: [2] }, guardado), true)
  assert.equal(avisosCambiaron({ avisoAlEquipo: true, personas: [2, 3] }, guardado), true)
})
