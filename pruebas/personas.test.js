/** Pruebas de las iniciales del avatar: el caso de una sola palabra es el que se hace mal. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iniciales, matizDe } from '../src/lib/personas.ts'

test('toma la primera y la ultima palabra', () => {
  assert.equal(iniciales('Ana Ríos'), 'AR')
  assert.equal(iniciales('María del Carmen Paz'), 'MP')
})

test('un solo nombre da una sola letra', () => {
  // "AN" se lee como un nombre que no existe.
  assert.equal(iniciales('Ana'), 'A')
})

test('sobrevive a espacios de mas y a un nombre vacio', () => {
  assert.equal(iniciales('  Ana   Ríos  '), 'AR')
  assert.equal(iniciales('   '), '?')
  assert.equal(iniciales(''), '?')
})

test('el color de un nombre es estable entre llamadas', () => {
  assert.equal(matizDe('Ana Ríos'), matizDe('Ana Ríos'))
})

test('nombres distintos casi siempre dan matices distintos', () => {
  assert.notEqual(matizDe('Ana Ríos'), matizDe('Bruno Cabral'))
})

test('el matiz siempre cae dentro del circulo cromatico', () => {
  for (const nombre of ['Ana', 'Bruno Cabral', 'María del Carmen Paz', 'Ñ', '']) {
    const matiz = matizDe(nombre)
    assert.ok(matiz >= 0 && matiz < 360, `${nombre} da un matiz fuera de rango: ${matiz}`)
  }
})

test('en tamaño chico devuelve una sola letra', () => {
  // Dos letras en un circulo de 24px se cortan, sobre todo dentro de un grupo apilado.
  assert.equal(iniciales('Ana Ríos', 1), 'A')
  assert.equal(iniciales('María del Carmen Paz', 1), 'M')
  assert.equal(iniciales('', 1), '?')
})
