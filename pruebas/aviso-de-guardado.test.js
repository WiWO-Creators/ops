/**
 * Pruebas del aviso de éxito de `FormularioRecurso` y de la búsqueda común de los selectores.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoDeGuardado, etiquetaDeEnvio } from '../src/componentes/proyecto/formulario.ts'
import { filtrarPorPalabras } from '../src/dominio/busqueda.ts'

test('etiquetaDeEnvio nombra lo que crea y dice «Guardar cambios» al editar', () => {
  assert.equal(etiquetaDeEnvio('POST', 'Nuevo contrato'), 'Crear contrato')
  assert.equal(etiquetaDeEnvio('POST', 'Nueva persona'), 'Crear persona')
  assert.equal(etiquetaDeEnvio('POST', 'Sumar iteración'), 'Crear')
  assert.equal(etiquetaDeEnvio('PATCH', 'Editar contrato'), 'Guardar cambios')
})

test('avisoDeGuardado nombra lo enviado con comillas latinas', () => {
  assert.equal(avisoDeGuardado('POST', { name: 'Hito 1' }, null), '«Hito 1» se creó.')
  assert.equal(avisoDeGuardado('PATCH', { company: ' ACME ' }, null), 'Cambios de «ACME» guardados.')
  assert.equal(avisoDeGuardado('POST', { firstname: 'Ana', lastname: 'Ríos' }, null), '«Ana Ríos» se creó.')
})

test('avisoDeGuardado toma el nombre del registro cuando la edición no lo envía', () => {
  assert.equal(avisoDeGuardado('PATCH', { deadline: '2026-10-01' }, { title: 'Nota' }), 'Cambios de «Nota» guardados.')
})

test('avisoDeGuardado sin nombre cae en un texto neutro', () => {
  assert.equal(avisoDeGuardado('PATCH', { name: '  ' }, null), 'Cambios guardados.')
  assert.equal(avisoDeGuardado('POST', {}, null), 'Alta guardada.')
})

test('filtrarPorPalabras busca sin acentos, en cualquier orden y en varios textos', () => {
  const opciones = [
    { id: 1, nombre: 'Ana Ríos', detalle: 'Diseño' },
    { id: 2, nombre: 'Pablo Núñez', detalle: null }
  ]
  const textos = (opcion) => [opcion.nombre, opcion.detalle]

  assert.deepEqual(filtrarPorPalabras(opciones, 'rios ana', textos).map((o) => o.id), [1])
  assert.deepEqual(filtrarPorPalabras(opciones, 'nunez', textos).map((o) => o.id), [2])
  assert.deepEqual(filtrarPorPalabras(opciones, 'ana diseno', textos).map((o) => o.id), [1])
  assert.deepEqual(filtrarPorPalabras(opciones, '  ', textos).map((o) => o.id), [1, 2])
})
