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

/**
 * Las seis definiciones de venta y soporte.
 *
 * Lo que se prueba es la coherencia con las whitelists de la API: un filtro, un campo de orden o un
 * include que el backend no declara devuelve 422, y eso se ve recien en pantalla.
 */

import {
  PORTAL_CONTRATOS,
  PORTAL_FACTURAS,
  PORTAL_PRESUPUESTOS,
  PORTAL_PROPUESTAS,
  PORTAL_SUSCRIPCIONES,
  PORTAL_TICKETS
} from '../src/definiciones/portal-ventas.ts'

const SECCIONES = [
  PORTAL_FACTURAS, PORTAL_PRESUPUESTOS, PORTAL_PROPUESTAS,
  PORTAL_CONTRATOS, PORTAL_SUSCRIPCIONES, PORTAL_TICKETS
]

test('todas las secciones de venta piden bajo /portal', () => {
  // Una ruta sin el prefijo la rechazaria el BFF, que solo deja pasar `portal` y `files` para un
  // contacto.
  for (const definicion of SECCIONES) {
    assert.equal(definicion.ruta.startsWith('portal/'), true, definicion.ruta)
  }
})

test('el orden por defecto esta entre los ordenables', () => {
  // Un orden por defecto no declarado se manda igual y la API responde 422 en la primera carga.
  for (const definicion of SECCIONES) {
    const campo = definicion.ordenPorDefecto.replace(/^-/, '')

    assert.equal(definicion.ordenables.includes(campo), true, `${definicion.ruta}: ${campo}`)
  }
})

test('ningun filtro sale de un lookup que el portal no recibe', () => {
  // `/portal/lookups` es un subconjunto deliberado: pedir uno que no manda deja el filtro vacio y
  // sin explicacion.
  const DISPONIBLES = new Set([
    'invoice_statuses', 'estimate_statuses', 'proposal_statuses',
    'ticket_statuses', 'ticket_priorities', 'contract_types',
    'project_statuses', 'task_statuses', 'currencies'
  ])

  for (const definicion of SECCIONES) {
    for (const filtro of definicion.filtros) {
      if (filtro.desdeLookup === undefined) continue

      assert.equal(DISPONIBLES.has(filtro.desdeLookup), true, `${definicion.ruta}: ${filtro.desdeLookup}`)
    }
    for (const columna of definicion.columnas) {
      if (columna.comoInsignia === undefined) continue

      assert.equal(DISPONIBLES.has(columna.comoInsignia), true, `${definicion.ruta}: ${columna.comoInsignia}`)
    }
  }
})

test('ninguna seccion pide includes', () => {
  // La API del portal no declara includes: pedir uno seria un 422.
  for (const definicion of SECCIONES) {
    assert.deepEqual(definicion.includes, [])
  }
})

import { PESTANIAS_PROYECTO, PORTAL_PROYECTOS, PORTAL_TAREAS, pestaniasDelProyecto } from '../src/definiciones/portal-proyectos.ts'

test('las pestañas del proyecto salen de lo que habilito la API', () => {
  const visibles = pestaniasDelProyecto(['overview', 'tasks', 'gantt', 'invoices'])

  // `gantt` esta habilitada en la API pero el portal todavia no la construyo: se ignora en vez de
  // dibujar una pestaña que no lleva a ningun lado.
  assert.deepEqual(visibles.map((p) => p.clave), ['overview', 'tasks', 'invoices'])
})

test('el orden lo fija el producto, no el arreglo de la API', () => {
  const visibles = pestaniasDelProyecto(['tickets', 'overview', 'tasks'])

  assert.deepEqual(visibles.map((p) => p.clave), ['overview', 'tasks', 'tickets'])
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
