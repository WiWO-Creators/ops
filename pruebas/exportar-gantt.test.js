/**
 * Exportacion del diagrama de Gantt.
 *
 * Lo que se prueba es lo que se rompe en silencio: que la planilla traiga exactamente las Tareas que
 * el diagrama dibuja —con su agrupacion y su filtro—, que un nombre con comas o con `<` no parta el
 * archivo, y que el SVG salga armado cuando hay fechas y no salga cuando no las hay.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  columnasDeGantt,
  csvDeGantt,
  duracionEnDias,
  escaparXml,
  filasDeExportacionGantt,
  nombreDeArchivoGantt,
  prepararDiagramaGantt,
  recortarTexto,
  svgDeGantt
} from '../src/componentes/proyecto/exportar-gantt.ts'
import { GLOSARIO } from '../src/dominio/glosario.ts'

const ESTADOS = [
  { id: 1, name: 'Sin empezar' },
  { id: 4, name: 'En progreso' },
  { id: 5, name: 'Completa' }
]

const HOY = '2026-03-10'

/** Una Tarea del Gantt con lo justo, para no repetir el objeto entero en cada caso. */
function tarea (parcial) {
  return {
    id: 1,
    name: 'Tarea',
    start: null,
    end: null,
    progress: 0,
    status: 1,
    color: null,
    dependencies: [],
    ...parcial
  }
}

/** Un grupo del Gantt con lo justo. */
function grupo (parcial) {
  return { id: 'milestone-1', nombre: 'Hito 1', grupo: true, start: null, end: null, tareas: [], ...parcial }
}

/** Opciones de planilla por defecto. */
function opciones (parcial = {}) {
  return { agrupar: 'milestones', estados: ESTADOS, hoy: HOY, ...parcial }
}

test('una fila por Tarea dibujada, con el grupo en el que se la ve', () => {
  const grupos = [
    grupo({ tareas: [tarea({ id: 1, name: 'Diseño' }), tarea({ id: 2, name: 'Armado' })] }),
    grupo({ id: 'milestone-2', nombre: 'Hito 2', tareas: [tarea({ id: 3, name: 'Entrega' })] })
  ]

  const filas = filasDeExportacionGantt(grupos, opciones())

  assert.deepEqual(filas.map((fila) => [fila.grupo, fila.tarea]), [
    ['Hito 1', 'Diseño'],
    ['Hito 1', 'Armado'],
    ['Hito 2', 'Entrega']
  ])
})

test('la misma Tarea en dos grupos sale una vez por grupo, como en pantalla', () => {
  const grupos = [
    grupo({ id: 'member-7', nombre: 'Ana', tareas: [tarea({ id: 1, name: 'Diseño' })] }),
    grupo({ id: 'member-9', nombre: 'Beto', tareas: [tarea({ id: 1, name: 'Diseño' })] })
  ]

  const filas = filasDeExportacionGantt(grupos, opciones({ agrupar: 'members' }))

  assert.deepEqual(filas.map((fila) => fila.grupo), ['Ana', 'Beto'])
})

test('el estado sale con su nombre, y con el id cuando el catalogo no lo tiene', () => {
  const grupos = [grupo({ tareas: [tarea({ status: 4 }), tarea({ id: 2, status: 77 })] })]
  const filas = filasDeExportacionGantt(grupos, opciones())

  assert.equal(filas[0].estado, 'En progreso')
  assert.equal(filas[1].estado, '#77')
})

test('las dependencias salen con el nombre de la Tarea, y con el id si el filtro la dejo fuera', () => {
  const grupos = [
    grupo({
      tareas: [
        tarea({ id: 1, name: 'Diseño' }),
        tarea({ id: 2, name: 'Armado', dependencies: [{ depends_on: 1, type: null }, { depends_on: 99, type: null }] })
      ]
    })
  ]

  const filas = filasDeExportacionGantt(grupos, opciones())

  assert.equal(filas[1].dependencias, 'Diseño; #99')
})

test('marca vencida lo mismo que el diagrama: entrega pasada y sin completar', () => {
  const grupos = [
    grupo({
      tareas: [
        tarea({ id: 1, name: 'Atrasada', start: '2026-01-05', end: '2026-02-01', status: 4 }),
        tarea({ id: 2, name: 'Cerrada', start: '2026-01-05', end: '2026-02-01', status: 5 }),
        tarea({ id: 3, name: 'Futura', start: '2026-04-01', end: '2026-04-10', status: 1 })
      ]
    })
  ]

  const filas = filasDeExportacionGantt(grupos, opciones())

  assert.deepEqual(filas.map((fila) => fila.vencida), ['Sí', 'No', 'No'])
})

test('sin ninguna fecha nada queda vencido y la duracion viaja vacia', () => {
  const grupos = [grupo({ tareas: [tarea({ id: 1, name: 'Sin fechas' })] })]
  const filas = filasDeExportacionGantt(grupos, opciones())

  assert.equal(filas[0].vencida, 'No')
  assert.equal(filas[0].duracion, null)
  assert.equal(filas[0].inicio, '')
})

test('la duracion cuenta los dos extremos y una sola fecha dura un dia', () => {
  assert.equal(duracionEnDias('2026-03-01', '2026-03-03'), 3)
  assert.equal(duracionEnDias('2026-03-01', null), 1)
  assert.equal(duracionEnDias(null, '2026-03-01'), 1)
  assert.equal(duracionEnDias(null, null), null)
  // Fechas dadas vuelta: el diagrama dibuja el tramo igual, la planilla no puede dar negativo.
  assert.equal(duracionEnDias('2026-03-03', '2026-03-01'), 3)
})

