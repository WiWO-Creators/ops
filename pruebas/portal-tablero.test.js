/**
 * Pruebas de la geometria de los graficos del tablero del cliente.
 *
 * Un grafico es una AFIRMACION dibujada, y las tres formas de mentir con uno son las que se prueban
 * acá: medir contra una escala que no corresponde, dividir por un denominador vacio, y —la peor—
 * dibujar una fila a la que le falta el dato como si valiera cero. Un `<svg>` no se prueba; esto si.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOLGURA_DE_ATRASO,
  barrasDeTrabas,
  claseDeSalud,
  filasDeSalud,
  lineaDeEntregas,
  tramosDeTareas,
  tramosPorEstado
} from '../src/componentes/portal/tablero.ts'

/** Un Proyecto del portal con lo minimo que los graficos le miran. */
function espacio (campos) {
  return {
    id: 1,
    name: 'Sitio institucional',
    description: null,
    status: 2,
    start_date: '2026-01-05',
    deadline: '2026-12-01',
    date_finished: null,
    progress: 40,
    counts: { tasks: 10, tasks_open: 4, milestones: 2 },
    ...campos
  }
}

/** El detalle de `/overview`, del que sale el plazo consumido. */
function detalle (left_percent) {
  return { progress: 0, days: { total: 100, left: left_percent, left_percent }, milestones: { total: 0, overdue: 0 } }
}

/** Un Hito de los que vienen. */
function hito (campos) {
  return {
    id: 1,
    name: 'Entrega inicial',
    due_date: '2026-10-30',
    project: { id: 1, name: 'Sitio institucional' },
    vencido: false,
    ...campos
  }
}

/** Una Tarea detenida. */
function bloqueo (campos) {
  return {
    id: 1,
    name: 'Aprobar la maqueta',
    project: { id: 1, name: 'Sitio institucional' },
    motivo: 'Falta el visto bueno',
    accion_necesaria: null,
    responsable: 'cliente',
    bloqueado_en: '2026-09-01',
    dias_bloqueada: 3,
    ...campos
  }
}

// --- Salud: avance contra plazo -----------------------------------------

test('el plazo consumido es el complemento de lo que queda', () => {
  const [fila] = filasDeSalud([espacio({ progress: 40 })], new Map([[1, detalle(15)]]))

  assert.equal(fila.plazoConsumido, 85)
  assert.equal(fila.avance, 40)
  assert.equal(fila.atraso, 45)
})

test('sin detalle no se inventa un plazo para completar el par', () => {
  // Es la mitad del grafico que falta. Rellenarla con cero dibujaria un Proyecto que no consumio
  // nada de su plazo, que es una afirmacion que nadie midio.
  const [fila] = filasDeSalud([espacio({})], new Map())

  assert.equal(fila.plazoConsumido, null)
  assert.equal(fila.atraso, null)
})

test('un Proyecto sin fecha de entrega tampoco tiene plazo que consumir', () => {
  const sinDias = { progress: 0, days: null, milestones: { total: 0, overdue: 0 } }
  const [fila] = filasDeSalud([espacio({ deadline: null })], new Map([[1, sinDias]]))

  assert.equal(fila.plazoConsumido, null)
})

test('un avance por encima de cien se acota en vez de salirse de la caja', () => {
  const [fila] = filasDeSalud([espacio({ progress: 103 })], new Map())

  assert.equal(fila.avance, 100)
})

test('el peor atraso va primero, y los que no se pueden medir al final', () => {
  const filas = filasDeSalud(
    [
      espacio({ id: 1, name: 'SinPlazo', progress: 10 }),
      espacio({ id: 2, name: 'Leve', progress: 70 }),
      espacio({ id: 3, name: 'Grave', progress: 10 })
    ],
    new Map([[2, detalle(20)], [3, detalle(5)]])
  )

  assert.deepEqual(filas.map((fila) => fila.nombre), ['Grave', 'Leve', 'SinPlazo'])
})

