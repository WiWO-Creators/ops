/**
 * Pruebas de la fusion entre el parser local y el modelo, en el alta de tarea.
 *
 * Cubren las dos formas en que esto arruina el dia de alguien y ninguna de las dos da error:
 * que el modelo pise lo que la persona escribio explicitamente, y que un id inventado se cuele hasta
 * el `POST /tasks` y deje la tarea asignada a otra persona. Las dos se ven recien cuando la tarea ya
 * esta creada y en el tablero de quien no corresponde.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarAltaRapida } from '../src/dominio/alta-rapida.ts'
import { fusionarInterpretacion, leerCamposTarea } from '../src/dominio/ia-tarea.ts'

const CATALOGOS = {
  personas: [
    { id: 12, full_name: 'Franz Molina' },
    { id: 15, full_name: 'Ana Rivas' }
  ],
  espacios: [{ id: 8, name: 'Colbún' }],
  prioridades: [
    { id: 1, name: 'Baja' },
    { id: 2, name: 'Media' },
    { id: 3, name: 'Alta' },
    { id: 4, name: 'Urgente' }
  ],
  etiquetas: [
    { id: 30, name: 'urgente' },
    { id: 31, name: 'Cliente-clave' }
  ]
}

/** Un `CamposTarea` completo con lo que se quiera pisar. Evita repetir once campos en cada prueba. */
function respuestaIa (parcial = {}) {
  return {
    name: null,
    description: null,
    due_date: null,
    start_date: null,
    priority: null,
    rel_type: null,
    rel_id: null,
    milestone: null,
    assignees: [],
    tags: [],
    no_resuelto: [],
    ...parcial
  }
}

/** El parser local sobre un texto, con los mismos catalogos que usa el formulario. */
function local (texto, ahora = new Date(2026, 8, 4)) {
  return interpretarAltaRapida(texto, CATALOGOS, ahora)
}

test('lo explicito del parser local gana sobre el modelo', () => {
  const fusion = fusionarInterpretacion(
    local('Rehacer la grilla 2026-09-11 !alta @"Franz Molina"'),
    respuestaIa({
      name: 'Rehacer la grilla de septiembre',
      due_date: '2026-12-25',
      priority: 4,
      assignees: [15]
    }),
    CATALOGOS
  )

  assert.equal(fusion.due_date, '2026-09-11', 'la fecha escrita no se pisa')
  assert.equal(fusion.priority, 3, 'la prioridad escrita con ! no se pisa')
  assert.deepEqual(fusion.assignees, [12], 'el @persona escrito no se pisa')
  assert.ok(!fusion.deIa.includes('due_date'))
  assert.ok(!fusion.deIa.includes('priority'))
  assert.ok(!fusion.deIa.includes('assignees'))
})

test('el titulo es la excepcion declarada: el del modelo pisa al del parser', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer grilla septiembre 2026-09-11'),
    respuestaIa({ name: 'Rehacer la grilla de septiembre' }),
    CATALOGOS
  )

  assert.equal(fusion.name, 'Rehacer la grilla de septiembre')
  assert.deepEqual(fusion.deIa, ['name'], 'el titulo queda marcado como venido del modelo')
})

test('el modelo llena solo los huecos que dejo el parser', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla'),
    respuestaIa({ due_date: '2026-09-11', start_date: '2026-09-05', priority: 4, assignees: [12] }),
    CATALOGOS
  )

  assert.equal(fusion.due_date, '2026-09-11')
  assert.equal(fusion.start_date, '2026-09-05')
  assert.equal(fusion.priority, 4)
  assert.deepEqual(fusion.assignees, [12])
  assert.deepEqual(
    fusion.deIa.sort(),
    ['assignees', 'due_date', 'priority', 'start_date'],
    'el resultado marca exactamente que campos vinieron del modelo'
  )
})

test('un responsable fuera de catalogo se descarta y se lista como no resuelto', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla'),
    respuestaIa({ assignees: [99, 12] }),
    CATALOGOS
  )

  assert.deepEqual(fusion.assignees, [12], 'el id inventado no llega al formulario')
  assert.ok(fusion.noResuelto.includes('Responsable #99'))
})

