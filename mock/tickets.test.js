/**
 * Pruebas de los tickets del mock: la regla de respuesta del cliente (T2), las rutas del equipo (T4)
 * y los avisos de ticket nuevo (T3).
 *
 * Van contra el servidor porque lo que el frontend programa es la forma de la respuesta y el codigo
 * de estado. Lo que queda clavado:
 *
 *  1. **El cliente no responde antes que el equipo, ni en un ticket cerrado**: la ficha lo dice con
 *     `puede_responder` y `motivo_sin_respuesta`, y el POST responde 409 con el codigo del contrato.
 *  2. **Lo que responde el equipo desbloquea al cliente**: los dos lados escriben el mismo hilo.
 *  3. **El panel y el portal podan distinto**: el portal ve un `autor` reducido (tipo, nombre, mio),
 *     el panel no ve `from`.
 *  4. **Los avisos validan como la API**: apagar sin nadie es 422, una persona inexistente tambien.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'

let base
let staff
let cliente

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  staff = await entrar('/auth/login', 'ana@wiwo.me', 'mock1234')
  cliente = await entrar('/auth/portal/login', 'clienta@acme.com', 'portal1234')
})

after(() => new Promise((resolver) => servidor.close(resolver)))

async function entrar (ruta, email, password) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  return (await respuesta.json()).data.access_token
}

/**
 * Pide una ruta con un token.
 *
 * @returns {Promise<{ estado: number, cuerpo: any }>}
 */
