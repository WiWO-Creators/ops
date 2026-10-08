/**
 * Pruebas de la lectura de actividad del portal: lo que el panel dice a partir de rutas y claves.
 *
 * Importa lo que no se puede mostrar mal: que lo nunca abierto aparezca, que un nombre no se
 * invente y que la serie diaria no salte dias.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  etiquetaDeClick,
  etiquetaDeRuta,
  extremosDelRanking,
  formatearDuracion,
  formatearHora,
  fraccionDeBarra,
  fraseDePaso,
  rankingDeVistas,
  serieContinua
} from '../src/dominio/actividad-portal.ts'

test('la duracion se lee corta', () => {
  assert.equal(formatearDuracion(0), '0 s')
  assert.equal(formatearDuracion(45), '45 s')
  assert.equal(formatearDuracion(180), '3 min')
  assert.equal(formatearDuracion(4320), '1 h 12 min')
  assert.equal(formatearDuracion(7200), '2 h')
  assert.equal(formatearDuracion(-5), '0 s')
  assert.equal(formatearDuracion(Number.NaN), '0 s')
})

test('un proyecto con nombre conocido se nombra; sin nombre cae al generico', () => {
  assert.equal(etiquetaDeRuta('/portal/proyectos/12', { 12: 'DELCO' }), 'Proyecto «DELCO»')
  assert.equal(etiquetaDeRuta('/portal/proyectos/99', { 12: 'DELCO' }), 'Detalle de un Proyecto')
  assert.equal(etiquetaDeRuta('/portal/proyectos/:id'), 'Detalle de un Proyecto')
  assert.equal(etiquetaDeRuta('/portal/soporte'), 'Tickets')
  assert.equal(etiquetaDeRuta('/portal/algo-nuevo'), '/portal/algo-nuevo')
})

test('los botones tienen frase propia, y los desconocidos se humanizan', () => {
  assert.equal(etiquetaDeClick('aprobacion.aprobar'), 'Aprobar una tarea')
  assert.equal(etiquetaDeClick('pestana.gantt'), 'Pestaña Gantt')
  assert.equal(etiquetaDeClick('enlace.proyectos.id'), 'Enlace a proyectos')
  assert.equal(etiquetaDeClick('boton.cerrar-sesion'), 'Cerrar sesion')
  assert.equal(etiquetaDeClick('algo.nuevo'), 'Algo nuevo')
})

test('la frase de un paso dice lo que hizo el contacto', () => {
  const nombres = { 12: 'DELCO' }

  assert.equal(fraseDePaso({ tipo: 'vista', ruta: '/portal/proyectos/12', pestana: null, objetivo: null, objeto_id: 12, segundos: 30, a: null }, nombres), 'Entró a Proyecto «DELCO»')
  assert.equal(fraseDePaso({ tipo: 'pestana', ruta: '/portal/proyectos/12', pestana: 'gantt', objetivo: null, objeto_id: 12, segundos: 5, a: null }, nombres), 'Abrió la pestaña Gantt')
  assert.equal(fraseDePaso({ tipo: 'click', ruta: '/portal', pestana: null, objetivo: 'ticket.nuevo', objeto_id: null, segundos: null, a: null }), 'Pulsó «Nuevo ticket»')
})

test('el ranking incluye lo que nunca se abrio, al final', () => {
  const ranking = rankingDeVistas([
    { ruta: '/portal', pestana: null, visitas: 9, segundos: 100 },
    { ruta: '/portal/proyectos/:id', pestana: 'gantt', visitas: 4, segundos: 60 },
    { ruta: '/portal/ruta-nueva', pestana: null, visitas: 1, segundos: 5 }
  ])

  assert.equal(ranking[0].etiqueta, 'Inicio')
  assert.equal(ranking[1].etiqueta, 'Pestaña Gantt')
  assert.equal(ranking[2].etiqueta, '/portal/ruta-nueva')
  assert.ok(ranking.slice(3).every((f) => f.nunca && f.visitas === 0))
  assert.ok(ranking.some((f) => f.etiqueta === 'Mi perfil' && f.nunca))
})

test('los extremos separan lo mas visto de lo menos visto sin repetir filas', () => {
  const ranking = rankingDeVistas([{ ruta: '/portal', pestana: null, visitas: 3, segundos: 10 }])
  const { mas, menos } = extremosDelRanking(ranking, 5)

  assert.deepEqual(mas.map((f) => f.etiqueta), ['Inicio'])
  assert.equal(menos.length, 5)
  assert.ok(menos.every((f) => f.nunca))
  assert.ok(!menos.some((f) => mas.includes(f)))
})

test('la serie diaria no salta dias', () => {
  const serie = serieContinua('2026-09-28', '2026-10-02', [{ dia: '2026-09-30', sesiones: 2, segundos: 90 }])

  assert.deepEqual(serie.map((d) => d.dia), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  assert.deepEqual(serie.map((d) => d.sesiones), [0, 0, 2, 0, 0])
})

test('la fraccion de una barra se acota entre 0 y 1', () => {
  assert.equal(fraccionDeBarra(5, 10), 0.5)
  assert.equal(fraccionDeBarra(20, 10), 1)
  assert.equal(fraccionDeBarra(5, 0), 0)
  assert.equal(fraccionDeBarra(-1, 10), 0)
})

test('la hora se lee en la zona del negocio y sin fecha', () => {
  assert.match(formatearHora('2026-10-02T15:03:00Z'), /^\d{2}:\d{2}$/)
  assert.equal(formatearHora(null), '')
  assert.equal(formatearHora('no es una fecha'), '')
})
