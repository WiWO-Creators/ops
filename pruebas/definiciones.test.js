/**
 * Coherencia de las definiciones de recurso.
 *
 * Cada modulo nuevo agrega una definicion, y los errores tipicos no los atrapa TypeScript: un
 * `ordenPorDefecto` que no esta entre los ordenables, un `incluirSiempre` fuera de los includes, una
 * columna que declara `ordenPor` con un campo que el backend no acepta. Los tres producen un `422` en
 * la primera carga de la pantalla — es decir, una tabla que no abre.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROCESOS } from '../src/definiciones/procesos.ts'
import { ESPACIOS } from '../src/definiciones/espacios.ts'
import { CLIENTES } from '../src/definiciones/clientes.ts'
import { EQUIPO } from '../src/definiciones/equipo.ts'

const TODAS = [
  ['PROCESOS', PROCESOS],
  ['ESPACIOS', ESPACIOS],
  ['CLIENTES', CLIENTES],
  ['EQUIPO', EQUIPO]
]

function sinSigno (campo) {
  return campo.startsWith('-') ? campo.slice(1) : campo
}

for (const [nombre, definicion] of TODAS) {
  test(`${nombre}: el orden por defecto esta entre los ordenables`, () => {
    assert.ok(
      definicion.ordenables.includes(sinSigno(definicion.ordenPorDefecto)),
      `${definicion.ordenPorDefecto} no esta en ordenables`
    )
  })

  test(`${nombre}: toda columna ordenable apunta a un campo que el backend acepta`, () => {
    for (const columna of definicion.columnas) {
      if (columna.ordenPor === undefined) continue

      assert.ok(
        definicion.ordenables.includes(columna.ordenPor),
        `la columna ${columna.clave} ordena por ${columna.ordenPor}, que no esta en ordenables`
      )
    }
  })

  test(`${nombre}: incluirSiempre es un subconjunto de includes`, () => {
    for (const incluir of definicion.incluirSiempre ?? []) {
      assert.ok(definicion.includes.includes(incluir), `${incluir} no esta en includes`)
    }
  })

  test(`${nombre}: las claves de columna no se repiten`, () => {
    const claves = definicion.columnas.map((c) => c.clave)

    assert.equal(new Set(claves).size, claves.length)
  })

  test(`${nombre}: las claves de filtro no se repiten`, () => {
    const claves = definicion.filtros.map((f) => f.clave)

    assert.equal(new Set(claves).size, claves.length)
  })

  test(`${nombre}: no quedan columnas visibles en cero`, () => {
    assert.ok(definicion.columnas.some((c) => c.ocultaPorDefecto !== true))
  })

  test(`${nombre}: toda accion apunta a una ruta con :id`, () => {
    for (const accion of definicion.acciones ?? []) {
      assert.match(accion.ruta, /:id/, `${accion.clave} no tiene :id en su ruta`)
    }
  })
}

test('PROCESOS declara tablero, y su ruta de mover cuelga del recurso', () => {
  assert.ok(PROCESOS.tablero)
  assert.equal(PROCESOS.tablero.columnasDesde, 'task_statuses')
  assert.ok(PROCESOS.tablero.rutaMover.startsWith(PROCESOS.ruta))
})

test('PROCESOS no ofrece cambiar el estado por PATCH: es una accion', () => {
  // El backend rechaza `status` en el PATCH con 422 no_editable, porque cambiarlo arrastra cascadas.
  const claves = PROCESOS.acciones.map((a) => a.clave)

  assert.ok(claves.includes('completar'))
  assert.ok(claves.includes('reabrir'))
})
