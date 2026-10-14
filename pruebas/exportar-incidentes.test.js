/**
 * Pruebas del texto que exporta `/administracion/incidentes/exportar`.
 *
 * Lo que se cuida: que los repetidos se agrupen (el que más se repite primero), que cada grupo lleve
 * su traza, que el encabezado diga si el reporte cubre todos los incidentes o solo los recientes, y
 * que una lista vacía no produzca un reporte vacío sin explicación.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparIncidentes, textoDeExportacion } from '../src/dominio/exportar-incidentes.ts'

/** Un incidente de la API con lo mínimo; `cambios` pisa lo que la prueba necesite distinto. */
function incidente (codigo, cambios = {}) {
  return {
    incidente: codigo,
    origen: 'api',
    tipo: 'mysqli_sql_exception',
    mensaje: "Table 'board.m' doesn't exist",
    archivo: '/board/system/database/drivers/mysqli/mysqli_driver.php',
    linea: 307,
    metodo: 'GET',
    uri: '/api/v1/tasks/5067',
    sujeto_tipo: null,
    sujeto_id: null,
    sujeto_nombre: null,
    creado_en: '2026-10-14 12:00:00',
    ...cambios
  }
}

test('agrupa los repetidos y ordena por cantidad', () => {
  const grupos = agruparIncidentes([
    incidente('aaaaaaa1', { mensaje: 'Otro error', linea: 10 }),
    incidente('aaaaaaa2'),
    incidente('aaaaaaa3')
  ])

  assert.equal(grupos.length, 2)
  assert.deepEqual(grupos[0].filas.map((fila) => fila.incidente), ['aaaaaaa2', 'aaaaaaa3'])
})

test('el texto incluye conteo, peticiones distintas y la traza del representativo', () => {
  const grupos = agruparIncidentes([
    incidente('aaaaaaa2', { uri: '/api/v1/tasks/1' }),
    incidente('aaaaaaa3', { uri: '/api/v1/tasks/1', creado_en: '2026-10-13 08:00:00' })
  ])
  const texto = textoDeExportacion(grupos, new Map([['aaaaaaa2', '#0 traza']]), 2)

  assert.match(texto, /2 en total, 1 errores distintos/)
  assert.match(texto, /— 2 veces/)
  assert.match(texto, /Peticiones: GET \/api\/v1\/tasks\/1\n/)
  assert.match(texto, /Entre: 2026-10-13 08:00:00 y 2026-10-14 12:00:00/)
  assert.match(texto, /Traza \(de aaaaaaa2\):\n#0 traza/)
})

test('avisa cuando solo cubre los más recientes y marca la traza faltante', () => {
  const texto = textoDeExportacion(agruparIncidentes([incidente('aaaaaaa2')]), new Map(), 900)

  assert.match(texto, /los 1 más recientes de 900/)
  assert.match(texto, /\(sin traza\)/)
})

test('sin incidentes dice que no hay ninguno', () => {
  assert.equal(textoDeExportacion([], new Map(), 0), 'Incidentes de WiWO Ops: no hay ninguno registrado.')
})
