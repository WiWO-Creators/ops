/**
 * Pruebas de la politica de incidentes: que se registra y que no.
 *
 * Lo que se cuida es el equilibrio en las dos direcciones. Registrar de mas llena Incidentes de
 * respuestas que la pantalla ya explica y entierra los errores reales; registrar de menos esconde un
 * desajuste entre el panel y la API, que nadie mas va a notar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  debeReportarse, esErrorDeChunk, esRespuestaEsperada, esRuidoDelNavegador
} from '../src/lib/politica-incidentes.ts'
import {
  CLAVE_RECARGA_POR_DESPLIEGUE, reservarRecarga, VENTANA_DE_RECARGA_MS
} from '../src/lib/recarga-por-despliegue.ts'
import { capacidadesDeEspacios } from '../src/dominio/permisos.ts'

test('un 403 es un desenlace previsto: la pantalla ya dice que falta el permiso', () => {
  assert.equal(esRespuestaEsperada(403, 'Sólo un administrador puede eliminar proyectos.'), true)
  assert.equal(esRespuestaEsperada(403, ''), true)
})

test('un 404 de un registro inexistente no se registra', () => {
  assert.equal(esRespuestaEsperada(404, 'No existe esa tarea.'), true)
  assert.equal(esRespuestaEsperada(404, 'No existe ese proceso.'), true)
  assert.equal(esRespuestaEsperada(404, 'No hay ningún cronómetro en marcha para esta tarea.'), true)
})

test('un 404 de ruta desconocida si se registra: el panel pide algo que la API no tiene', () => {
  assert.equal(esRespuestaEsperada(404, 'Recurso desconocido.'), false)
  assert.equal(esRespuestaEsperada(404, 'Subrecurso desconocido.'), false)
  assert.equal(esRespuestaEsperada(404, ''), false)
})

test('un 400 y todo 5xx se siguen registrando', () => {
  assert.equal(esRespuestaEsperada(400, 'Petición mal formada.'), false)
  assert.equal(esRespuestaEsperada(500, 'Error interno.'), false)
  assert.equal(esRespuestaEsperada(502, 'No existe esa tarea.'), false)
})

test('la politica tambien entiende el formato de texto con que el BFF guarda la respuesta', () => {
  assert.equal(debeReportarse({ tipo: 'RespuestaDeApi', mensaje: '403 forbidden: Sólo un administrador puede eliminar proyectos.' }), false)
  assert.equal(debeReportarse({ tipo: 'RespuestaDeApi', mensaje: '404 not_found: No existe esa tarea.' }), false)
  assert.equal(debeReportarse({ tipo: 'RespuestaDeApi', mensaje: '404 not_found: Recurso desconocido.' }), true)
  assert.equal(debeReportarse({ tipo: 'RespuestaDeApi', mensaje: '400 bad_request: Falta el cuerpo.' }), true)
  assert.equal(debeReportarse({ tipo: 'RespuestaDeApi', mensaje: '503 server_error: Mantenimiento.' }), true)
})

test('un ChunkLoadError es ruido en cualquiera de sus formas', () => {
  assert.equal(esRuidoDelNavegador({ tipo: 'ChunkLoadError', mensaje: 'cualquier cosa' }), true)
  assert.equal(esRuidoDelNavegador({ tipo: 'Error', mensaje: 'Loading chunk 123 failed.' }), true)
  assert.equal(esRuidoDelNavegador({ tipo: 'Error', mensaje: 'Loading CSS chunk app-layout failed.' }), true)
  assert.equal(esRuidoDelNavegador({ tipo: 'ChunkLoadError', mensaje: 'Failed to load chunk /_next/static/chunks/a.js' }), true)
  assert.equal(esErrorDeChunk({ tipo: 'TypeError', mensaje: 'Failed to fetch dynamically imported module: https://x/a.js' }), true)
})

test('un TypeError de red es ruido, pero el mismo texto en otra clase de error no', () => {
  for (const mensaje of ['network error', 'Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
    assert.equal(esRuidoDelNavegador({ tipo: 'TypeError', mensaje }), true, mensaje)
  }

  assert.equal(esRuidoDelNavegador({ tipo: 'Error', mensaje: 'Failed to fetch' }), false)
  assert.equal(esRuidoDelNavegador({ tipo: 'TypeError', mensaje: "Cannot read properties of undefined (reading 'id')" }), false)
})

test('las transiciones de vista saltadas o duplicadas son ruido', () => {
  const mensajes = [
    'Skipped ViewTransition due to another transition starting',
    'Multiple elements found with view-transition-name: seccion-activa',
    'Transition was aborted because of invalid state',
    'View transition was skipped because document visibility state is hidden'
  ]

  for (const mensaje of mensajes) {
    assert.equal(esRuidoDelNavegador({ tipo: 'InvalidStateError', mensaje }), true, mensaje)
  }
})

test('un error de JavaScript de verdad se sigue registrando', () => {
  assert.equal(debeReportarse({ tipo: 'TypeError', mensaje: "Cannot read properties of undefined (reading 'nombre')" }), true)
  assert.equal(debeReportarse({ tipo: 'PantallaCaida', mensaje: 'digest 123 · Algo se rompio' }), true)
})

function almacenFalso (inicial = {}) {
  const datos = new Map(Object.entries(inicial))

  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => { datos.set(clave, String(valor)) }
  }
}

test('la recarga por chunk viejo ocurre una sola vez', () => {
  const almacen = almacenFalso()

  assert.equal(reservarRecarga(almacen, 1_000_000), true)
  assert.equal(almacen.datos.get(CLAVE_RECARGA_POR_DESPLIEGUE), '1000000')
  assert.equal(reservarRecarga(almacen, 1_000_000 + 5_000), false)
})

test('pasada la ventana un deploy nuevo puede volver a recargar', () => {
  const almacen = almacenFalso({ [CLAVE_RECARGA_POR_DESPLIEGUE]: '1000000' })

  assert.equal(reservarRecarga(almacen, 1_000_000 + VENTANA_DE_RECARGA_MS + 1), true)
})

test('sin almacenamiento utilizable no se recarga: seria un bucle sin guardia', () => {
  assert.equal(reservarRecarga(null, 1), false)

  const roto = {
    getItem: () => { throw new Error('bloqueado') },
    setItem: () => { throw new Error('bloqueado') }
  }

  assert.equal(reservarRecarga(roto, 1), false)

  const soloLectura = { getItem: () => null, setItem: () => { throw new Error('cuota') } }

  assert.equal(reservarRecarga(soloLectura, 1), false)
})

test('quien no es administrador no ve eliminar Espacios, pero conserva el resto', () => {
  const permissions = { projects: ['view', 'create', 'edit', 'delete'], tasks: ['delete'], customers: [], staff: [], leads: [] }

  assert.deepEqual(
    capacidadesDeEspacios({ permissions, is_admin: false, is_superadmin: false }),
    ['view', 'create', 'edit']
  )
  assert.deepEqual(capacidadesDeEspacios({ permissions, is_admin: true, is_superadmin: false }), permissions.projects)
  assert.deepEqual(capacidadesDeEspacios({ permissions, is_admin: false, is_superadmin: true }), permissions.projects)
})
