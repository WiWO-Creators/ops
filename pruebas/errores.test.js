/**
 * Pruebas del mensaje de error del contrato.
 *
 * Lo que importa no es traducir bonito, sino que un `422` diga QUE campo falla: "Hay campos que no
 * se pueden guardar." a secas dejaba el formulario de alta sin ninguna pista y la tarea sin crear.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeConDetalles } from '../src/datos/errores.ts'

test('nombra el campo y el motivo en castellano', () => {
  const mensaje = mensajeConDetalles({
    message: 'Hay campos que no se pueden guardar.',
    details: { tags: ['no_existe'] }
  })

  assert.equal(mensaje, 'Hay campos que no se pueden guardar. Etiquetas no existe.')
})

test('junta varios campos en un solo mensaje', () => {
  const mensaje = mensajeConDetalles({
    message: 'Hay campos que no se pueden guardar.',
    details: { name: ['requerido'], due_date: ['anterior_al_inicio'] }
  })

  assert.match(mensaje, /Nombre falta; Fecha de vencimiento es anterior a la fecha de inicio\.$/)
})

test('un motivo desconocido se muestra igual, sin guiones bajos', () => {
  const mensaje = mensajeConDetalles({
    message: 'No se pudo guardar.',
    details: { hourly_rate: ['algo_raro'] }
  })

  assert.equal(mensaje, 'No se pudo guardar. hourly_rate algo raro.')
})

test('sin details devuelve el mensaje intacto', () => {
  assert.equal(mensajeConDetalles({ message: 'No tenés permiso.' }), 'No tenés permiso.')
})