test('sin plazo no es ni atrasado ni al dia: es una tercera cosa', () => {
  // Pintarlo verde afirmaria que va bien contra un compromiso que no existe.
  assert.equal(claseDeSalud({ atraso: null, entregado: false }), 'sin_plazo')
})

test('un Proyecto entregado no se compara contra su plazo', () => {
  // `days` se calcula contra hoy: en un Proyecto cerrado hace meses diria "100% del tiempo usado"
  // de un trabajo que ya se hizo, que es la misma acusacion de atraso que la tarjeta ya no hace.
  const [fila] = filasDeSalud([espacio({ status: 4, progress: 91 })], new Map([[1, detalle(0)]]))

  assert.equal(fila.entregado, true)
  assert.equal(fila.plazoConsumido, null)
  assert.equal(claseDeSalud(fila), 'entregado')
})

test('la holgura evita gritar por un punto de diferencia', () => {
  assert.equal(claseDeSalud({ atraso: HOLGURA_DE_ATRASO, entregado: false }), 'al_dia')
  assert.equal(claseDeSalud({ atraso: HOLGURA_DE_ATRASO + 1, entregado: false }), 'atrasado')
})

test('ir adelantado es ir al dia, no una anomalia', () => {
  assert.equal(claseDeSalud({ atraso: -30, entregado: false }), 'al_dia')
})

// --- Barra apilada por estado -------------------------------------------

test('las fracciones de la barra apilada suman uno', () => {
  const tramos = tramosPorEstado([
    { status: 1, name: 'No iniciado', color: '#000', order: 1, total: 1 },
    { status: 2, name: 'En progreso', color: '#000', order: 2, total: 3 }
  ])

  assert.equal(tramos.reduce((suma, tramo) => suma + tramo.fraccion, 0), 1)
  assert.deepEqual(tramos.map((tramo) => tramo.etiqueta), ['No iniciado', 'En progreso'])
})

test('los estados en cero no ocupan un hueco en la leyenda', () => {
  // Un tramo de ancho cero no se ve pero si se lista, y una leyenda con entradas que no existen se
  // lee como un grafico roto.
  const tramos = tramosPorEstado([
    { status: 1, name: 'No iniciado', color: '#000', order: 1, total: 0 },
    { status: 2, name: 'En progreso', color: '#000', order: 2, total: 2 }
  ])

  assert.deepEqual(tramos.map((tramo) => tramo.etiqueta), ['En progreso'])
})

test('sin ningun Proyecto no hay barra que dibujar', () => {
  assert.deepEqual(tramosPorEstado([]), [])
  assert.deepEqual(
    tramosPorEstado([{ status: 1, name: 'No iniciado', color: '#000', order: 1, total: 0 }]),
    []
  )
})

test('la barra respeta el orden del catalogo y no el de la respuesta', () => {
  const tramos = tramosPorEstado([
    { status: 2, name: 'Segundo', color: '#000', order: 2, total: 1 },
    { status: 1, name: 'Primero', color: '#000', order: 1, total: 1 }
  ])

  assert.deepEqual(tramos.map((tramo) => tramo.etiqueta), ['Primero', 'Segundo'])
})

// --- Tareas: listas contra abiertas -------------------------------------

test('un Proyecto sin Tareas compartidas no dibuja una barra vacia', () => {
  // Una barra apilada en cero se lee como "no queda nada por hacer", que es lo contrario de "no lo
  // sabemos".
  assert.equal(tramosDeTareas({ tasks: 0, tasks_open: 0, milestones: 0 }), null)
})

test('las listas se derivan del total menos las abiertas', () => {
  const tramos = tramosDeTareas({ tasks: 10, tasks_open: 4, milestones: 0 })

  assert.deepEqual(tramos.map((tramo) => tramo.total), [6, 4])
  assert.equal(tramos[0].fraccion, 0.6)
})

test('mas abiertas que el total no produce un tramo negativo', () => {
  const tramos = tramosDeTareas({ tasks: 10, tasks_open: 12, milestones: 0 })

  assert.deepEqual(tramos.map((tramo) => tramo.total), [0, 10])
})