test('el encabezado del grupo cambia con la agrupacion y nunca se repite con el de estado', () => {
  assert.equal(columnasDeGantt('milestones')[0].encabezado, GLOSARIO.hito.plural)
  assert.equal(columnasDeGantt('members')[0].encabezado, 'Miembros')
  assert.equal(columnasDeGantt('status')[0].encabezado, 'Estado del grupo')
  assert.equal(columnasDeGantt('status')[5].encabezado, 'Estado')
})

test('el CSV escapa comas, comillas y saltos de linea del nombre de la Tarea', () => {
  const grupos = [
    grupo({ tareas: [tarea({ name: 'Campaña "70 años", fase 1\nsegunda linea' })] })
  ]

  const csv = csvDeGantt(grupos, opciones())
  const [encabezado, fila] = csv.split('\r\n')

  assert.equal(encabezado, `${GLOSARIO.hito.plural},Tarea,Inicio,Entrega,Duración (días),Estado,Avance (%),Vencida,Depende de`)
  assert.ok(fila.startsWith('Hito 1,"Campaña ""70 años"", fase 1'), fila)
})

test('un diagrama sin Tareas deja solo el encabezado', () => {
  assert.equal(csvDeGantt([], opciones()).split('\r\n').length, 1)
})

test('el nombre del archivo lleva el Proyecto, la fecha y la extension pedida', () => {
  const hoy = new Date('2026-08-25T12:00:00Z')

  assert.equal(nombreDeArchivoGantt(13, 'csv', hoy), 'gantt-proyecto-13-2026-08-25.csv')
  assert.equal(nombreDeArchivoGantt(13, 'png', hoy), 'gantt-proyecto-13-2026-08-25.png')
})

test('sin fechas no hay diagrama que dibujar', () => {
  const grupos = [grupo({ tareas: [tarea({ id: 1, name: 'Sin fechas' })] })]

  assert.equal(prepararDiagramaGantt(grupos, { zoom: 'mes', agrupar: 'milestones', hoy: HOY, proyectoId: 13 }), null)
})

test('el diagrama preparado trae medidas, escala y resumen de lo que se esta viendo', () => {
  const grupos = [
    grupo({
      start: '2026-03-01',
      end: '2026-03-20',
      tareas: [
        tarea({ id: 1, name: 'Diseño', start: '2026-03-01', end: '2026-03-10' }),
        tarea({ id: 2, name: 'Armado', start: '2026-03-11', end: '2026-03-20', dependencies: [{ depends_on: 1, type: null }] })
      ]
    })
  ]

  const diagrama = prepararDiagramaGantt(grupos, { zoom: 'dia', agrupar: 'milestones', hoy: HOY, proyectoId: 13 })

  assert.ok(diagrama !== null)
  // Tres filas: el grupo y sus dos Tareas.
  assert.equal(diagrama.filas.length, 3)
  assert.ok(diagrama.ancho > 0 && diagrama.alto > 0)
  assert.equal(diagrama.flechas.length, 1)
  assert.match(diagrama.titulo, /Proyecto #13/)
  assert.match(diagrama.subtitulo, /2 Tareas/)
  assert.match(diagrama.subtitulo, /escala Día/)
  assert.ok(diagrama.subtitulo.includes(`agrupado por ${GLOSARIO.hito.plural}`), diagrama.subtitulo)
})

test('el SVG sale entero y con el nombre de la Tarea escapado', () => {
  const grupos = [
    grupo({
      start: '2026-03-01',
      end: '2026-03-20',
      tareas: [tarea({ id: 1, name: 'Diseño <b> & "cierre"', start: '2026-03-01', end: '2026-03-10' })]
    })
  ]

  const diagrama = prepararDiagramaGantt(grupos, { zoom: 'semana', agrupar: 'milestones', hoy: HOY, proyectoId: 13 })
  const svg = svgDeGantt(diagrama)

  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(svg.endsWith('</svg>'))
  assert.ok(svg.includes(`width="${diagrama.ancho}"`))
  assert.ok(svg.includes('Diseño &lt;b&gt; &amp;'))
  assert.ok(!svg.includes('<b>'))
})

test('el SVG pinta el color de estado que administra el panel', () => {
  const grupos = [
    grupo({
      start: '2026-03-01',
      end: '2026-03-10',
      tareas: [tarea({ id: 1, start: '2026-03-01', end: '2026-03-10', color: '#ff8800' })]
    })
  ]

  const svg = svgDeGantt(prepararDiagramaGantt(grupos, { zoom: 'mes', agrupar: 'milestones', hoy: HOY, proyectoId: 13 }))

  assert.ok(svg.includes('fill="#ff8800"'))
})

test('el nombre largo se recorta con puntos suspensivos', () => {
  assert.equal(recortarTexto('Diseño', 20), 'Diseño')
  assert.equal(recortarTexto('Diseño de la campaña', 10), 'Diseño de…')
  assert.equal(recortarTexto('Diseño', 0), '')
})

test('escaparXml cubre los cuatro caracteres que rompen el documento', () => {
  assert.equal(escaparXml('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;')
})
