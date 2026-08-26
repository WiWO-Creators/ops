/**
 * Pruebas de la navegacion del portal del cliente.
 *
 * Lo que se prueba es la decision de que ve cada contacto. Un contacto sin permiso de facturas que
 * ve el enlace a facturas no rompe nada —la API responde 403— pero le muestra una puerta cerrada y
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
  const secciones = seccionesDelPortal(['kb', 'projects', 'invoices'])

  assert.deepEqual(secciones.map((s) => s.clave), ['projects', 'invoices', 'kb'])
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
