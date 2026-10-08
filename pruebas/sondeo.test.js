/**
 * Las consultas periodicas no se apilan.
 *
 * Con la red lenta una consulta tarda mas que el intervalo: lo que se prueba es que nunca hay dos en
 * vuelo, que el tic periodico se descarta, y que un aviso real (una accion propia) no se pierde.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sondeoSinApilar } from '../src/datos/sondeo.ts'

/** Una consulta que se resuelve a mano, para controlar cuanto tarda. */
function consultaManual () {
  const estado = { llamadas: 0, enVuelo: 0, maximo: 0, resolver: [] }
  const consulta = async () => {
    estado.llamadas++
    estado.enVuelo++
    estado.maximo = Math.max(estado.maximo, estado.enVuelo)
    await new Promise((resolver) => estado.resolver.push(resolver))
    estado.enVuelo--
  }

  return { estado, consulta }
}

/** Deja correr las microtareas pendientes. */
async function asentar () {
  await new Promise((resolver) => setImmediate(resolver))
}

test('un tic periodico no se apila sobre una consulta en vuelo', async () => {
  const { estado, consulta } = consultaManual()
  const lanzar = sondeoSinApilar(consulta)

  lanzar(true)
  lanzar(true)
  lanzar(true)
  assert.equal(estado.llamadas, 1)

  estado.resolver.shift()()
  await asentar()
  assert.equal(estado.llamadas, 1, 'los tics descartados no se repiten')
})

test('un aviso real durante la consulta se atiende al terminar, una sola vez', async () => {
  const { estado, consulta } = consultaManual()
  const lanzar = sondeoSinApilar(consulta)

  lanzar(true)
  lanzar(false)
  lanzar(false)
  assert.equal(estado.llamadas, 1)

  estado.resolver.shift()()
  await asentar()
  assert.equal(estado.llamadas, 2)

  estado.resolver.shift()()
  await asentar()
  assert.equal(estado.llamadas, 2)
  assert.equal(estado.maximo, 1, 'nunca hubo dos en vuelo')
})

test('una consulta que lanza no deja el sondeo trabado', async () => {
  let llamadas = 0
  const lanzar = sondeoSinApilar(async () => {
    llamadas++
    throw new Error('red caida')
  })

  lanzar()
  await asentar()
  lanzar()
  await asentar()
  assert.equal(llamadas, 2)
})
