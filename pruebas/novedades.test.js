/**
 * Las novedades de Ops: que la lista escrita a mano no se rompa y que el aviso del menú acierte.
 *
 * La lista la edita cualquiera en cada merge, así que la prueba cuida lo que un descuido rompe sin
 * que nadie lo note: una fecha mal escrita, una entrada fuera de orden o un hash sin su repo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOVEDADES, ROTULO_TIPO, agruparPorDia, fechaMasReciente, hayNovedadesSinVer } from '../src/dominio/novedades.ts'

test('cada novedad tiene fecha real, tipo conocido, título y commits con su repo', () => {
  for (const novedad of NOVEDADES) {
    assert.match(novedad.fecha, /^\d{4}-\d{2}-\d{2}$/, novedad.titulo)
    assert.ok(!Number.isNaN(new Date(`${novedad.fecha}T12:00:00`).getTime()), novedad.titulo)
    assert.ok(novedad.tipo in ROTULO_TIPO, novedad.titulo)
    assert.ok(novedad.titulo.trim().length > 0)
    for (const commit of novedad.commits) assert.match(commit, /^(ops-v2|board)@[0-9a-f]{7,40}$/, novedad.titulo)
  }
})

test('la lista va de la más reciente a la más vieja', () => {
  for (let i = 1; i < NOVEDADES.length; i++) {
    assert.ok(NOVEDADES[i - 1].fecha >= NOVEDADES[i].fecha, `${NOVEDADES[i].titulo} está fuera de orden`)
  }
})

test('no se repite un título en el mismo día', () => {
  const claves = NOVEDADES.map(novedad => `${novedad.fecha}-${novedad.titulo}`)
  assert.equal(new Set(claves).size, claves.length)
})

test('agruparPorDia junta por fecha, del día más reciente al más viejo', () => {
  const lista = [
    { fecha: '2026-09-20', tipo: 'nuevo', titulo: 'a', commits: [] },
    { fecha: '2026-09-22', tipo: 'mejora', titulo: 'b', commits: [] },
    { fecha: '2026-09-20', tipo: 'arreglo', titulo: 'c', commits: [] }
  ]

  const dias = agruparPorDia(lista)

  assert.deepEqual(dias.map(dia => dia.fecha), ['2026-09-22', '2026-09-20'])
  assert.deepEqual(dias[1].novedades.map(novedad => novedad.titulo), ['a', 'c'])
  assert.deepEqual(agruparPorDia([]), [])
})

test('fechaMasReciente devuelve null sin novedades', () => {
  assert.equal(fechaMasReciente([]), null)
  assert.equal(fechaMasReciente(NOVEDADES), NOVEDADES[0].fecha)
})

test('hayNovedadesSinVer avisa solo cuando hay algo posterior a lo visto', () => {
  assert.equal(hayNovedadesSinVer(null, '2026-09-24'), true)
  assert.equal(hayNovedadesSinVer('2026-09-23', '2026-09-24'), true)
  assert.equal(hayNovedadesSinVer('2026-09-24', '2026-09-24'), false)
  assert.equal(hayNovedadesSinVer('2026-09-24', null), false)
  assert.equal(hayNovedadesSinVer(null, null), false)
  assert.equal(hayNovedadesSinVer('basura', '2026-09-24'), true)
})
