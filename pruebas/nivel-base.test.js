/**
 * Pruebas del escalón de la escalera de permisos.
 *
 * Lo que se protege son dos cosas que, si se rompen, degradan gente en silencio:
 *
 *   1. Que **heredar no sea `usuario`**. Sin fila en `tblwiwo_nivel_persona` el escalón lo decide el
 *      rol, que en esta base da `head` o `gerente` a Director y Gerencia. Traducir "el que dé su rol"
 *      a `usuario` en vez de a `null` les sacaría la lectura global a 24 personas.
 *   2. Que el selector **no ofrezca `admin` ni `superadmin`**. La API los rechaza con 422 por esta
 *      puerta: los dos salen de las banderas de Perfex, y escribirlos acá otorgaría el piso pero
 *      ninguna de las pantallas que preguntan por la columna.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HEREDADO,
  NIVELES_BASE,
  etiquetaDeNivel,
  loTapaLaBandera,
  nivelDelValor,
  valorDelNivel
} from '../src/componentes/equipo/nivelBase.ts'

test('heredar el escalón del rol manda null, no "usuario"', () => {
  assert.equal(nivelDelValor(HEREDADO), null)
  assert.equal(valorDelNivel(null), HEREDADO)
})

test('un escalón puesto a mano va y vuelve igual', () => {
  for (const opcion of NIVELES_BASE) {
    assert.equal(nivelDelValor(valorDelNivel(opcion.valor)), opcion.valor)
  }
})

test('el selector ofrece los cinco de abajo y ninguno más', () => {
  assert.deepEqual(
    NIVELES_BASE.map((opcion) => opcion.valor),
    ['usuario', 'focal', 'lider', 'head', 'gerente']
  )
})

test('el centinela de heredado no es la cadena vacía', () => {
  // Radix Select lanza con `value=""`: reserva ese valor para "nada elegido".
  assert.notEqual(HEREDADO, '')
  assert.equal(NIVELES_BASE.some((opcion) => opcion.valor === HEREDADO), false)
})

test('los siete escalones tienen nombre, incluidos los dos que esta puerta no escribe', () => {
  assert.equal(etiquetaDeNivel('usuario'), 'Usuario')
  assert.equal(etiquetaDeNivel('focal'), 'Focal')
  assert.equal(etiquetaDeNivel('lider'), 'Líder')
  assert.equal(etiquetaDeNivel('head'), 'Head')
  assert.equal(etiquetaDeNivel('gerente'), 'Gerencia')
  assert.equal(etiquetaDeNivel('admin'), 'Administrador')
  assert.equal(etiquetaDeNivel('superadmin'), 'Superadministrador')
})

test('las banderas de Perfex tapan el escalón, y solo ellas', () => {
  assert.equal(loTapaLaBandera('admin'), true)
  assert.equal(loTapaLaBandera('superadmin'), true)

  for (const opcion of NIVELES_BASE) {
    assert.equal(loTapaLaBandera(opcion.valor), false, opcion.valor)
  }
})
