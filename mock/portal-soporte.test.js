/**
 * Pruebas del soporte del portal: la bandeja, el hilo y el alta de una solicitud.
 *
 * Van contra el servidor y no contra las funciones porque lo que el frontend programa es la **forma
 * de la respuesta**. Tres cosas quedan clavadas acá:
 *
 *  1. **La bandeja cruza Proyectos, incluido el ticket sin ninguno.** El soporte es una seccion del
 *     portal y no una pestaña del Proyecto; un ticket con `project_id` en null no cabria en ninguna
 *     pestaña, y esta es la unica pantalla donde aparece.
 *  2. **El listado poda lo del hilo.** Si el mock publicara `message` y `replies` en la lista, la
 *     tabla pasaria en local con datos que la API no manda, y la pantalla se caeria en produccion.
 *  3. **El alta valida como la API.** `project_id` del propio cliente, campos ajenos rechazados con
 *     422 (`rechazarCamposAjenos`) y el ticket nace abierto y sin respuestas.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

/** Los dos Proyectos del cliente 1, que es el unico contacto de la fixture con `support`. */
const MIO = 8
const DE_OTRO_CLIENTE = 2

let base
let headers
let headersSinSoporte

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  headers = { authorization: `Bearer ${await entrar('clienta@acme.com')}`, 'content-type': 'application/json' }
  headersSinSoporte = { authorization: `Bearer ${await entrar('limitado@acme.com')}` }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/**
 * Entra al portal con un contacto de la fixture.
 *
 * @param {string} email
 * @returns {Promise<string>} el token de acceso
 */
async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/portal/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'portal1234' })
  })

  return (await respuesta.json()).data.access_token
}

/**
 * Pide una ruta del portal.
 *
 * @param {string} ruta Ruta sin la base.
 * @param {Record<string, string>} [cabeceras]
 * @returns {Promise<{estado: number, datos: unknown}>}
 */
async function pedir (ruta, cabeceras = headers) {
  const respuesta = await fetch(`${base}${ruta}`, { headers: cabeceras })
  const cuerpo = await respuesta.json()

  return { estado: respuesta.status, datos: cuerpo.data }
}

/**
 * Abre una solicitud desde el portal.
 *
 * @param {Record<string, unknown>} cuerpo
 * @returns {Promise<{estado: number, datos: unknown, detalles: unknown}>}
 */
async function crear (cuerpo) {
  const respuesta = await fetch(`${base}/portal/tickets`, {
    method: 'POST',
    headers,
    body: JSON.stringify(cuerpo)
  })
  const json = await respuesta.json()

  return { estado: respuesta.status, datos: json.data, detalles: json.error?.details }
}

test('la bandeja cruza Proyectos e incluye el ticket sin ninguno', async () => {
  const { estado, datos } = await pedir('/portal/tickets?per_page=100')

  assert.equal(estado, 200)
  assert.equal(new Set(datos.map((t) => t.project_id)).size > 1, true)
  assert.equal(datos.some((t) => t.project_id === null), true)
})

test('el listado no publica el hilo', async () => {
  // `message` y `replies` son del detalle. Publicarlos acá haria pasar en local una tabla que en
  // produccion llega sin ellos.
  const { datos } = await pedir('/portal/tickets')

  for (const ticket of datos) {
    assert.equal('message' in ticket, false)
    assert.equal('replies' in ticket, false)
  }
})

test('un contacto sin el permiso de soporte no ve la bandeja', async () => {
  const { estado } = await pedir('/portal/tickets', headersSinSoporte)

  assert.equal(estado, 403)
})

test('el hilo trae el mensaje y las respuestas', async () => {
  const { estado, datos } = await pedir('/portal/tickets/1')

  assert.equal(estado, 200)
  assert.equal(typeof datos.message, 'string')
  assert.equal(datos.replies.length, 1)
  assert.equal(datos.replies[0].from, 'equipo')
})

test('el alta abre el ticket en el Proyecto elegido y nace abierto', async () => {
  const { estado, datos } = await crear({
    subject: 'No abre el tablero',
    message: 'Desde ayer queda cargando.',
    project_id: MIO,
    priority: 3
  })

  assert.equal(estado, 201)
  assert.equal(datos.project_id, MIO)
  assert.equal(datos.priority, 3)
  assert.equal(datos.status, 1)
  assert.deepEqual(datos.replies, [])
  assert.equal(datos.last_reply, null)

  // Y queda en la bandeja: un alta que contesta 201 sobre nada es el fallo que no se ve.
  const { datos: bandeja } = await pedir('/portal/tickets?per_page=100')
  assert.equal(bandeja.some((t) => t.id === datos.id), true)
})

test('sin prioridad el alta igual entra', async () => {
  // Es opcional en el contrato: la define el equipo al repartir.
  const { estado } = await crear({ subject: 'Consulta', message: 'Una duda.', project_id: MIO })

  assert.equal(estado, 201)
})

test('no se puede abrir un ticket en el Proyecto de otro cliente', async () => {
  const { estado, detalles } = await crear({ subject: 'x', message: 'y', project_id: DE_OTRO_CLIENTE })

  assert.equal(estado, 422)
  assert.deepEqual(detalles.project_id, ['no_valido'])
})

test('un campo que el contrato no conoce es 422 y no se ignora', async () => {
  // La API llama a `rechazarCamposAjenos`: si el mock los tragara, el frontend aprenderia a mandar
  // de mas contra una pantalla local y se comeria el 422 en produccion.
  const { estado, detalles } = await crear({
    subject: 'x', message: 'y', project_id: MIO, department: 2
  })

  assert.equal(estado, 422)
  assert.deepEqual(detalles.department, ['desconocido'])
})

test('el asunto y el mensaje son obligatorios', async () => {
  const { estado, detalles } = await crear({ subject: '  ', message: '', project_id: MIO })

  assert.equal(estado, 422)
  assert.deepEqual(detalles.subject, ['requerido'])
  assert.deepEqual(detalles.message, ['requerido'])
})

test('los catalogos del soporte bajan con los del portal', async () => {
  // Sin ellos la bandeja pinta el entero desnudo y el selector de prioridad del alta sale vacio.
  const { datos } = await pedir('/portal/lookups')

  assert.equal(datos.ticket_statuses.length > 0, true)
  assert.equal(datos.ticket_priorities.length > 0, true)
})
