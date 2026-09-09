/**
 * Pruebas de la edicion de una Tarea desde el detalle.
 *
 * Cubren lo que se rompe sin dar error: un parche que manda de mas —y se lleva un `422` por un hito
 * que nadie toco, o cierra un cronometro al reenviar los mismos asignados— y una lista de elegibles
 * que se olvida de quien ya estaba asignado, que es como se desasigna a alguien sin querer.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  camposDeTarea, cuerpoDeParche, errorDeCamposEdicion, nombresDeEtiquetas, personasElegibles
} from '../src/dominio/edicion-tarea.ts'

const TAREA = {
  id: 7,
  name: 'Carta de oferta',
  status: 1,
  priority: 2,
  start_date: '2026-09-07',
  due_date: null,
  milestone: { id: 3, name: 'Kickoff' },
  assignees: [{ id: 20, full_name: 'Ana Ríos', profile_image_url: null }],
  followers: [],
  tags: [{ id: 5, name: 'urgente' }],
  estimated_hours: 4
}

test('los campos iniciales salen de la tarea, con vacio donde la API manda null', () => {
  const campos = camposDeTarea(TAREA, 'Texto de la descripción')

  assert.deepEqual(campos, {
    nombre: 'Carta de oferta',
    relacion: '',
    relacionId: '',
    tipo: '',
    facturable: false,
    tarifaHora: '0',
    publica: false,
    visibleCliente: false,
    recurrente: false,
    repetirCada: '1',
    unidadRecurrencia: 'month',
    ciclos: '0',
    prioridad: '2',
    inicio: '2026-09-07',
    vencimiento: '',
    hito: '3',
    asignados: [20],
    seguidores: [],
    etiquetas: [5],
    descripcion: 'Texto de la descripción',
    horasEstimadas: '4'
  })
})

test('sin cambios el parche va vacio', () => {
  const campos = camposDeTarea(TAREA, 'algo')

  assert.deepEqual(cuerpoDeParche(campos, { ...campos }), {})
})

test('reordenar una lista no es un cambio', () => {
  const campos = camposDeTarea({ ...TAREA, assignees: [
    { id: 20, full_name: 'Ana Ríos', profile_image_url: null },
    { id: 31, full_name: 'Luis Paz', profile_image_url: null }
  ] }, '')

  assert.deepEqual(cuerpoDeParche(campos, { ...campos, asignados: [31, 20] }), {})
})

test('el parche lleva solo lo que cambio', () => {
  const campos = camposDeTarea(TAREA, 'algo')

  assert.deepEqual(
    cuerpoDeParche(campos, { ...campos, asignados: [20, 31], prioridad: '4' }),
    { priority: 4, assignees: [20, 31] }
  )
})

test('vaciar una fecha o la descripcion viaja como null, y quitar el hito como cero', () => {
  const campos = camposDeTarea(TAREA, 'algo')

  assert.deepEqual(
    cuerpoDeParche(campos, { ...campos, inicio: '', hito: '', descripcion: '   ' }),
    { start_date: null, milestone: 0, description: null }
  )
})

test('poner una fecha y un hito donde no habia', () => {
  const campos = camposDeTarea({ ...TAREA, milestone: null }, '')

  assert.deepEqual(
    cuerpoDeParche(campos, { ...campos, vencimiento: '2026-10-01', hito: '9' }),
    { due_date: '2026-10-01', milestone: 9 }
  )
})

test('el nombre se recorta y los espacios de mas no son un cambio', () => {
  const campos = camposDeTarea(TAREA, '')

  assert.deepEqual(cuerpoDeParche(campos, { ...campos, nombre: '  Carta de oferta  ' }), {})
  assert.deepEqual(cuerpoDeParche(campos, { ...campos, nombre: '  Carta nueva  ' }), { name: 'Carta nueva' })
})

test('quitar a todos los asignados manda la lista vacia, no la omite', () => {
  const campos = camposDeTarea(TAREA, '')

  assert.deepEqual(cuerpoDeParche(campos, { ...campos, asignados: [] }), { assignees: [] })
})

test('borrar las horas estimadas viaja como null, no como cero ni como cadena vacia', () => {
  const campos = camposDeTarea(TAREA, '')

  assert.deepEqual(cuerpoDeParche(campos, { ...campos, horasEstimadas: '' }), { estimated_hours: null })
  assert.deepEqual(cuerpoDeParche(campos, { ...campos, horasEstimadas: '2.5' }), { estimated_hours: 2.5 })
})

test('una tarea sin estimar abre el campo vacio y estimarla en cero es un cambio', () => {
  const campos = camposDeTarea({ ...TAREA, estimated_hours: null }, '')

  assert.equal(campos.horasEstimadas, '')
  assert.deepEqual(cuerpoDeParche(campos, { ...campos, horasEstimadas: '0' }), { estimated_hours: 0 })
})

test('los elegibles suman a quien ya esta en la tarea sin repetir a las asignables', () => {
  // La primera lista son TODAS las asignables (`GET /staff/asignables`), no los miembros del
  // Espacio: se puede asignar a alguien que todavia no es miembro, y el backend lo agrega al guardar.
  const asignables = [
    { id: 20, full_name: 'Ana Ríos', profile_image_url: null },
    { id: 31, full_name: 'Luis Paz', profile_image_url: null }
  ]
  const enLaTarea = [
    { id: 31, full_name: 'Luis Paz', profile_image_url: null },
    { id: 44, full_name: 'Eva Sosa', profile_image_url: null }
  ]

  assert.deepEqual(personasElegibles(asignables, enLaTarea).map((p) => p.id), [20, 31, 44])
  assert.deepEqual(personasElegibles([], enLaTarea).map((p) => p.id), [31, 44])
  assert.deepEqual(personasElegibles(asignables, []).map((p) => p.id), [20, 31])
})

test('las etiquetas elegidas ignoran ids que ya no estan en el catalogo', () => {
  const catalogo = [{ id: 5, name: 'urgente' }, { id: 6, name: 'diseño' }]

  assert.deepEqual(nombresDeEtiquetas(catalogo, [6, 99]), ['diseño'])
  assert.deepEqual(nombresDeEtiquetas(catalogo, []), [])
})

test('una etiqueta escrita a mano se muestra y viaja por su nombre', () => {
  const catalogo = [{ id: 5, name: 'urgente' }]

  assert.deepEqual(nombresDeEtiquetas(catalogo, [5, 'cliente-clave']), ['urgente', 'cliente-clave'])

  const inicial = camposDeTarea(TAREA, 'algo')
  const parche = cuerpoDeParche(inicial, { ...inicial, etiquetas: [5, 'cliente-clave'] })

  assert.deepEqual(parche, { tags: [5, 'cliente-clave'] })
})


test('agregar, cambiar y quitar una relación limpia las dependencias anteriores', () => {
  const inicial = camposDeTarea({ ...TAREA, rel_type: 'project', rel_id: 2, task_type: { id: 7 } }, '')
  assert.deepEqual(cuerpoDeParche(inicial, { ...inicial, relacionId: '4', hito: '', tipo: '' }), {
    rel_type: 'project', rel_id: 4, milestone: 0, task_type: null
  })
  assert.deepEqual(cuerpoDeParche(inicial, { ...inicial, relacion: '', relacionId: '' }), {
    rel_type: null, rel_id: null, milestone: 0, task_type: null
  })
  const sinRelacion = camposDeTarea({ ...TAREA, milestone: null }, '')
  assert.deepEqual(cuerpoDeParche(sinRelacion, { ...sinRelacion, relacion: 'project', relacionId: '4', hito: '9', tipo: '8' }), {
    rel_type: 'project', rel_id: 4, milestone: 9, task_type: 8
  })
  assert.deepEqual(cuerpoDeParche(inicial, { ...inicial, tipo: '' }), { task_type: null })
  assert.deepEqual(cuerpoDeParche(inicial, { ...inicial, relacionId: '4', hito: '', tipo: '7' }), {
    rel_type: 'project', rel_id: 4, milestone: 0, task_type: 7
  })
})

test('facturación y visibilidad conservan valores y permiten desactivarlos', () => {
  const inicial = camposDeTarea({ ...TAREA, billable: true, hourly_rate: 20, is_public: true, visible_to_client: true }, '')
  assert.deepEqual(cuerpoDeParche(inicial, inicial), {})
  assert.deepEqual(cuerpoDeParche(inicial, { ...inicial, facturable: false, tarifaHora: '0', publica: false, visibleCliente: false }), {
    billable: false, hourly_rate: 0, is_public: false, visible_to_client: false
  })
})

test('recurrencia se activa completa, se reprograma completa y se cancela sin campos extra', () => {
  const inicial = camposDeTarea(TAREA, '')
  const actual = { ...inicial, recurrente: true, repetirCada: '2', unidadRecurrencia: 'week', ciclos: '4' }
  assert.deepEqual(cuerpoDeParche(inicial, actual), { recurring: true, repeat_every: 2, recurring_type: 'week', cycles: 4 })
  assert.deepEqual(cuerpoDeParche(actual, { ...actual, ciclos: '0' }), { recurring: true, repeat_every: 2, recurring_type: 'week', cycles: 0 })
  assert.deepEqual(cuerpoDeParche(actual, { ...actual, recurrente: false }), { recurring: false })
  assert.deepEqual(cuerpoDeParche(inicial, { ...inicial, ciclos: '5' }), {})
  const cargada = camposDeTarea({ ...TAREA, recurring: true, repeat_every: 3, recurring_type: 'day', cycles: 7 }, '')
  assert.equal(cargada.repetirCada, '3')
  assert.equal(cargada.unidadRecurrencia, 'day')
  assert.equal(cargada.ciclos, '7')
  assert.deepEqual(cuerpoDeParche(cargada, cargada), {})
})

test('validación acepta límites y rechaza relaciones, tarifas, fechas y recurrencias inválidas', () => {
  const inicial = camposDeTarea(TAREA, '')
  assert.equal(errorDeCamposEdicion(inicial), null)
  for (const campos of [
    { relacion: 'customer', relacionId: '' }, { relacion: 'project', relacionId: '-1' },
    { relacion: 'project', relacionId: '1.5' }, { tarifaHora: '' }, { tarifaHora: '-1' }, { tarifaHora: 'Infinity' },
    { tarifaHora: 'abc' }, { tarifaHora: '1000000000' }, { vencimiento: '2026-09-06' },
    { recurrente: true, repetirCada: '0' }, { recurrente: true, repetirCada: '366' },
    { recurrente: true, repetirCada: '1.5' }, { recurrente: true, unidadRecurrencia: 'invalid' },
    { recurrente: true, ciclos: '' }, { recurrente: true, ciclos: '-1' },
    { recurrente: true, ciclos: '366' }, { recurrente: true, ciclos: '1.5' }
  ]) assert.equal(typeof errorDeCamposEdicion({ ...inicial, ...campos }), 'string', JSON.stringify(campos))
  assert.equal(errorDeCamposEdicion({ ...inicial, relacion: 'project', relacionId: '1', tarifaHora: '0', recurrente: true, repetirCada: '1', ciclos: '0' }), null)
  assert.equal(errorDeCamposEdicion({ ...inicial, recurrente: true, repetirCada: '365', ciclos: '365', vencimiento: inicial.inicio }), null)
})


test('Sin proyecto valida, borra la relación y equivale a una relación inicial vacía', () => {
  const inicial = camposDeTarea({ ...TAREA, rel_type: 'project', rel_id: 2, task_type: { id: 7 } }, '')
  const sinProyecto = { ...inicial, relacionId: '' }
  assert.equal(errorDeCamposEdicion(sinProyecto), null)
  assert.deepEqual(cuerpoDeParche(inicial, sinProyecto), { rel_type: null, rel_id: null, milestone: 0, task_type: null })
  const vacia = camposDeTarea({ ...TAREA, milestone: null }, '')
  assert.deepEqual(cuerpoDeParche(vacia, { ...vacia, relacion: 'project' }), {})
  assert.equal(errorDeCamposEdicion({ ...vacia, tarifaHora: '999999999.99' }), null)
})
