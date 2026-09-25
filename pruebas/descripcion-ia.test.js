/**
 * El cliente de red del asistente de la descripcion.
 *
 * Lo que se prueba es lo que la pantalla no puede mostrar mal:
 *
 *   1. **La sonda nunca dice que si por las dudas.** Un `true` de mas dibuja un boton que al
 *      apretarlo falla, que es justamente lo que la sonda existe para evitar.
 *   2. **La llamada siempre termina.** Con texto, con error, cancelada o por espera agotada: los
 *      cuatro finales existen y ninguno es quedarse esperando.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultarDisponibilidad, redactarDescripcion } from '../src/datos/descripcion-ia.ts'

const CUERPO = { titulo: 'Grilla de septiembre', respuestas: [{ pregunta: '¿Qué?', respuesta: 'Armarla' }] }

/** Reemplaza `fetch` por uno que devuelve lo que se le diga y guarda con que se lo llamo. */
function fetchDePrueba (responder) {
  const llamadas = []

  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones })

    return await responder(url, opciones)
  }

  return llamadas
}

function sobre (estado, datos) {
  return { ok: estado >= 200 && estado < 300, status: estado, json: async () => ({ data: datos }) }
}

test('consultarDisponibilidad: solo un `disponible: true` explicito habilita el boton', async () => {
  fetchDePrueba(async () => sobre(200, { disponible: true }))
  assert.equal(await consultarDisponibilidad(new AbortController().signal), true)

  fetchDePrueba(async () => sobre(200, { disponible: false }))
  assert.equal(await consultarDisponibilidad(new AbortController().signal), false)

  // Un cuerpo sin la clave es un contrato que cambio: ante la duda, no se ofrece.
  fetchDePrueba(async () => sobre(200, {}))
  assert.equal(await consultarDisponibilidad(new AbortController().signal), false)
})

test('consultarDisponibilidad: la capa apagada y la red caida terminan igual', async () => {
  // 404 es lo que contesta toda la ruta `/ia/*` con `ia_habilitada` en 0.
  fetchDePrueba(async () => ({ ok: false, status: 404, json: async () => ({}) }))
  assert.equal(await consultarDisponibilidad(new AbortController().signal), false)

  fetchDePrueba(async () => { throw new TypeError('Failed to fetch') })
  assert.equal(await consultarDisponibilidad(new AbortController().signal), false)
})

test('consultarDisponibilidad: la sonda es un GET a la ruta del asistente', async () => {
  const llamadas = fetchDePrueba(async () => sobre(200, { disponible: true }))
  await consultarDisponibilidad(new AbortController().signal)

  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, '/api/bff/ia/tareas/describir')
  assert.equal(llamadas[0].opciones.method, undefined)
})

test('redactarDescripcion: devuelve el texto tal como lo manda la API', async () => {
  const llamadas = fetchDePrueba(async () => sobre(200, { descripcion: 'Dos párrafos.' }))
  const resultado = await redactarDescripcion(CUERPO, new AbortController().signal)

  assert.deepEqual(resultado, { ok: true, descripcion: 'Dos párrafos.' })
  assert.equal(llamadas[0].opciones.method, 'POST')
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), CUERPO)
})

test('redactarDescripcion: una respuesta vacia es un error, no un borrador en blanco', async () => {
  fetchDePrueba(async () => sobre(200, { descripcion: '   ' }))
  const resultado = await redactarDescripcion(CUERPO, new AbortController().signal)

  assert.equal(resultado.ok, false)
  assert.equal(resultado.motivo, 'error')
})

test('redactarDescripcion: el error de la API llega con su mensaje', async () => {
  fetchDePrueba(async () => Response.json(
    { error: { code: 'provider_error', message: 'El proveedor no respondió.' } },
    { status: 502 }
  ))

  const resultado = await redactarDescripcion(CUERPO, new AbortController().signal)

  assert.equal(resultado.ok, false)
  assert.equal(resultado.motivo, 'error')
  assert.match(resultado.mensaje, /proveedor/)
})

test('redactarDescripcion: cancelar no es un error y se distingue de uno', async () => {
  const control = new AbortController()

  fetchDePrueba(async (_url, opciones) => {
    control.abort()

    // El `fetch` real rechaza en cuanto la señal se aborta, la haya visto ya abortada o no.
    assert.equal(opciones.signal.aborted, true)

    throw new DOMException('The operation was aborted.', 'AbortError')
  })

  const resultado = await redactarDescripcion(CUERPO, control.signal)

  assert.deepEqual(resultado, { ok: false, motivo: 'cancelada' })
})

test('redactarDescripcion: una API que no contesta corta sola y lo dice', async () => {
  // Una respuesta que no llega nunca: sin el techo de espera, esto seria el spinner eterno.
  fetchDePrueba(async (_url, opciones) => await new Promise((_resolver, rechazar) => {
    if (opciones.signal.aborted) {
      rechazar(new DOMException('The operation timed out.', 'TimeoutError'))

      return
    }

    opciones.signal.addEventListener('abort', () => {
      rechazar(new DOMException('The operation timed out.', 'TimeoutError'))
    })
  }))

  const resultado = await redactarDescripcion(CUERPO, new AbortController().signal, 20)

  assert.equal(resultado.ok, false)
  assert.equal(resultado.motivo, 'espera')
  assert.match(resultado.mensaje, /sigue acá/)
})