test('sin catalogo de personas no sobrevive ningun responsable', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla'),
    respuestaIa({ assignees: [12] }),
    { ...CATALOGOS, personas: [] }
  )

  assert.deepEqual(fusion.assignees, [], 'el formulario de tarea no asigna: nada se cuela')
  assert.ok(!fusion.deIa.includes('assignees'))
  assert.ok(fusion.noResuelto.includes('Responsable #12'))
})

test('una prioridad fuera de catalogo se descarta', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla'),
    respuestaIa({ priority: 77 }),
    CATALOGOS
  )

  assert.equal(fusion.priority, null)
  assert.ok(fusion.noResuelto.includes('Prioridad #77'))
})

test('una fecha con formato invalido se descarta y se anota', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla'),
    respuestaIa({ due_date: 'el viernes', start_date: '11/09/2026' }),
    CATALOGOS
  )

  assert.equal(fusion.due_date, null, 'un `<input type=date>` con basura queda vacio sin avisar')
  assert.equal(fusion.start_date, null)
  assert.ok(!fusion.deIa.includes('due_date'))
  assert.ok(fusion.noResuelto.includes('Vencimiento «el viernes»'))
  assert.ok(fusion.noResuelto.includes('Inicio «11/09/2026»'))
})

test('las etiquetas se resuelven contra el catalogo y la IA no crea catalogo', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla'),
    respuestaIa({ tags: ['URGENTE', 'inventada'] }),
    CATALOGOS
  )

  assert.deepEqual(fusion.tags, ['urgente'], 'compara sin mayusculas y devuelve el nombre del catalogo')
  assert.ok(fusion.deIa.includes('tags'))
  assert.ok(fusion.noResuelto.includes('Etiqueta «inventada»'))
})

test('lo no resuelto del parser y lo del modelo se acumulan', () => {
  const fusion = fusionarInterpretacion(
    local('rehacer la grilla @nadie'),
    respuestaIa({ no_resuelto: ['el equipo de diseño'] }),
    CATALOGOS
  )

  assert.ok(fusion.noResuelto.includes('@nadie'))
  assert.ok(fusion.noResuelto.includes('el equipo de diseño'))
  assert.match(fusion.name, /@nadie/, 'lo que no se reconoce sigue en el titulo')

  // El parser y el modelo tropiezan con lo mismo: verlo dos veces hace dudar de si son dos cosas.
  const repetido = fusionarInterpretacion(
    local('rehacer la grilla @nadie'),
    respuestaIa({ no_resuelto: ['@nadie'] }),
    CATALOGOS
  )

  assert.deepEqual(repetido.noResuelto, ['@nadie'], 'lo no resuelto no se lista dos veces')
})

test('sin respuesta del modelo queda lo del parser y nada marcado como IA', () => {
  const fusion = fusionarInterpretacion(local('rehacer la grilla 2026-09-11 !alta'), null, CATALOGOS)

  assert.equal(fusion.name, 'rehacer la grilla')
  assert.equal(fusion.due_date, '2026-09-11')
  assert.equal(fusion.priority, 3)
  assert.deepEqual(fusion.deIa, [])
})

test('un payload malformado no revienta la fusion', () => {
  assert.equal(leerCamposTarea(null), null)
  assert.equal(leerCamposTarea('texto'), null)
  assert.equal(leerCamposTarea([1, 2]), null)

  const leido = leerCamposTarea({ name: 'Algo', priority: 'alta', assignees: ['12', 15], tags: null })

  assert.equal(leido.name, 'Algo')
  assert.equal(leido.priority, null, 'una prioridad que no es numero no llega al formulario')
  assert.deepEqual(leido.assignees, [15], 'los ids que no son numero se caen')
  assert.deepEqual(leido.tags, [])
  assert.deepEqual(leido.no_resuelto, [])

  const fusion = fusionarInterpretacion(local('rehacer la grilla'), leido, CATALOGOS)

  assert.equal(fusion.name, 'Algo')
  assert.deepEqual(fusion.assignees, [15])
})
