/**
 * Pruebas de LIVE: quien ve a quien, como se agrupa el tablero y que se le dice a la persona cuando
 * el medidor no arranca.
 *
 * Las tres cosas se rompen en silencio. Un alcance mal resuelto le pide a la API un tablero que no
 * le corresponde —o se lo esconde a quien si lo tiene—; un agrupado que pierde una fila deja a
 * alguien invisible en el tablero de su jefatura; y un mensaje que no distingue el `409` de la
 * jornada del `409` del medidor deja a la persona sin saber que apretar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorEspacio } from '../src/componentes/live/presentacion.ts'
import { alcanceDeLive, mensajeDeFalloDeJornada, mensajeDeFalloDeMedidor } from '../src/dominio/live.ts'

/** Un `/me` minimo: solo lo que `alcanceDeLive` mira. */
const yo = (extra = {}) => ({
  is_superadmin: false,
  is_director: false,
  permissions: { tasks: [], projects: [], customers: [], staff: [] },
  ...extra
})

/** Una fila del tablero, con lo justo para ordenarla. */
const fila = (id, nombre, { espacio = null, tarea = null, jornada = false } = {}) => ({
  staff: { id, name: nombre, avatar: null, cargo: null, area: null },
  jornada: jornada || espacio !== null || tarea !== null
    ? { id, started_at: '2026-09-09T12:00:00Z', seconds: 3600 }
    : null,
  medidor: espacio === null && tarea === null
    ? null
    : {
        id,
        project: espacio,
        task: tarea,
        start_time: '2026-09-09T12:30:00Z',
        seconds: 600
      },
  presencia: null,
  seconds_today: 3600
})

const DELCO = { id: 4, name: 'DELCO' }
const ACME = { id: 9, name: 'ACME' }

test('sin permisos ni cargo, uno solo se ve a si mismo', () => {
  assert.equal(alcanceDeLive(yo()), 'propio')
})

test('el cargo Director abre el area, aunque Perfex no le haya dado ninguna capacidad', () => {
  assert.equal(alcanceDeLive(yo({ is_director: true })), 'area')
})

test('quien puede ver el Equipo ve el tablero entero', () => {
  const conStaffView = yo({ permissions: { tasks: [], projects: [], customers: [], staff: ['view'] } })

  assert.equal(alcanceDeLive(conStaffView), 'todo')
})

test('el superadministrador ve el tablero entero aunque no tenga la capacidad de Perfex', () => {
  assert.equal(alcanceDeLive(yo({ is_superadmin: true })), 'todo')
})

test('el alcance total gana sobre el de area', () => {
  const ambos = yo({
    is_director: true,
    permissions: { tasks: [], projects: [], customers: [], staff: ['view'] }
  })

  assert.equal(alcanceDeLive(ambos), 'todo')
})

test('agrupa por el Espacio que cada quien esta midiendo', () => {
  const grupos = agruparPorEspacio([
    fila(1, 'Ana', { espacio: DELCO }),
    fila(2, 'Beto', { espacio: ACME }),
    fila(3, 'Carla', { espacio: DELCO })
  ])

  assert.deepEqual(grupos.map((g) => g.nombre), ['DELCO', 'ACME'])
  assert.deepEqual(grupos[0].personas.map((p) => p.staff.name), ['Ana', 'Carla'])
})

test('un tablero vacio da una lista vacia, no un grupo vacio', () => {
  assert.deepEqual(agruparPorEspacio([]), [])
})

test('quien no mide nada cae en su grupo, y ese grupo va siempre ultimo', () => {
  const grupos = agruparPorEspacio([
    fila(1, 'Ana'),
    fila(2, 'Beto', { espacio: DELCO }),
    fila(3, 'Carla')
  ])

  assert.equal(grupos.at(-1).clave, 'sin-espacio')
  assert.equal(grupos.at(-1).personas.length, 2)
  // El nombre sale del glosario: la interfaz llama "Proyecto" a un Espacio.
  assert.match(grupos.at(-1).nombre, /^Sin /)
})

test('ninguna fila se pierde por el camino', () => {
  const filas = [
    fila(1, 'Ana', { espacio: DELCO }),
    fila(2, 'Beto'),
    fila(3, 'Carla', { espacio: ACME }),
    fila(4, 'Dora', { espacio: DELCO })
  ]
  const total = agruparPorEspacio(filas).reduce((suma, g) => suma + g.personas.length, 0)

  assert.equal(total, filas.length)
})

test('un medidor sobre una tarea sin Espacio no inventa un grupo', () => {
  const grupos = agruparPorEspacio([fila(1, 'Ana', { tarea: { id: 77, name: 'Status semanal' } })])

  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].clave, 'sin-espacio')
})

test('dentro del grupo, quien mide va antes que quien solo tiene jornada', () => {
  const grupos = agruparPorEspacio([
    fila(1, 'Zoe', { jornada: true }),
    fila(2, 'Ana'),
    fila(3, 'Beto', { tarea: { id: 5, name: 'Algo' } })
  ])

  assert.deepEqual(grupos[0].personas.map((p) => p.staff.name), ['Beto', 'Zoe', 'Ana'])
})

test('el orden de los grupos no depende del orden en que llegaron las filas', () => {
  const filas = [
    fila(1, 'Ana', { espacio: ACME }),
    fila(2, 'Beto', { espacio: DELCO }),
    fila(3, 'Carla', { espacio: DELCO })
  ]

  assert.deepEqual(agruparPorEspacio(filas).map((g) => g.nombre), ['DELCO', 'ACME'])
  assert.deepEqual(agruparPorEspacio([...filas].reverse()).map((g) => g.nombre), ['DELCO', 'ACME'])
})

test('el 409 al arrancar nombra las dos causas, porque la API no las distingue', () => {
  const mensaje = mensajeDeFalloDeMedidor(409, true)

  assert.match(mensaje, /jornada/i)
  assert.match(mensaje, /medidor corriendo/i)
})

test('el 409 al detener dice otra cosa que el de arrancar', () => {
  assert.notEqual(mensajeDeFalloDeMedidor(409, true), mensajeDeFalloDeMedidor(409, false))
  assert.match(mensajeDeFalloDeMedidor(409, false), /no tienes/i)
})

test('un fallo de red no muestra un codigo inventado', () => {
  assert.match(mensajeDeFalloDeMedidor(0, true), /conexión/i)
  assert.doesNotMatch(mensajeDeFalloDeMedidor(0, true), /\b0\b/)
})

test('cualquier codigo desconocido igual produce una frase', () => {
  assert.match(mensajeDeFalloDeMedidor(500, true), /500/)
  assert.ok(mensajeDeFalloDeMedidor(418, false).length > 0)
})

test('el 403 distingue arrancar de detener', () => {
  assert.match(mensajeDeFalloDeMedidor(403, false), /propio/i)
  assert.notEqual(mensajeDeFalloDeMedidor(403, true), mensajeDeFalloDeMedidor(403, false))
})

test('el 409 de la jornada no es ambiguo y se dice tal cual', () => {
  assert.match(mensajeDeFalloDeJornada(409, true), /ya tienes una jornada/i)
  assert.match(mensajeDeFalloDeJornada(409, false), /no tienes ninguna/i)
})