async function pedir (token, ruta, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(datos === undefined ? {} : { body: JSON.stringify(datos) })
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

test('la ficha del portal dice que no se puede responder mientras el equipo no conteste', async () => {
  const { estado, cuerpo } = await pedir(cliente, '/portal/tickets/2')

  assert.equal(estado, 200)
  assert.equal(cuerpo.data.puede_responder, false)
  assert.equal(cuerpo.data.motivo_sin_respuesta, 'esperando_equipo')
})

test('responder antes que el equipo es 409 con el codigo del contrato', async () => {
  const { estado, cuerpo } = await pedir(cliente, '/portal/tickets/2/respuestas', 'POST', { message: 'Hola' })

  assert.equal(estado, 409)
  assert.equal(cuerpo.error.code, 'ticket_sin_respuesta_del_equipo')
})

test('un ticket cerrado es 409 ticket_cerrado', async () => {
  const ficha = await pedir(cliente, '/portal/tickets/3')
  assert.equal(ficha.cuerpo.data.motivo_sin_respuesta, 'cerrado')

  const { estado, cuerpo } = await pedir(cliente, '/portal/tickets/3/respuestas', 'POST', { message: 'Hola' })
  assert.equal(estado, 409)
  assert.equal(cuerpo.error.code, 'ticket_cerrado')
})

test('la respuesta del equipo desbloquea al cliente, y la del cliente llega al hilo del equipo', async () => {
  const delEquipo = await pedir(staff, '/tickets/2/respuestas', 'POST', { message: 'Lo miramos hoy.', status: 3 })
  assert.equal(delEquipo.estado, 201)
  assert.equal(delEquipo.cuerpo.data.autor.tipo, 'staff')
  assert.equal('from' in delEquipo.cuerpo.data, false)

  const ficha = await pedir(cliente, '/portal/tickets/2')
  assert.equal(ficha.cuerpo.data.puede_responder, true)
  assert.equal(ficha.cuerpo.data.motivo_sin_respuesta, null)
  assert.equal(ficha.cuerpo.data.status, 3)
  // El portal ve la autoria reducida del contrato v2 (B): tipo, nombre y mio. Nada de ids ni correos.
  assert.deepEqual(Object.keys(ficha.cuerpo.data.replies[0].autor).sort(), ['mio', 'nombre', 'tipo'])

  const delCliente = await pedir(cliente, '/portal/tickets/2/respuestas', 'POST', { message: 'Gracias.' })
  assert.equal(delCliente.estado, 201)

  const hilo = await pedir(staff, '/tickets/2/respuestas')
  assert.deepEqual(hilo.cuerpo.data.map((r) => r.autor.tipo), ['staff', 'contacto'])
})

test('una respuesta vacia o con claves ajenas es 422', async () => {
  assert.equal((await pedir(staff, '/tickets/1/respuestas', 'POST', { message: '  ' })).estado, 422)
  assert.equal((await pedir(cliente, '/portal/tickets/1/respuestas', 'POST', { message: 'x', status: 5 })).estado, 422)
})

test('la pestaña del Proyecto tiene la forma de la bandeja global (CONTRATO2 F)', async () => {
  const { estado, cuerpo } = await pedir(staff, '/projects/1/tickets')

  assert.equal(estado, 200)
  assert.ok(cuerpo.data.some((t) => t.id === 1))
  assert.equal('task' in cuerpo.data[0], true)
  assert.equal('solicitante' in cuerpo.data[0], true)
})

test('la ficha del equipo trae la tarea vinculada y el PATCH cambia la prioridad', async () => {
  const ficha = await pedir(staff, '/tickets/1')
  assert.equal(ficha.cuerpo.data.task.id, 500)
  assert.equal(ficha.cuerpo.data.project_id, 1)

  const parche = await pedir(staff, '/tickets/1', 'PATCH', { priority: 4 })
  assert.equal(parche.estado, 200)
  assert.equal(parche.cuerpo.data.priority, 4)

  assert.equal((await pedir(staff, '/tickets/1', 'PATCH', { subjectx: 'a' })).estado, 422)
})

test('los lookups del equipo traen los catalogos de tickets', async () => {
  const { cuerpo } = await pedir(staff, '/lookups')

  assert.ok(cuerpo.data.ticket_statuses.length > 0)
  assert.ok(cuerpo.data.ticket_priorities.length > 0)
})

test('avisos: nacen en todo el equipo, apagar sin nadie es 422 y con personas se guarda', async () => {
  const inicial = await pedir(staff, '/projects/1/ticket-notifications')
  assert.deepEqual(inicial.cuerpo.data, { aviso_al_equipo: true, correos: [], personas: [] })

  const vacio = await pedir(staff, '/projects/1/ticket-notifications', 'PUT', { aviso_al_equipo: false, personas: [] })
  assert.equal(vacio.estado, 422)

  const inexistente = await pedir(staff, '/projects/1/ticket-notifications', 'PUT', { aviso_al_equipo: false, personas: [99999] })
  assert.equal(inexistente.estado, 422)

  const guardado = await pedir(staff, '/projects/1/ticket-notifications', 'PUT', { aviso_al_equipo: false, personas: [2, 2] })
  assert.equal(guardado.estado, 200)
  assert.equal(guardado.cuerpo.data.aviso_al_equipo, false)
  assert.deepEqual(guardado.cuerpo.data.personas.map((p) => p.id), [2])
  assert.equal(typeof guardado.cuerpo.data.personas[0].email, 'string')

  const soloPersonas = await pedir(staff, '/projects/1/ticket-notifications', 'PUT', { personas: [3] })
  assert.equal(soloPersonas.estado, 200)
  assert.equal(soloPersonas.cuerpo.data.aviso_al_equipo, false, 'la clave omitida conserva lo guardado')
})

// --- Contrato v2: detalle, respuestas y acciones -------------------------------------------------

test('el mensaje viaja en HTML y con message_texto limpio, en el panel y en el portal', async () => {
  const portal = await pedir(cliente, '/portal/tickets/1')
  const respuesta = portal.cuerpo.data.replies[0]
  assert.match(respuesta.message, /<p>/)
  assert.equal(respuesta.message_texto, 'Lo estamos revisando: parece que el PDF se exportó a 72 dpi.\nTe subimos uno nuevo & te avisamos.')

  const hilo = await pedir(staff, '/tickets/1/respuestas')
  assert.equal(hilo.cuerpo.data[0].message_texto, respuesta.message_texto)
  assert.equal(hilo.cuerpo.data[0].attachments[0].download_path, 'files/ticket/9/download')

  const ficha = await pedir(staff, '/tickets/1')
  assert.equal(typeof ficha.cuerpo.data.message_texto, 'string')
})

test('la ficha del portal dice de quien es y que puede hacer el contacto', async () => {
  const { cuerpo } = await pedir(cliente, '/portal/tickets/1')

  assert.equal(cuerpo.data.mio, true)
  assert.equal(cuerpo.data.solicitante.nombre, 'Renata Ferreyra')
  assert.equal(cuerpo.data.replies[0].autor.mio, false)
  assert.equal(cuerpo.data.puede_cerrar, true)
  assert.equal(cuerpo.data.puede_reabrir, false)
})

test('leido marca la lectura con 204 y un GET no escribe', async () => {
  assert.equal((await pedir(cliente, '/portal/tickets/1')).cuerpo.data.no_leido, true)
  assert.equal((await pedir(cliente, '/portal/tickets/1')).cuerpo.data.no_leido, true, 'leer no marca')

  const marca = await fetch(`${base}/portal/tickets/1/leido`, { method: 'POST', headers: { authorization: `Bearer ${cliente}` } })
  assert.equal(marca.status, 204)
  assert.equal((await pedir(cliente, '/portal/tickets/1')).cuerpo.data.no_leido, false)
})

test('cerrar y reabrir con sus 409, y la reapertura vencida', async () => {
  const cerrado = await pedir(cliente, '/portal/tickets/1/cerrar', 'POST')
  assert.equal(cerrado.estado, 200)
  assert.equal(cerrado.cuerpo.data.status, 5)
  assert.equal(cerrado.cuerpo.data.puede_reabrir, true)
  assert.equal((await pedir(cliente, '/portal/tickets/1/cerrar', 'POST')).cuerpo.error.code, 'ticket_cerrado')

  const reabierto = await pedir(cliente, '/portal/tickets/1/reabrir', 'POST')
  assert.equal(reabierto.cuerpo.data.status, 1)
  assert.equal((await pedir(cliente, '/portal/tickets/1/reabrir', 'POST')).cuerpo.error.code, 'ticket_abierto')

  // El 3 se cerro el 05/08: fuera del plazo de reapertura.
  const vencida = await pedir(cliente, '/portal/tickets/3/reabrir', 'POST')
  assert.equal(vencida.estado, 409)
  assert.equal(vencida.cuerpo.error.code, 'reapertura_vencida')
})

test('un hijo fusionado abre el principal y responderle escribe en el principal', async () => {
  const { cuerpo } = await pedir(cliente, '/portal/tickets/40')
  assert.equal(cuerpo.data.id, 1)
  assert.equal(cuerpo.data.fusionado_desde, 40)

  const delEquipo = await pedir(staff, '/tickets/40/respuestas', 'POST', { message: 'Seguimos en el principal.' })
  assert.equal(delEquipo.estado, 201)
  assert.equal(delEquipo.cuerpo.data.message_texto, 'Seguimos en el principal.')
})

test('la respuesta del equipo sin status pasa un ticket Abierto a Respondido y se guarda con nl2br', async () => {
  assert.equal((await pedir(staff, '/tickets/1', 'PATCH', { status: 1 })).cuerpo.data.status, 1)

  const respuesta = await pedir(staff, '/tickets/1/respuestas', 'POST', { message: 'Línea uno\n<b>dos</b>' })
  assert.equal(respuesta.cuerpo.data.message, 'Línea uno<br />\r\n&lt;b&gt;dos&lt;/b&gt;')
  assert.equal(respuesta.cuerpo.data.message_texto, 'Línea uno\n<b>dos</b>')
  assert.equal((await pedir(staff, '/tickets/1')).cuerpo.data.status, 3)
})

test('predefinidas y adjuntos de apertura', async () => {
  const predefinidas = await pedir(staff, '/tickets/respuestas-predefinidas')
  assert.ok(predefinidas.cuerpo.data.length > 0)
  assert.deepEqual(Object.keys(predefinidas.cuerpo.data[0]).sort(), ['id', 'message', 'name'])

  const archivos = await pedir(staff, '/tickets/1/archivos')
  assert.deepEqual(archivos.cuerpo.data.map((a) => a.reply_id), [null])
})

test('un mensaje de mas de 20000 caracteres es 422', async () => {
  const largo = 'a'.repeat(20001)
  assert.equal((await pedir(staff, '/tickets/1/respuestas', 'POST', { message: largo })).estado, 422)
  assert.equal((await pedir(cliente, '/portal/tickets', 'POST', { subject: 'x', message: largo, project_id: 1 })).estado, 422)
})

test('el alta repetida en un minuto es 200 con el mismo ticket', async () => {
  const alta = { subject: 'Se cae el formulario', message: 'Al enviar se queda en blanco.', project_id: 1 }
  const primera = await pedir(cliente, '/portal/tickets', 'POST', alta)
  const segunda = await pedir(cliente, '/portal/tickets', 'POST', alta)

  assert.equal(primera.estado, 201)
  assert.equal(segunda.estado, 200)
  assert.equal(segunda.cuerpo.data.id, primera.cuerpo.data.id)
})
