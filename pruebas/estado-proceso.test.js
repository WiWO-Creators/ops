/**
 * Pruebas de la regla que elige con que accion de la API se cambia el estado de un Proceso.
 *
 * Lo que se rompe en silencio aca es elegir mal la accion: la API no devuelve error, guarda el
 * estado y se saltea la cascada —cronometros abiertos que quedan corriendo, `datefinished` viejo en
 * una tarea reabierta, feed del proyecto sin la fila—. Por eso la decision se prueba y no se confia
 * a que quien la escriba se acuerde.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionDeEstado, leerArranque } from '../src/componentes/proyecto/estado-proceso.ts'

test('completar va por `mark-complete` y sin cuerpo', () => {
  assert.deepEqual(accionDeEstado(42, 5), {
    ruta: 'tasks/42/actions/mark-complete',
    cuerpo: undefined
  })
})

test('cualquier otro estado va por `reopen` con el destino en el cuerpo', () => {
  assert.deepEqual(accionDeEstado(42, 4), {
    ruta: 'tasks/42/actions/reopen',
    cuerpo: { status: 4 }
  })
})

test('Standby (10) y Cancelada (11) van por `reopen` con el destino en el cuerpo', () => {
  assert.deepEqual(accionDeEstado(42, 10), { ruta: 'tasks/42/actions/reopen', cuerpo: { status: 10 } })
  assert.deepEqual(accionDeEstado(42, 11), { ruta: 'tasks/42/actions/reopen', cuerpo: { status: 11 } })
})

test('un estado que no esta en las constantes del panel viaja igual', () => {
  // "Cambios" (6) lo agrego alguien desde Perfex: el catalogo es un dato, no una lista en el codigo.
  assert.deepEqual(accionDeEstado(7, 6), {
    ruta: 'tasks/7/actions/reopen',
    cuerpo: { status: 6 }
  })
})

test('un id o un estado inutilizable no produce peticion', () => {
  assert.equal(accionDeEstado(Number.NaN, 4), null)
  assert.equal(accionDeEstado(0, 4), null)
  assert.equal(accionDeEstado(-3, 4), null)
  assert.equal(accionDeEstado(1.5, 4), null)
  assert.equal(accionDeEstado(42, Number.NaN), null)
  assert.equal(accionDeEstado(42, 0), null)
})

test('leerArranque entiende el `meta.timer` de la API', () => {
  assert.deepEqual(
    leerArranque({ timer: { started: true, code: 'iniciado', message: null } }),
    { started: true, code: 'iniciado', message: null }
  )
  assert.deepEqual(
    leerArranque({ timer: { started: false, code: 'sin_jornada', message: 'Abre tu jornada.' } }),
    { started: false, code: 'sin_jornada', message: 'Abre tu jornada.' }
  )
})

test('leerArranque devuelve null cuando no hay arranque que contar o viene mal formado', () => {
  for (const meta of [undefined, null, {}, 'texto', { timer: null }, { timer: 'x' }, { timer: { started: 'si', code: 'x' } }, { timer: { started: true } }]) {
    assert.equal(leerArranque(meta), null, JSON.stringify(meta))
  }
})

test('leerArranque ignora un mensaje vacio o que no es texto', () => {
  assert.equal(leerArranque({ timer: { started: false, code: 'x', message: '  ' } }).message, null)
  assert.equal(leerArranque({ timer: { started: false, code: 'x', message: 5 } }).message, null)
})
