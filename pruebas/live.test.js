/**
 * Pruebas de LIVE: quien ve a quien, como se lee y se ordena el tablero, y que se le dice a la
 * persona cuando el medidor no arranca.
 *
 * Las tres cosas se rompen en silencio. Un alcance mal resuelto le pide a la API un tablero que no
 * le corresponde —o se lo esconde a quien si lo tiene—; una jerarquia que se come el nivel de la
 * Tarea deja "midiendo el Proyecto entero" indistinguible de "midiendo una Tarea", que es el unico
 * caso que esta pantalla existe para delatar; y un mensaje que no distingue el `409` de la jornada
 * del `409` del medidor deja a la persona sin saber que apretar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargoYArea, ordenarPorActividad, repartirTablero, trabajoDeLaFila } from '../src/componentes/live/presentacion.ts'
import { alcanceDeLive, esJefatura, mensajeDeFalloDeJornada, mensajeDeFalloDeMedidor } from '../src/dominio/live.ts'
import { GLOSARIO } from '../src/dominio/glosario.ts'

/** Un `/me` minimo: solo lo que `alcanceDeLive` mira. */
const yo = (extra = {}) => ({
  is_superadmin: false,
  is_director: false,
  dirige_areas: false,
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

test('quien dirige un area del organigrama ve a su gente, sin cargo ni capacidad de Perfex', () => {
  // El caso que antes caia en `propio`: la API le daba el tablero entero de su rama y la pantalla
  // ni se lo pedia, asi que el lider no veia a nadie.
  assert.equal(alcanceDeLive(yo({ dirige_areas: true })), 'subordinados')
})

test('el organigrama gana sobre el cargo Director, que es la regla anterior', () => {
  assert.equal(alcanceDeLive(yo({ dirige_areas: true, is_director: true })), 'subordinados')
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

test('el alcance total gana tambien sobre el del organigrama', () => {
  const ambos = yo({
    dirige_areas: true,
    permissions: { tasks: [], projects: [], customers: [], staff: ['view'] }
  })

  assert.equal(alcanceDeLive(ambos), 'todo')
})

test('quien mide va antes que quien solo tiene jornada, y ese antes que quien no tiene nada', () => {
  const orden = ordenarPorActividad([
    fila(1, 'Zoe', { jornada: true }),
    fila(2, 'Ana'),
    fila(3, 'Beto', { tarea: { id: 5, name: 'Algo' } })
  ])

  assert.deepEqual(orden.map((f) => f.staff.name), ['Beto', 'Zoe', 'Ana'])
})

test('a igualdad, alfabetico en español: la Ñ y los acentos no se van al final', () => {
  const orden = ordenarPorActividad([
    fila(1, 'Zoe', { espacio: DELCO }),
    fila(2, 'Ñato', { espacio: ACME }),
    fila(3, 'Ángela', { espacio: DELCO })
  ])

  assert.deepEqual(orden.map((f) => f.staff.name), ['Ángela', 'Ñato', 'Zoe'])
})

test('ninguna fila se pierde por el camino, y la lista original no se toca', () => {
  const filas = [
    fila(1, 'Ana', { espacio: DELCO }),
    fila(2, 'Beto'),
    fila(3, 'Carla', { espacio: ACME })
  ]
  const antes = filas.map((f) => f.staff.name)
  const orden = ordenarPorActividad(filas)

  assert.equal(orden.length, filas.length)
  // Ordenar el estado de React en el sitio es como se consiguen los repintados que no ocurren.
  assert.deepEqual(filas.map((f) => f.staff.name), antes)
})

test('un tablero vacio da una lista vacia', () => {
  assert.deepEqual(ordenarPorActividad([]), [])
})

test('quien mide cuelga dos niveles, y sus nombres salen del glosario', () => {
  const trabajo = trabajoDeLaFila(
    fila(1, 'Ana', { espacio: DELCO, tarea: { id: 77, name: 'Status semanal' } })
  )

  assert.equal(trabajo.midiendo, true)
  assert.deepEqual(trabajo.niveles.map((n) => n.etiqueta), [
    GLOSARIO.espacio.singular,
    GLOSARIO.proceso.singular
  ])
  assert.deepEqual(trabajo.niveles.map((n) => n.valor), ['DELCO', 'Status semanal'])
  assert.ok(trabajo.niveles.every((n) => !n.pendiente))
})

test('un medidor de Espacio sin Tarea lo dice, en vez de dejar el hueco', () => {
  const trabajo = trabajoDeLaFila(fila(1, 'Ana', { espacio: DELCO }))

  assert.equal(trabajo.niveles.length, 2)
  assert.equal(trabajo.niveles[0].valor, 'DELCO')
  assert.equal(trabajo.niveles[1].pendiente, true)
  assert.match(trabajo.niveles[1].valor, new RegExp(GLOSARIO.proceso.singular))
})

test('una Tarea suelta conserva su nivel y avisa que no hay Espacio detras', () => {
  const trabajo = trabajoDeLaFila(fila(1, 'Ana', { tarea: { id: 77, name: 'Status semanal' } }))

  assert.equal(trabajo.niveles[0].pendiente, true)
  assert.equal(trabajo.niveles[1].valor, 'Status semanal')
  assert.equal(trabajo.niveles[1].pendiente, false)
})

test('el medidor huerfano se muestra igual, con los dos niveles pendientes', () => {
  const huerfano = fila(1, 'Ana', { jornada: true })
  huerfano.medidor = { id: 1, project: null, task: null, start_time: '2026-09-09T12:30:00Z', seconds: 600 }
  const trabajo = trabajoDeLaFila(huerfano)

  assert.equal(trabajo.midiendo, true)
  assert.deepEqual(trabajo.niveles.map((n) => n.pendiente), [true, true])
})

test('sin medidor no hay jerarquia que colgar, y el motivo distingue los dos casos', () => {
  const conJornada = trabajoDeLaFila(fila(1, 'Ana', { jornada: true }))
  const sinJornada = trabajoDeLaFila(fila(2, 'Beto'))

  assert.equal(conJornada.midiendo, false)
  assert.equal(sinJornada.midiendo, false)
  assert.notEqual(conJornada.motivo, sinJornada.motivo)
  assert.match(sinJornada.motivo, /sin jornada/i)
})

test('sin cargo ni area no se pinta un separador suelto', () => {
  assert.equal(cargoYArea({ cargo: null, area: null }), null)
  assert.equal(cargoYArea({ cargo: '  ', area: null }), null)
})

test('el cargo y el area van juntos, y no se repiten cuando dicen lo mismo', () => {
  assert.equal(cargoYArea({ cargo: 'Diseñadora', area: 'Creativo' }), 'Diseñadora · Creativo')
  assert.equal(cargoYArea({ cargo: 'Diseño', area: 'Diseño' }), 'Diseño')
  assert.equal(cargoYArea({ cargo: null, area: 'Creativo' }), 'Creativo')
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

/**
 * El tablero se parte en dos, y el corte es tener jornada.
 *
 * `GET /live` devuelve a toda la empresa: en la base real, 184 filas para una persona midiendo. Si
 * las 183 restantes entran en la misma lista que la que trabaja, la pantalla que contesta "quien
 * esta trabajando ahora" es una pared de tarjetas que dicen "Sin jornada abierta".
 */
test('repartirTablero separa a quien tiene jornada de quien no', () => {
  const filas = [
    fila(1, 'Zoe'),
    fila(2, 'Ana', { jornada: true }),
    fila(3, 'Beto', { espacio: DELCO }),
    fila(4, 'Ada')
  ]

  const { activos, enReposo } = repartirTablero(filas)

  assert.deepEqual(activos.map((f) => f.staff.name), ['Beto', 'Ana'])
  assert.deepEqual(enReposo.map((f) => f.staff.name), ['Ada', 'Zoe'])
  assert.equal(activos.length + enReposo.length, filas.length, 'no se puede perder una fila')
})

/** Un medidor sin jornada es raro, pero es actividad: no puede caer en el pliegue. */
test('repartirTablero cuenta como activo el medidor sin jornada', () => {
  const huerfano = { ...fila(9, 'Huerfano', { espacio: ACME }), jornada: null }
  const { activos, enReposo } = repartirTablero([huerfano])

  assert.equal(activos.length, 1)
  assert.equal(enReposo.length, 0)
})

/**
 * El enlace al resumen del equipo se ofrece solo a quien puede abrirlo.
 *
 * Esconder no autoriza —la compuerta es el 403 de la API— pero un enlace que lleva a una pantalla
 * sin permiso tampoco informa: la mitad de la empresa lo vería y ninguna lo podría usar.
 */
test('esJefatura deja fuera a lider, focal y usuario', () => {
  for (const nivel of ['head', 'gerente', 'admin', 'superadmin']) {
    assert.equal(esJefatura(nivel), true, `${nivel} tendría que ver el resumen`)
  }

  for (const nivel of ['usuario', 'focal', 'lider']) {
    assert.equal(esJefatura(nivel), false, `${nivel} no tendría que ver el resumen`)
  }
})

/**
 * Abrir con Espacio puede fallar por el Espacio, no por la jornada.
 *
 * Desde que `POST /me/jornada` recibe `project_id` y `task_id`, la misma peticion arranca el
 * cronometro, asi que devuelve el 403/404 de la Tarea. Un mensaje que hable de la jornada mandaria a
 * la persona a buscar donde no es: la jornada no quedo abierta —la API la descarta— y lo que tiene
 * que cambiar es el destino.
 */
test('el fallo al abrir con destino nombra la Tarea, no la jornada', () => {
  assert.match(mensajeDeFalloDeJornada(403, true), /Tarea/)
  assert.match(mensajeDeFalloDeJornada(404, true), /Tarea/)
  assert.match(mensajeDeFalloDeJornada(422, true), /Tarea/)

  // Al cerrar no hay destino en juego: ahi 403 sigue siendo un fallo generico.
  assert.doesNotMatch(mensajeDeFalloDeJornada(403, false), /Tarea/)
})

/** El 409 sigue siendo el de la jornada: otra pestaña la abrio primero. */
test('el 409 al abrir sigue hablando de la jornada', () => {
  assert.equal(mensajeDeFalloDeJornada(409, true), 'Ya tienes una jornada abierta.')
})
