/**
 * Pruebas de las reglas puras del rastreo de uso del portal.
 *
 * Lo que importa: que nunca salga texto libre (la API rechaza el lote entero), que el tiempo no
 * cuente la pestaña oculta y que la cola respete el tope de la API.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ColaDeEventos,
  COLA_MAXIMA,
  Cronometro,
  LOTE_MAXIMO,
  SESION_CADUCA_MS,
  claveDeEnlace,
  claveDeRotulo,
  eventoDeClick,
  eventoDePestana,
  eventoDeVista,
  objetoDeRuta,
  rutaDeRastreo,
  sesionVigente
} from '../src/dominio/rastreo-portal.ts'

test('solo acepta rutas del portal en minusculas, sin query ni hash', () => {
  assert.equal(rutaDeRastreo('/portal'), '/portal')
  assert.equal(rutaDeRastreo('/portal/proyectos/12/'), '/portal/proyectos/12')
  assert.equal(rutaDeRastreo('/Portal/Proyectos'), '/portal/proyectos')
  assert.equal(rutaDeRastreo('/portal/proyectos?q=sueldos'), null)
  assert.equal(rutaDeRastreo('/portal/proyectos#tab'), null)
  assert.equal(rutaDeRastreo('/clientes/1'), null)
  assert.equal(rutaDeRastreo('/portal/../etc'), null)
  assert.equal(rutaDeRastreo('/portal/' + 'a'.repeat(300)), null)
})

test('el rotulo de un boton se vuelve clave sin acentos ni signos', () => {
  assert.equal(claveDeRotulo('Cerrar sesión'), 'boton.cerrar-sesion')
  assert.equal(claveDeRotulo('  ¡Aprobar!  '), 'boton.aprobar')
  assert.equal(claveDeRotulo('???'), null)
  assert.equal(claveDeRotulo('Borrar el preset Ventas 2026'), null)
  assert.equal(claveDeRotulo('Ficha de una persona con nombre largo'), null)
  assert.equal(claveDeRotulo(null), null)
  assert.ok((claveDeRotulo('x'.repeat(200)) ?? '').length <= 64)
})

test('un enlace colapsa los ids y conserva el objeto', () => {
  assert.deepEqual(claveDeEnlace('/portal/proyectos/12'), { clave: 'enlace.proyectos.id', objeto: 12 })
  assert.deepEqual(claveDeEnlace('/portal/soporte'), { clave: 'enlace.soporte' })
  assert.deepEqual(claveDeEnlace('/portal'), { clave: 'enlace.inicio' })
  assert.equal(claveDeEnlace('/otra/cosa'), null)
})

test('el objeto de una ruta es su ultimo segmento numerico', () => {
  assert.equal(objetoDeRuta('/portal/soporte/7'), 7)
  assert.equal(objetoDeRuta('/portal/proyectos'), undefined)
  assert.equal(objetoDeRuta('/portal/soporte/99999999999'), undefined)
})

test('los eventos invalidos no se arman', () => {
  assert.equal(eventoDeVista('/portal/proyectos?x=1', 10), null)
  assert.equal(eventoDePestana('/portal/proyectos/3', 'Gantt!', 10), null)
  assert.equal(eventoDeClick('/portal', 'Guardar cambios'), null)
  assert.deepEqual(eventoDeVista('/portal/proyectos/3', 4200), {
    type: 'vista', route: '/portal/proyectos/3', duration_ms: 4200, object_id: 3
  })
  assert.deepEqual(eventoDePestana('/portal/proyectos/3', 'gantt', 900), {
    type: 'pestana', route: '/portal/proyectos/3', tab: 'gantt', duration_ms: 900, object_id: 3
  })
  assert.deepEqual(eventoDeClick('/portal', 'tablero.aprobar', 55), {
    type: 'click', route: '/portal', target: 'tablero.aprobar', object_id: 55
  })
})

test('el cronometro no cuenta lo que esta en pausa', () => {
  const c = new Cronometro(1000)

  c.pausar(3000)
  assert.equal(c.total(9000), 2000)

  c.reanudar(10_000)
  assert.equal(c.total(10_500), 2500)

  c.pausar(11_000)
  c.pausar(12_000)
  assert.equal(c.total(20_000), 3000)
})

test('la cola reparte en lotes del tamaño de la API y acota su tamaño', () => {
  const cola = new ColaDeEventos()
  const evento = eventoDeClick('/portal', 'a.b')

  for (let i = 0; i < LOTE_MAXIMO + 5; i++) cola.agregar(evento)

  assert.ok(cola.llena)
  const lotes = cola.vaciar()
  assert.deepEqual(lotes.map((l) => l.length), [LOTE_MAXIMO, 5])
  assert.equal(cola.pendientes, 0)

  cola.devolver(lotes[0])
  assert.equal(cola.pendientes, LOTE_MAXIMO)

  for (let i = 0; i < COLA_MAXIMA * 2; i++) cola.agregar(evento)
  assert.equal(cola.pendientes, COLA_MAXIMA)
})

test('la sesion se renueva solo tras 30 minutos de silencio', () => {
  let n = 0
  const nuevo = () => `s${++n}`

  assert.deepEqual(sesionVigente(null, 100, nuevo), { id: 's1', ultimo: 100 })
  assert.deepEqual(sesionVigente({ id: 's1', ultimo: 100 }, 100 + SESION_CADUCA_MS, nuevo), { id: 's1', ultimo: 100 + SESION_CADUCA_MS })
  assert.equal(sesionVigente({ id: 's1', ultimo: 100 }, 101 + SESION_CADUCA_MS, nuevo).id, 's2')
})
