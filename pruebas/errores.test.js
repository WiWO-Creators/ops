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

test('el prospecto duplicado muestra solo el mensaje de la API', () => {
  const mensaje = mensajeConDetalles({
    message: 'Ya existe un prospecto con esa empresa.',
    details: { 'cliente.company': ['duplicado'], prospecto_existente: ['4'] }
  })

  assert.equal(mensaje, 'Ya existe un prospecto con esa empresa.')
})

test('la empresa que falta en un prospecto se nombra en castellano', () => {
  const mensaje = mensajeConDetalles({
    message: 'Hay campos que no se pueden guardar.',
    details: { 'cliente.company': ['required'] }
  })

  assert.equal(mensaje, 'Hay campos que no se pueden guardar. Empresa falta.')
})

test('sin details devuelve el mensaje intacto', () => {
  assert.equal(mensajeConDetalles({ message: 'No tenés permiso.' }), 'No tenés permiso.')
})

test('un bloque de datos dentro de details no se cuela en la frase', () => {
  // El `429` de la capa de IA manda el bloque `regeneracion` en `details` para que el frontend no
  // recalcule la regla del cupo. Sin el filtro, la frase terminaba en "… regeneracion." y esa
  // palabra la leia la persona.
  const mensaje = mensajeConDetalles({
    message: 'Ya regeneraste el resumen dos veces hoy.',
    details: { regeneracion: { restantes_hoy: 0, puede_ahora: false, disponible_desde: null, motivo: 'cupo' } }
  })

  assert.equal(mensaje, 'Ya regeneraste el resumen dos veces hoy.')
})

test('los motivos del organigrama llegan en castellano y apuntando al campo', () => {
  // Los dos errores que la pantalla de Organigrama tiene que saber explicar. Sin estas claves, el
  // formulario decia "area_superior_id ciclo", que no es una frase que nadie pueda accionar.
  assert.equal(
    mensajeConDetalles({ message: 'Revisá los campos del área.', details: { name: ['duplicado'] } }),
    'Revisá los campos del área. Nombre ya está usado por otra.'
  )

  assert.equal(
    mensajeConDetalles({ message: 'Revisá los campos del área.', details: { area_superior_id: ['ciclo'] } }),
    'Revisá los campos del área. Área superior no puede ser un área que ya cuelga de esta.'
  )

  assert.match(
    mensajeConDetalles({ message: 'Revisá los campos.', details: { jefe_staffid: ['no_existe'] } }),
    /Quien dirige no existe\.$/
  )
})

test('los errores de Drive no repiten el motivo que el mensaje ya dice', () => {
  assert.equal(
    mensajeConDetalles({ message: 'El archivo supera el máximo de 25 MB.', details: { file: ['too_large'] } }),
    'El archivo supera el máximo de 25 MB.'
  )
  assert.equal(
    mensajeConDetalles({ message: 'Google rechazó mover el archivo.', details: { drive: ['cannotMoveTrashedItem'] } }),
    'Google rechazó mover el archivo.'
  )
  assert.equal(
    mensajeConDetalles({ message: 'Ya están en esa carpeta.', details: { parent_id: ['same_folder'] } }),
    'Ya están en esa carpeta.'
  )
})

test('los 422 de la recurrencia se dicen con frase propia', () => {
  assert.equal(
    mensajeConDetalles({ message: 'Hay campos que no se pueden guardar.', details: { skip_weekdays: ['excluye_todos'] } }),
    'Hay campos que no se pueden guardar. No puedes excluir los siete días de la semana: la tarea nunca se generaría.'
  )
  assert.equal(
    mensajeConDetalles({ message: 'Hay campos que no se pueden guardar.', details: { recurring_paused: ['sin_recurrencia'] } }),
    'Hay campos que no se pueden guardar. La tarea no es recurrente, así que no hay nada que pausar ni reanudar.'
  )
  assert.equal(
    mensajeConDetalles({ message: 'La regla no es válida.', details: { skip_weekdays: ['repetido'] } }),
    'La regla no es válida. Días sin copias tiene un valor repetido.'
  )
})

test('los ids ajenos de una limpieza y el 403 de administradores tienen frase propia', async () => {
  const { mensajeDeCodigo } = await import('../src/datos/errores.ts')
  assert.match(
    mensajeConDetalles({ message: 'La limpieza no es válida.', details: { ids: ['no_candidata'] } }),
    /no es una copia de esta recurrencia/
  )
  assert.match(
    mensajeConDetalles({ message: 'La limpieza no es válida.', details: { detener: ['sin_recurrencia'] } }),
    /ya no se repite/
  )
  assert.equal(mensajeDeCodigo('solo_administradores', 'x'), 'Solo un administrador puede hacer esto.')
  assert.equal(mensajeDeCodigo('forbidden', 'x'), 'x')
  assert.equal(mensajeDeCodigo(undefined, 'x'), 'x')
})
