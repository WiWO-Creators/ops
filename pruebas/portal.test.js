/**
 * Pruebas de la navegacion del portal del cliente.
 *
 * Lo que se prueba es la decision de que ve cada contacto. Un contacto sin permiso de proyectos que
 * ve el enlace a proyectos no rompe nada —la API responde 403— pero le muestra una puerta cerrada y
 * lo obliga a descubrirlo a los golpes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO_PORTAL, seccionesDelPortal } from '../src/dominio/portal.ts'

test('solo muestra las secciones que la API habilito', () => {
  const secciones = seccionesDelPortal(['projects', 'files', 'kb'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects', 'files', 'kb'])
})

test('un contacto sin ninguna seccion no ve navegacion', () => {
  assert.deepEqual(seccionesDelPortal([]), [])
})

test('ignora claves que el frontend todavia no conoce', () => {
  // Si la API suma una seccion antes que el frontend, la navegacion no puede romperse.
  const secciones = seccionesDelPortal(['projects', 'seccion-del-futuro'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects'])
})

test('respeta el orden del catalogo y no el del argumento', () => {
  // El orden lo fija el producto, no en que orden vino el arreglo de la API.
  const secciones = seccionesDelPortal(['kb', 'projects', 'files'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects', 'files', 'kb'])
})

test('todas las rutas del catalogo cuelgan de /portal', () => {
  // Una ruta fuera de /portal caeria en el guardia del panel y mandaria al cliente al login del
  // equipo.
  for (const seccion of CATALOGO_PORTAL) {
    assert.equal(seccion.href.startsWith('/portal/'), true, `${seccion.clave}: ${seccion.href}`)
  }
})

test('no hay claves ni rutas repetidas', () => {
  const claves = CATALOGO_PORTAL.map((s) => s.clave)
  const rutas = CATALOGO_PORTAL.map((s) => s.href)

  assert.equal(new Set(claves).size, claves.length)
  assert.equal(new Set(rutas).size, rutas.length)
})

import { PESTANIAS_PROYECTO, PORTAL_PROYECTOS, PORTAL_TAREAS, pestaniasDelProyecto } from '../src/definiciones/portal-proyectos.ts'

test('las pestañas del proyecto salen de lo que habilito la API', () => {
  const visibles = pestaniasDelProyecto(['overview', 'tasks', 'gantt'])

  assert.deepEqual(visibles.map((p) => p.clave), ['overview', 'tasks', 'gantt'])
})

test('ignora las pestañas que la API habilita y el portal no construyo', () => {
  // Contratos y propuestas dentro de un proyecto: se ven en su seccion propia del menu, y una
  // pestaña que no lleva a ningun lado es peor que ninguna.
  const visibles = pestaniasDelProyecto(['tasks', 'contracts', 'proposals'])

  assert.deepEqual(visibles.map((p) => p.clave), ['tasks'])
})

test('el orden lo fija el producto, no el arreglo de la API', () => {
  const visibles = pestaniasDelProyecto(['activity', 'tickets', 'overview', 'tasks'])

  assert.deepEqual(visibles.map((p) => p.clave), ['overview', 'tasks', 'tickets', 'activity'])
})

test('un proyecto sin nada compartido no dibuja pestañas', () => {
  assert.deepEqual(pestaniasDelProyecto([]), [])
})

test('cada pestaña conocida tiene rotulo y no se repite', () => {
  const claves = PESTANIAS_PROYECTO.map((p) => p.clave)

  assert.equal(new Set(claves).size, claves.length)
  for (const p of PESTANIAS_PROYECTO) assert.equal(p.etiqueta.length > 0, true, p.clave)
})

test('las tareas del proyecto no declaran ruta propia', () => {
  // Cuelgan de un proyecto: la ruta la completa la pantalla con el id. Un valor fijo aca mentiria
  // sobre a donde apunta.
  assert.equal(PORTAL_TAREAS.ruta, '')
  assert.equal(PORTAL_PROYECTOS.ruta, 'portal/projects')
})
