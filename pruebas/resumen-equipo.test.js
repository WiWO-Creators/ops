/**
 * Pruebas del formateo del resumen del equipo.
 *
 * Son tres funciones puras y las tres se rompen en silencio: un total en cero convierte la
 * proporción en `NaN` y deja las barras con `width: NaN%` —que el navegador ignora, así que todas se
 * ven al 100%—, y un cronómetro de treinta segundos formateado como `0h 0m` se lee como "no hay
 * dato" cuando lo que pasó es que alguien arrancó y detuvo el medidor.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { horasYMinutos, proporcion, rutaDelResumen } from '../src/datos/resumen-equipo.ts'

test('las horas se leen de un vistazo y el tiempo corto no desaparece', () => {
  assert.equal(horasYMinutos(19800), '5h 30m')
  assert.equal(horasYMinutos(1038), '0h 17m')
  assert.equal(horasYMinutos(3600), '1h 0m')
  assert.equal(horasYMinutos(86399), '23h 59m')
  // Menos de un minuto existió: decir "0h 0m" se lee como que falta el dato.
  assert.equal(horasYMinutos(30), '<1m')
  assert.equal(horasYMinutos(59), '<1m')
  // Un día sin trabajo sí es cero, y lo dice.
  assert.equal(horasYMinutos(0), '0h 0m')
  for (const basura of [-1, NaN, Infinity]) assert.equal(horasYMinutos(basura), '0h 0m')
})

test('la proporción nunca sale de 0..100 ni devuelve NaN', () => {
  assert.equal(proporcion(19800, 19800), 100)
  assert.equal(proporcion(9900, 19800), 50)
  assert.equal(proporcion(1, 19800), 0)
  // Un día sin trabajo: barras vacías, no barras rotas.
  assert.equal(proporcion(0, 0), 0)
  assert.equal(proporcion(100, 0), 0)
  // Una parte mayor que el total —dos listas que no suman igual— se recorta en vez de desbordar.
  assert.equal(proporcion(300, 100), 100)
  for (const basura of [NaN, Infinity]) assert.equal(proporcion(basura, 100), 0)
})

test('la ruta de la API lleva el día escapado, o ninguno', () => {
  assert.equal(rutaDelResumen(), '/live/resumen-equipo')
  assert.equal(rutaDelResumen(null), '/live/resumen-equipo')
  assert.equal(rutaDelResumen(''), '/live/resumen-equipo')
  assert.equal(rutaDelResumen('2026-09-10'), '/live/resumen-equipo?dia=2026-09-10')
  // El día llega de la URL: si viene con algo raro, no puede salir de su parámetro.
  assert.equal(rutaDelResumen('2026&per_page=999'), '/live/resumen-equipo?dia=2026%26per_page%3D999')
})
