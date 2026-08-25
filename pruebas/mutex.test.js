/**
 * Pruebas de la deduplicacion por clave.
 *
 * Es la pieza que impide que dos peticiones vencidas canjeen el mismo token de refresco. La API
 * revoca TODAS las sesiones del staff cuando ve un refresco reusado, asi que un fallo aca no se ve
 * como lentitud: se ve como gente expulsada de todas sus pestañas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unaVezPorClave } from '../src/datos/mutex.ts'

/** Promesa que se resuelve cuando el test lo decide. */
function diferida () {
  let resolver
  let rechazar
  const promesa = new Promise((res, rej) => { resolver = res; rechazar = rej })

  return { promesa, resolver, rechazar }
}

test('cinco llamadas concurrentes con la misma clave ejecutan la operacion una sola vez', async () => {
  const enVuelo = new Map()
  const control = diferida()
  let ejecuciones = 0

  const operacion = async () => {
    ejecuciones += 1

    return await control.promesa
  }

  const todas = Promise.all(
    Array.from({ length: 5 }, async () => await unaVezPorClave(enVuelo, 'ref-1', operacion))
  )

  control.resolver('nuevo')

  assert.deepEqual(await todas, ['nuevo', 'nuevo', 'nuevo', 'nuevo', 'nuevo'])
  assert.equal(ejecuciones, 1)
})

test('claves distintas no se comparten', async () => {
  const enVuelo = new Map()
  let ejecuciones = 0

  const operacion = async () => {
    ejecuciones += 1

    return ejecuciones
  }

  await Promise.all([
    unaVezPorClave(enVuelo, 'a', operacion),
    unaVezPorClave(enVuelo, 'b', operacion)
  ])

  assert.equal(ejecuciones, 2)
})

test('la clave se libera al terminar: una llamada posterior vuelve a ejecutar', async () => {
  const enVuelo = new Map()
  let ejecuciones = 0

  const operacion = async () => {
    ejecuciones += 1

    return ejecuciones
  }

  assert.equal(await unaVezPorClave(enVuelo, 'a', operacion), 1)
  assert.equal(await unaVezPorClave(enVuelo, 'a', operacion), 2)
  assert.equal(enVuelo.size, 0)
})

test('un fallo no deja la clave envenenada, y todos los concurrentes reciben el error', async () => {
  const enVuelo = new Map()
  const control = diferida()

  const fallando = async () => await control.promesa

  const primera = unaVezPorClave(enVuelo, 'a', fallando)
  const segunda = unaVezPorClave(enVuelo, 'a', fallando)

  control.rechazar(new Error('refresco revocado'))

  await assert.rejects(primera, /refresco revocado/)
  await assert.rejects(segunda, /refresco revocado/)
  assert.equal(enVuelo.size, 0)

  assert.equal(await unaVezPorClave(enVuelo, 'a', async () => 'sirve'), 'sirve')
})
