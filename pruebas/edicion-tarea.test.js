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
  camposDeTarea, cuerpoDeParche, nombresDeEtiquetas, personasElegibles
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
  tags: [{ id: 5, name: 'urgente' }]
}

test('los campos iniciales salen de la tarea, con vacio donde la API manda null', () => {
  const campos = camposDeTarea(TAREA, 'Texto de la descripción')

  assert.deepEqual(campos, {
    nombre: 'Carta de oferta',
    prioridad: '2',
    inicio: '2026-09-07',
    vencimiento: '',
    hito: '3',
    asignados: [20],
    seguidores: [],
    etiquetas: [5],
    descripcion: 'Texto de la descripción'
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