// --- Linea de tiempo de entregas ----------------------------------------

test('hoy entra siempre en la ventana, aunque todo este vencido', () => {
  // Sin esto, con todas las entregas pasadas el eje empieza en la mas vieja y el cliente no ve
  // donde esta parado.
  const linea = lineaDeEntregas(
    [hito({ id: 1, due_date: '2026-09-01' }), hito({ id: 2, due_date: '2026-09-10' })],
    new Date('2026-09-21T12:00:00Z')
  )

  assert.equal(linea.desde, -20)
  assert.equal(linea.hasta, 0)
})

test('las marcas caen dentro de la caja, entre cero y uno', () => {
  const linea = lineaDeEntregas(
    [hito({ id: 1, due_date: '2026-09-01' }), hito({ id: 2, due_date: '2026-10-21' })],
    new Date('2026-09-21T12:00:00Z')
  )

  for (const marca of linea.marcas) {
    assert.ok(marca.fraccion >= 0 && marca.fraccion <= 1, `${marca.id}: ${marca.fraccion}`)
  }
})

test('todas las entregas el mismo dia no dividen por cero', () => {
  const linea = lineaDeEntregas(
    [hito({ id: 1, due_date: '2026-09-21' }), hito({ id: 2, due_date: '2026-09-21' })],
    new Date('2026-09-21T12:00:00Z')
  )

  for (const marca of linea.marcas) assert.ok(Number.isFinite(marca.fraccion))
})

test('un Hito sin fecha no se ubica en un extremo: no se ubica', () => {
  const linea = lineaDeEntregas([hito({ due_date: null })], new Date('2026-09-21T12:00:00Z'))

  assert.deepEqual(linea.marcas, [])
})

test('sin Hitos con fecha la linea no existe', () => {
  assert.deepEqual(lineaDeEntregas([], new Date('2026-09-21T12:00:00Z')).marcas, [])
})

// --- Lo trabado, medido en dias -----------------------------------------

test('la escala es la traba mas vieja, no un tope inventado', () => {
  const barras = barrasDeTrabas([
    bloqueo({ id: 1, dias_bloqueada: 10 }),
    bloqueo({ id: 2, dias_bloqueada: 20 })
  ])

  assert.deepEqual(barras.map((barra) => barra.dias), [20, 10])
  assert.equal(barras[0].fraccion, 1)
  assert.equal(barras[1].fraccion, 0.5)
})

test('una traba sin dias no se grafica, pero eso no la borra de la pantalla', () => {
  // La lista de texto de abajo la sigue mostrando con su motivo. Un grafico que calla una fila es
  // peor que uno que no la puede medir.
  const barras = barrasDeTrabas([
    bloqueo({ id: 1, dias_bloqueada: null }),
    bloqueo({ id: 2, dias_bloqueada: 5 })
  ])

  assert.deepEqual(barras.map((barra) => barra.id), [2])
})

test('todo trabado hoy no hace desaparecer las barras', () => {
  // Con el maximo en cero, dividir daria NaN justo cuando todo se trabo a la vez.
  const barras = barrasDeTrabas([bloqueo({ id: 1, dias_bloqueada: 0 })])

  assert.equal(barras.length, 1)
  assert.equal(barras[0].fraccion, 0)
})

test('la clave de bloqueos que no vino no produce un grafico vacio con cara de cierto', () => {
  assert.deepEqual(barrasDeTrabas(undefined), [])
  assert.deepEqual(barrasDeTrabas(null), [])
})

test('se marca cual traba depende del cliente', () => {
  const barras = barrasDeTrabas([
    bloqueo({ id: 1, responsable: 'cliente', dias_bloqueada: 1 }),
    bloqueo({ id: 2, responsable: 'equipo', dias_bloqueada: 2 })
  ])

  const porId = new Map(barras.map((barra) => [barra.id, barra]))

  assert.equal(porId.get(1).deTuLado, true)
  assert.equal(porId.get(2).deTuLado, false)
})
