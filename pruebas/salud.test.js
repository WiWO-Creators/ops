/**
 * Pruebas del chequeo de salud (`GET /api/salud`): que un monitor externo vea caida la API o una
 * configuracion rota del BFF, y que el detalle no salga sin el token.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comprobarApi, comprobarBff, comprobarSalud, resumenPublico, tokenValido } from '../src/datos/salud.ts'

const CLAVE = 'a'.repeat(64)

/** `fetch` de mentira que responde con el estado y el cuerpo dados, y recuerda la peticion. */
function respuesta (estado, cuerpo) {
  const llamadas = []
  const consultar = async (url, opciones) => {
    llamadas.push({ url, opciones })

    return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado })
  }

  return { consultar, llamadas }
}

test('el BFF esta bien con API_BASE y una clave de sesion de 32 bytes en hexadecimal', () => {
  assert.deepEqual(comprobarBff('http://api/v1', CLAVE), { ok: true })
})

test('al BFF le falla la configuracion: sin API_BASE o con la clave mal formada', () => {
  assert.deepEqual(comprobarBff(null, CLAVE), { ok: false, motivo: 'falta_api_base' })
  assert.deepEqual(comprobarBff('  ', CLAVE), { ok: false, motivo: 'falta_api_base' })
  assert.equal(comprobarBff('http://api/v1', undefined).motivo, 'sesion_clave_invalida')
  assert.equal(comprobarBff('http://api/v1', 'corta').motivo, 'sesion_clave_invalida')
})

test('la API sana: 200 con data.ok verdadero', async () => {
  const { consultar, llamadas } = respuesta(200, { data: { ok: true } })
  const api = await comprobarApi({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar })

  assert.equal(api.ok, true)
  assert.equal(llamadas[0].url, 'http://api/v1/health')
  assert.equal(llamadas[0].opciones.headers['x-salud-token'], undefined)
})

test('la API degradada (503) cuenta como caida y conserva su detalle', async () => {
  const { consultar } = respuesta(503, { data: { ok: false, componentes: { uploads: { ok: false } } } })
  const api = await comprobarApi({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar })

  assert.equal(api.ok, false)
  assert.equal(api.motivo, 'api_respondio_503')
  assert.equal(api.detalle.componentes.uploads.ok, false)
})

test('un 200 sin data.ok verdadero o con un cuerpo que no es JSON tambien es caida', async () => {
  for (const cuerpo of [{ data: { ok: false } }, {}, '<html>proxy</html>']) {
    const { consultar } = respuesta(200, cuerpo)
    const api = await comprobarApi({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar })

    assert.equal(api.ok, false, JSON.stringify(cuerpo))
  }
})

test('la API inalcanzable o que no responde a tiempo', async () => {
  const caida = async () => { throw new TypeError('fetch failed') }
  const lenta = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }

  assert.equal((await comprobarApi({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar: caida })).motivo, 'api_inalcanzable')
  assert.equal((await comprobarApi({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar: lenta })).motivo, 'api_tiempo_agotado')
})

test('sin API_BASE no se intenta ninguna peticion', async () => {
  const { consultar, llamadas } = respuesta(200, { data: { ok: true } })
  const api = await comprobarApi({ baseApi: null, claveSesion: CLAVE, token: null, consultar })

  assert.equal(api.ok, false)
  assert.equal(llamadas.length, 0)
})

test('con token valido se reenvia a la API', async () => {
  const { consultar, llamadas } = respuesta(200, { data: { ok: true } })
  await comprobarApi({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: 'secreto', consultar })

  assert.equal(llamadas[0].opciones.headers['x-salud-token'], 'secreto')
})

test('el resultado general es ok solo si los dos componentes lo estan', async () => {
  const sana = respuesta(200, { data: { ok: true } })
  const caida = respuesta(503, { data: { ok: false } })

  assert.equal((await comprobarSalud({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar: sana.consultar })).ok, true)
  assert.equal((await comprobarSalud({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar: caida.consultar })).ok, false)
  assert.equal((await comprobarSalud({ baseApi: 'http://api/v1', claveSesion: 'mala', token: null, consultar: sana.consultar })).ok, false)
})

test('el resumen publico no filtra motivos, tiempos ni detalle', async () => {
  const { consultar } = respuesta(503, { data: { ok: false, php: '8.3.0', componentes: {} } })
  const publico = resumenPublico(await comprobarSalud({ baseApi: 'http://api/v1', claveSesion: CLAVE, token: null, consultar }))

  assert.deepEqual(publico, { ok: false, status: 'degradado', componentes: { bff: { ok: true }, api: { ok: false } } })
  assert.equal(JSON.stringify(publico).includes('8.3.0'), false)
})

test('el token del detalle: ausente, incorrecto y correcto', () => {
  const iguales = (a, b) => a === b

  assert.equal(tokenValido('x', undefined, iguales), false)
  assert.equal(tokenValido('x', '  ', iguales), false)
  assert.equal(tokenValido(null, 'secreto', iguales), false)
  assert.equal(tokenValido('otro', 'secreto', iguales), false)
  assert.equal(tokenValido('secreto', 'secreto', iguales), true)
})
