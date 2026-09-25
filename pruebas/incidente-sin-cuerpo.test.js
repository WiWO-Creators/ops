/**
 * Pruebas del registro, desde el navegador, de los errores del servidor que el BFF nunca vio.
 *
 * El caso que las origino: un Meeting Paper que falla con el `502` en HTML que arma Apache delante
 * de Next. La persona veia «El servidor respondió 502» y en Incidentes no quedaba ninguna fila. Lo
 * que se cuida:
 *
 *  1. Que ese HTML produzca un reporte a `/api/incidentes` y un aviso con el codigo devuelto.
 *  2. Que un envelope que ya trae `details.incidente` no se registre dos veces.
 *  3. Que los `4xx` no se registren: son desenlaces que la pantalla explica.
 *  4. Que un reporte que falla no rompa nada: el mensaje generico sale igual.
 */

import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeDeRespuesta } from '../src/datos/cliente.ts'
import { leerError } from '../src/datos/errores.ts'
import { EVENTO_ERROR } from '../src/lib/aviso-de-error.ts'

const HTML_502 = '<!DOCTYPE HTML><html><head><title>502 Proxy Error</title></head><body><h1>Proxy Error</h1></body></html>'

let reportes
let avisos
let fetchOriginal

/**
 * Instala un `window` y un `fetch` falsos: el de `/api/incidentes` contesta lo que diga `responder`.
 *
 * @param responder funcion que arma la respuesta del reporte, o lanza para simular la red caida
 */
function simularNavegador (responder) {
  globalThis.window = {
    location: { pathname: '/proyectos/7', search: '' },
    dispatchEvent: (evento) => { if (evento.type === EVENTO_ERROR) avisos.push(evento.detail) }
  }
  globalThis.fetch = async (url, opciones) => {
    reportes.push({ url, cuerpo: JSON.parse(opciones.body) })
    return responder()
  }
}

beforeEach(() => {
  reportes = []
  avisos = []
  fetchOriginal = globalThis.fetch
  simularNavegador(() => Response.json({ incidente: 'ab12cd34' }))
})

afterEach(() => {
  delete globalThis.window
  globalThis.fetch = fetchOriginal
})

test('un 502 en HTML del proxy se registra y el aviso lleva el codigo', async () => {
  const respuesta = new Response(HTML_502, { status: 502, headers: { 'content-type': 'text/html' } })

  const mensaje = await mensajeDeRespuesta(respuesta, { metodo: 'POST', ruta: '/api/bff/actas/9/generar' })

  assert.equal(mensaje, 'El servidor respondió 502')
  assert.equal(reportes.length, 1)
  assert.equal(reportes[0].url, '/api/incidentes')
  assert.equal(reportes[0].cuerpo.tipo, 'RespuestaSinCuerpo')
  assert.equal(reportes[0].cuerpo.metodo, 'POST')
  assert.match(reportes[0].cuerpo.mensaje, /^502 .*Proxy Error.* en \/api\/bff\/actas\/9\/generar$/)
  assert.deepEqual(avisos, [{ mensaje: 'El servidor respondió 502', incidente: 'ab12cd34' }])
})

test('leerError registra el mismo 502 por el mismo camino', async () => {
  const error = await leerError(new Response('', { status: 504 }))

  assert.equal(error.message, 'El servidor respondió 504')
  assert.equal(reportes.length, 1)
  assert.match(reportes[0].cuerpo.mensaje, /^504 cuerpo vacío en /)
  assert.equal(avisos[0].incidente, 'ab12cd34')
})

test('un envelope 5xx sin incidente se registra: el BFF no pudo guardarlo', async () => {
  const respuesta = Response.json({ error: { code: 'server_error', message: 'Error interno.' } }, { status: 500 })

  assert.equal(await mensajeDeRespuesta(respuesta), 'Error interno.')
  assert.equal(reportes[0].cuerpo.tipo, 'RespuestaSinIncidente')
  assert.equal(avisos[0].incidente, 'ab12cd34')
})

test('un envelope que ya trae incidente no se registra dos veces', async () => {
  const respuesta = Response.json(
    { error: { code: 'server_error', message: 'Error interno.', details: { incidente: 'ffff0000' } } },
    { status: 500 }
  )

  await mensajeDeRespuesta(respuesta)
  await leerError(Response.json(
    { error: { code: 'server_error', message: 'Error interno.', details: { incidente: 'ffff0000' } } },
    { status: 500 }
  ))

  assert.equal(reportes.length, 0)
  assert.deepEqual(avisos, [{ mensaje: 'Error interno.', incidente: 'ffff0000' }])
})

test('un 422 no se registra ni avisa', async () => {
  const respuesta = Response.json(
    { error: { code: 'validation_failed', message: 'Hay campos que no se pueden guardar.', details: { name: ['required'] } } },
    { status: 422 }
  )

  await mensajeDeRespuesta(respuesta)
  await leerError(new Response('<html>no encontrado</html>', { status: 404 }))

  assert.equal(reportes.length, 0)
  assert.equal(avisos.length, 0)
})

test('si el reporte falla no se lanza y el aviso sale sin codigo', async () => {
  simularNavegador(() => { throw new TypeError('Failed to fetch') })

  const mensaje = await mensajeDeRespuesta(new Response(HTML_502, { status: 502 }))

  assert.equal(mensaje, 'El servidor respondió 502')
  assert.deepEqual(avisos, [{ mensaje: 'El servidor respondió 502', incidente: undefined }])
})

test('si el reporte contesta error tampoco se lanza', async () => {
  simularNavegador(() => new Response('<html>502</html>', { status: 502 }))

  const error = await leerError(new Response(HTML_502, { status: 502 }))

  assert.equal(error.code, 'server_error')
  assert.equal(avisos[0].incidente, undefined)
})
