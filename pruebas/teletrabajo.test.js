/**
 * Quien entra a que sala de Teletrabajo.
 *
 * Es la unica barrera del modulo: LiveKit abre cualquier sala a cualquier token firmado, asi que un
 * error aca no da un 403, da una conversacion privada con alguien de mas adentro. Estas pruebas
 * cubren sobre todo lo que NO tiene que pasar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SALAS_COMUNES,
  esNombreDeSalaValido,
  espacioDeSala,
  identidadDe,
  puedeEntrar,
  salaComunPorId,
  salaDeEspacio
} from '../src/dominio/teletrabajo.ts'

test('el catalogo de salas comunes no tiene ids repetidos', () => {
  const ids = SALAS_COMUNES.map((sala) => sala.id)

  assert.equal(new Set(ids).size, ids.length)
})

test('todas las salas comunes tienen nombre de sala valido', () => {
  for (const sala of SALAS_COMUNES) {
    assert.ok(esNombreDeSalaValido(sala.id), `"${sala.id}" no es un nombre de sala valido`)
  }
})

test('el nombre de sala rechaza lo que no es minusculas, digitos y guiones', () => {
  assert.ok(esNombreDeSalaValido('general'))
  assert.ok(esNombreDeSalaValido('espacio-42'))

  assert.equal(esNombreDeSalaValido(''), false)
  assert.equal(esNombreDeSalaValido('General'), false)
  assert.equal(esNombreDeSalaValido('sala con espacios'), false)
  assert.equal(esNombreDeSalaValido('../otra'), false)
  assert.equal(esNombreDeSalaValido('sala/otra'), false)
  assert.equal(esNombreDeSalaValido('a'.repeat(65)), false)
})

test('salaDeEspacio y espacioDeSala son inversas', () => {
  assert.equal(salaDeEspacio(42), 'espacio-42')
  assert.equal(espacioDeSala('espacio-42'), 42)
})

test('salaDeEspacio rechaza ids que no son enteros positivos', () => {
  assert.equal(salaDeEspacio(0), null)
  assert.equal(salaDeEspacio(-3), null)
  assert.equal(salaDeEspacio(1.5), null)
  assert.equal(salaDeEspacio(Number.NaN), null)
})

test('espacioDeSala no acepta nombres que apuntarian dos veces a la misma sala', () => {
  // "espacio-007" y "espacio-7" volverian ambos al id 7: dos URLs, una sala, y un permiso que se
  // comprueba sobre un nombre distinto del que termina en el token.
  assert.equal(espacioDeSala('espacio-007'), null)
  assert.equal(espacioDeSala('espacio-0'), null)
  assert.equal(espacioDeSala('espacio-'), null)
  assert.equal(espacioDeSala('espacio-1a'), null)
  assert.equal(espacioDeSala('general'), null)
})

test('salaComunPorId encuentra las del catalogo y nada mas', () => {
  assert.equal(salaComunPorId('general')?.id, 'general')
  assert.equal(salaComunPorId('espacio-1'), null)
  assert.equal(salaComunPorId('inventada'), null)
})

test('cualquiera del equipo entra a una sala comun', () => {
  assert.ok(puedeEntrar('general', 183, null))
  assert.ok(puedeEntrar('cafe', 1, []))
})

test('a una sala privada solo entra quien integra el espacio', () => {
  assert.ok(puedeEntrar('espacio-7', 183, [12, 183, 44]))
  assert.equal(puedeEntrar('espacio-7', 99, [12, 183, 44]), false)
})

test('sin miembros cargados, la sala privada queda cerrada', () => {
  // Es el caso de `include=members` olvidado. Cerrado molesta; abierto es una fuga.
  assert.equal(puedeEntrar('espacio-7', 183, null), false)
  assert.equal(puedeEntrar('espacio-7', 183, []), false)
})

test('un nombre de sala invalido no entra a ningun lado', () => {
  assert.equal(puedeEntrar('../general', 183, [183]), false)
  assert.equal(puedeEntrar('', 183, [183]), false)
})

test('una sala que no es ni comun ni de espacio queda cerrada', () => {
  // Nombre valido, catalogo desconocido: sin regla que la abra, no se abre.
  assert.equal(puedeEntrar('sala-inventada', 183, [183]), false)
})

test('un staffId invalido no entra ni a las salas comunes', () => {
  assert.equal(puedeEntrar('general', 0, null), false)
  assert.equal(puedeEntrar('general', -1, null), false)
  assert.equal(puedeEntrar('general', 1.5, null), false)
  assert.equal(puedeEntrar('general', Number.NaN, null), false)
})

test('la identidad separa dos conexiones de la misma persona', () => {
  // Si coincidieran, LiveKit expulsaria la primera pestaña al abrir la segunda.
  assert.notEqual(identidadDe(183, 'a1b2c3d4'), identidadDe(183, 'e5f6a7b8'))
  assert.ok(identidadDe(183, 'a1b2c3d4').includes('183'))
})
