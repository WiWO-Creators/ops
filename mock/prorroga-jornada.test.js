/**
 * La prórroga del cierre automático contra el mock — `POST /me/jornada/prorroga` y el `closing` de
 * `GET /me/jornada`.
 *
 * Va contra el servidor y no contra las funciones porque lo que el panel programa es la forma de la
 * respuesta: el `closing` en null mientras el interruptor está apagado —que es lo único que decide
 * si el aviso de cierre se dibuja—, el instante del corte ya corrido después del POST, y los dos
 * rechazos con sus códigos.
 *
 * El corte se fija con `MOCK_JORNADA_CIERRE_EN`, que lo pone a N segundos de la apertura: sin eso la
 * prueba tendría que esperar hasta la hora de cierre real.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

// Antes de importar el servidor: el mock lee la variable cuando calcula cada corte, pero fijarla
// después dejaría la prueba dependiendo del orden de los módulos.
process.env.MOCK_JORNADA_CIERRE_EN = '60'

const { servidor } = await import('./servidor.js')

let base
let headers
/** El interruptor del cierre automático, tal como lo deja el panel de mantenimiento. */
let interruptor

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })

  headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${(await respuesta.json()).data.access_token}`
  }

  interruptor = `${base}/mantenimiento/interruptores`
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Enciende o apaga el cierre automático, que es lo que decide si hay `closing`. */
async function cierreAutomatico (encendido) {
  const respuesta = await fetch(interruptor, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ wiwo_live_cierre_automatico: encendido })
  })

  assert.equal(respuesta.status, 200, 'el interruptor se escribe desde mantenimiento')
}

/** Deja una jornada abierta y devuelve el estado del día. */
async function abrirJornada () {
  await fetch(`${base}/me/jornada/cierre`, { method: 'POST', headers, body: '{}' })

  const respuesta = await fetch(`${base}/me/jornada`, { method: 'POST', headers, body: '{}' })

  return (await respuesta.json()).data
}

test('con el cierre automático apagado no hay closing, y la prórroga es 409', async () => {
  await cierreAutomatico(false)
  const estado = await abrirJornada()

  // Es la única señal que mira el aviso: sin cierre que anunciar, no se dibuja nada.
  assert.equal(estado.closing, null)

  const rechazo = await fetch(`${base}/me/jornada/prorroga`, { method: 'POST', headers })
  assert.equal(rechazo.status, 409)
  assert.match((await rechazo.json()).error.message, /apagado/i)
})

test('encendido, closing dice cuándo se cierra y cuánto suma cada prórroga', async () => {
  await cierreAutomatico(true)
  const estado = await abrirJornada()

  assert.ok(estado.closing !== null, 'con el interruptor encendido hay cierre que anunciar')
  assert.equal(estado.closing.extended, false, 'una jornada recién abierta no está prorrogada')
  assert.equal(estado.closing.extension_minutes, 30)
  assert.equal(
    Date.parse(estado.closing.deadline) - Date.parse(estado.closing.at),
    30 * 60_000,
    'el plazo para contestar "¿Estás ahí?" vence media hora después de la pregunta'
  )

  // Los sesenta segundos de `MOCK_JORNADA_CIERRE_EN`, contados desde la apertura.
  const falta = Date.parse(estado.closing.at) - Date.parse(estado.open.started_at)
  assert.equal(falta, 60_000)
})

test('la prórroga corre el corte desde el corte vigente y devuelve el estado nuevo', async () => {
  await cierreAutomatico(true)
  const antes = await abrirJornada()

  const respuesta = await fetch(`${base}/me/jornada/prorroga`, { method: 'POST', headers })
  assert.equal(respuesta.status, 200)

  const despues = (await respuesta.json()).data

  assert.equal(despues.closing.extended, true, 'la jornada queda marcada como prorrogada')
  // Media hora DESPUÉS del corte que había, no media hora desde ahora: contar desde ahora le
  // devolvería a quien contesta antes de tiempo un corte casi idéntico al que ya tenía.
  assert.equal(
    Date.parse(despues.closing.at) - Date.parse(antes.closing.at),
    30 * 60_000
  )

  // Y el `GET` cuenta lo mismo que el `POST`: si no, la pantalla volvería al corte viejo en el
  // siguiente refresco y el aviso saldría otra vez.
  const leido = (await (await fetch(`${base}/me/jornada`, { headers })).json()).data
  assert.equal(leido.closing.at, despues.closing.at)
})

test('dos prórrogas seguidas suman, no se pisan', async () => {
  await cierreAutomatico(true)
  const antes = await abrirJornada()

  await fetch(`${base}/me/jornada/prorroga`, { method: 'POST', headers })
  const segunda = await fetch(`${base}/me/jornada/prorroga`, { method: 'POST', headers })
  const estado = (await segunda.json()).data

  assert.equal(
    Date.parse(estado.closing.at) - Date.parse(antes.closing.at),
    60 * 60_000,
    'dos prórrogas de media hora son una hora'
  )
})

test('sin jornada abierta la prórroga es 404', async () => {
  await cierreAutomatico(true)
  await abrirJornada()
  await fetch(`${base}/me/jornada/cierre`, { method: 'POST', headers, body: '{}' })

  const rechazo = await fetch(`${base}/me/jornada/prorroga`, { method: 'POST', headers })

  assert.equal(rechazo.status, 404)
  assert.match((await rechazo.json()).error.message, /prorrogar/i)
})

test('sólo POST: el GET de la prórroga no existe', async () => {
  const respuesta = await fetch(`${base}/me/jornada/prorroga`, { headers })

  assert.equal(respuesta.status, 404)
})
