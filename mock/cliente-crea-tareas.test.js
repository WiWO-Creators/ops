/**
 * Pruebas de la creacion de Tareas por contactos del cliente en el mock: el interruptor por cliente
 * (`GET|PUT /clients/{id}/portal-crea-tareas`), `POST /portal/projects/{id}/tasks`, la capacidad
 * `alta_de_tareas` del Proyecto y las propuestas del Thinking Orb del portal.
 *
 * Lo que se deja clavado es que el mock se porte como la API del contrato:
 *
 *  1. **Apagado de fabrica y sin rastro.** Con el interruptor vacio nada cambia: la capacidad es
 *     `null`, el POST es 404 y el orbe no propone.
 *  2. **Encendido, valida como la API**: vencimiento segun el cliente, asignados solo del equipo,
 *     lista blanca de campos, tope por hora e idempotencia de un minuto.
 *  3. **La Tarea es del contacto**, no de un staff: la ficha del equipo recibe `created_by_contact`.
 *  4. **El orbe solo propone**: confirmar es lo que escribe, una vez, y solo el dueño de la propuesta.
 */

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { CLIENTES_CREAN_TAREAS, CLIENTES_SIN_VENCIMIENTO, PROCESOS, PROYECTOS_SIN_EQUIPO_VISIBLE } from './datos.js'
import { reiniciarTareasDelPortal } from './tareas-del-portal.js'
import { reiniciarOrbePortal } from './orbe-portal.js'

let base
let staff
let clienta
let limitado

/** Entra como staff o como contacto y devuelve la cabecera de autorizacion. */
async function entrar (ruta, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })

  return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  staff = await entrar('/auth/login', { email: 'ana@wiwo.me', password: 'mock1234' })
  clienta = await entrar('/auth/portal/login', { email: 'clienta@acme.com', password: 'portal1234' })
  limitado = await entrar('/auth/portal/login', { email: 'limitado@acme.com', password: 'portal1234' })
})

afterEach(() => {
  CLIENTES_CREAN_TAREAS.clear()
  CLIENTES_SIN_VENCIMIENTO.clear()
  PROYECTOS_SIN_EQUIPO_VISIBLE.clear()
  reiniciarTareasDelPortal()
  reiniciarOrbePortal()
  delete process.env.PORTAL_TAREAS_ALTAS_POR_HORA
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Pide como el actor que se indique. */
async function pedir (actor, ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...actor, 'content-type': 'application/json', ...(opciones.headers ?? {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body)
  })
  const texto = await respuesta.text()

  return { estado: respuesta.status, cuerpo: texto === '' ? null : JSON.parse(texto) }
}

/** Enciende o apaga el interruptor del cliente 1 (Acme) como lo hace la ficha del cliente. */
async function interruptor (habilitado) {
  return await pedir(staff, '/clients/1/portal-crea-tareas', { method: 'PUT', body: { habilitado } })
}

/** `POST /portal/projects/{id}/tasks` como la clienta. */
async function crear (cuerpo, { proyecto = 1, actor = clienta } = {}) {
  return await pedir(actor, `/portal/projects/${proyecto}/tasks`, { method: 'POST', body: cuerpo })
}

test('nace apagado: el staff lo ve en false, el Proyecto no ofrece alta y el POST es 404', async () => {
  const flag = await pedir(staff, '/clients/1/portal-crea-tareas')

  assert.equal(flag.estado, 200)
  assert.deepEqual(flag.cuerpo.data, { habilitado: false })

  const ficha = await pedir(clienta, '/portal/projects/1')

  assert.equal(ficha.cuerpo.data.alta_de_tareas, null)
  assert.equal((await crear({ name: 'X', due_date: '2026-12-31' })).estado, 404)
})

test('el PUT exige el booleano y devuelve lo guardado', async () => {
  const malo = await pedir(staff, '/clients/1/portal-crea-tareas', { method: 'PUT', body: { habilitado: 'si' } })

  assert.equal(malo.estado, 422)
  assert.deepEqual(malo.cuerpo.error.details, { habilitado: ['no_booleano'] })
  assert.deepEqual((await interruptor(true)).cuerpo.data, { habilitado: true })
  assert.deepEqual((await pedir(staff, '/clients/1/portal-crea-tareas')).cuerpo.data, { habilitado: true })
  assert.deepEqual((await interruptor(false)).cuerpo.data, { habilitado: false })
})

test('encendido: la ficha del Proyecto publica el vencimiento requerido y los asignables', async () => {
  await interruptor(true)

  const alta = (await pedir(clienta, '/portal/projects/1')).cuerpo.data.alta_de_tareas

  assert.equal(alta.vencimiento_requerido, true)
  assert.ok(alta.asignables.length > 0)
  for (const persona of alta.asignables) {
    assert.deepEqual(Object.keys(persona).sort(), ['avatar', 'id', 'nombre'])
  }

  CLIENTES_SIN_VENCIMIENTO.add(1)
  assert.equal((await pedir(clienta, '/portal/projects/1')).cuerpo.data.alta_de_tareas.vencimiento_requerido, false)
})

test('sin la pestaña de Tareas no hay alta (null) y el POST es 403', async () => {
  await interruptor(true)

  assert.equal((await pedir(clienta, '/portal/projects/8')).cuerpo.data.alta_de_tareas, null)
  assert.equal((await crear({ name: 'X', due_date: '2026-12-31' }, { proyecto: 8 })).estado, 403)
})

test('un Proyecto ajeno es 404, no 403', async () => {
  await interruptor(true)

  assert.equal((await crear({ name: 'X', due_date: '2026-12-31' }, { proyecto: 2 })).estado, 404)
})

test('crea la Tarea del contacto: 201, forma del portal y created_by_contact en la ficha del equipo', async () => {
  await interruptor(true)

  const alta = (await pedir(clienta, '/portal/projects/1')).cuerpo.data.alta_de_tareas
  const asignado = alta.asignables[0].id
  const respuesta = await crear({
    name: '  Revisar la propuesta  ', description: 'Con el equipo de ventas', due_date: '2027-03-15', priority: 3, assignees: [asignado]
  })

  assert.equal(respuesta.estado, 201)

  const tarea = respuesta.cuerpo.data

  assert.equal(tarea.name, 'Revisar la propuesta')
  assert.equal(tarea.due_date, '2027-03-15')
  assert.equal(tarea.priority, 3)

  const propia = PROCESOS.find((p) => p.id === tarea.id)

  assert.equal(propia.added_from, 1)
  assert.equal(propia.created_by, null)
  assert.deepEqual(propia.created_by_contact, { id: 1, nombre: 'Renata Ferreyra' })
  assert.equal(propia.visible_to_client, true)
  assert.deepEqual(propia.assignees.map((a) => [a.id, a.assigned_by]), [[asignado, null]])

  // Aparece en la lista del propio portal.
  const lista = await pedir(clienta, '/portal/projects/1/tasks?per_page=100')

  assert.ok(lista.cuerpo.data.some((t) => t.id === tarea.id))

  // Y la ficha del equipo recibe quien la creo.
  const ficha = await pedir(staff, `/tasks/${tarea.id}`)

  assert.equal(ficha.estado, 200)
  assert.equal(ficha.cuerpo.data.created_by, null)
  assert.deepEqual(ficha.cuerpo.data.created_by_contact, { id: 1, nombre: 'Renata Ferreyra' })
})

test('el vencimiento es obligatorio solo si el cliente lo exige', async () => {
  await interruptor(true)

  const sin = await crear({ name: 'Sin fecha' })

  assert.equal(sin.estado, 422)
  assert.deepEqual(sin.cuerpo.error.details, { due_date: ['requerido_por_cliente'] })

  CLIENTES_SIN_VENCIMIENTO.add(1)
  const permitida = await crear({ name: 'Sin fecha' })

  assert.equal(permitida.estado, 201)
  assert.equal(permitida.cuerpo.data.due_date, null)
})

test('campos de mas, nombre vacio o largo, prioridad o fecha invalidas son 422 por campo', async () => {
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)

  const respuesta = await crear({
    name: '', status: 5, visible_to_client: 0, priority: 9, due_date: 'manana', description: 4
  })

  assert.equal(respuesta.estado, 422)
  assert.deepEqual(respuesta.cuerpo.error.details, {
    status: ['no_editable'],
    visible_to_client: ['no_editable'],
    name: ['requerido'],
    description: ['no_valido'],
    due_date: ['formato_invalido'],
    priority: ['no_valido']
  })

  assert.deepEqual((await crear({ name: 'a'.repeat(192) })).cuerpo.error.details, { name: ['demasiado_largo'] })
})

test('los asignados tienen que ser del equipo del Proyecto', async () => {
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)

  const fuera = await crear({ name: 'X', assignees: [9999] })

  assert.equal(fuera.estado, 422)
  assert.deepEqual(fuera.cuerpo.error.details, { assignees: ['no_es_del_equipo'] })
  assert.deepEqual((await crear({ name: 'X', assignees: 'todos' })).cuerpo.error.details, { assignees: ['debe_ser_lista'] })
  assert.equal((await crear({ name: 'Sin asignar', assignees: [] })).estado, 201)
})

test('si el Proyecto oculta su equipo no hay asignables y asignar es 422', async () => {
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)
  PROYECTOS_SIN_EQUIPO_VISIBLE.add(1)

  const ficha = (await pedir(clienta, '/portal/projects/1')).cuerpo.data

  assert.deepEqual(ficha.alta_de_tareas.asignables, [])

  const miembro = ficha.members[0]?.id ?? 1

  assert.deepEqual((await crear({ name: 'X', assignees: [miembro] })).cuerpo.error.details, { assignees: ['no_es_del_equipo'] })
  assert.equal((await crear({ name: 'X' })).estado, 201)
})

test('repetir la misma alta dentro del minuto devuelve 200 con la misma Tarea', async () => {
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)

  const primera = await crear({ name: 'Una sola vez' })
  const segunda = await crear({ name: 'una sola vez' })

  assert.equal(primera.estado, 201)
  assert.equal(segunda.estado, 200)
  assert.equal(segunda.cuerpo.data.id, primera.cuerpo.data.id)
  assert.equal(PROCESOS.filter((p) => p.name === 'Una sola vez').length, 1)
})

test('el tope por hora es por contacto: pasado es 429 con la espera, y el otro contacto sigue libre', async () => {
  process.env.PORTAL_TAREAS_ALTAS_POR_HORA = '2'
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)

  assert.equal((await crear({ name: 'Uno' })).estado, 201)
  assert.equal((await crear({ name: 'Dos' })).estado, 201)

  const tercera = await crear({ name: 'Tres' })

  assert.equal(tercera.estado, 429)
  assert.ok(tercera.cuerpo.error.details.reintentar_en_segundos > 0)
  assert.equal(PROCESOS.some((p) => p.name === 'Tres'), false)
  assert.equal((await crear({ name: 'Tres' }, { actor: limitado })).estado, 201)
})

test('una alta rechazada por validacion no gasta el tope', async () => {
  process.env.PORTAL_TAREAS_ALTAS_POR_HORA = '1'
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)

  assert.equal((await crear({ name: '' })).estado, 422)
  assert.equal((await crear({ name: 'Vale' })).estado, 201)
})

test('el portal sigue de solo lectura para todo lo demas', async () => {
  await interruptor(true)

  for (const [metodo, ruta] of [
    ['PATCH', '/portal/projects/1/tasks/1'], ['DELETE', '/portal/projects/1/tasks/1'],
    ['PUT', '/portal/projects/1/tasks'], ['POST', '/portal/projects/1'], ['POST', '/portal/projects/1/tasks/1']
  ]) {
    assert.equal((await pedir(clienta, ruta, { method: metodo, body: {} })).estado, 404, `${metodo} ${ruta}`)
  }
})

// --- El Thinking Orb del portal ------------------------------------------------

/** Enciende el orbe del portal como la pantalla de Administracion. */
async function encenderOrbe () {
  await pedir(staff, '/settings', { method: 'PATCH', body: { wiwo_portal_ia_chat: true } })
}

/** Manda un mensaje al chat y devuelve el stream SSE entero. */
async function preguntar (mensaje, proyecto) {
  const respuesta = await fetch(`${base}/portal/ia/chat`, {
    method: 'POST',
    headers: { ...clienta, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(proyecto === undefined ? { mensaje } : { mensaje, proyecto_id: proyecto })
  })

  return await respuesta.text()
}

/** La propuesta que viaja en el stream. */
function propuestaDe (stream) {
  const coincidencia = /event: propuesta\ndata: (.+)\n/.exec(stream)

  return coincidencia === null ? null : JSON.parse(coincidencia[1])
}

test('el orbe solo propone si el cliente puede crear Tareas', async () => {
  await encenderOrbe()

  assert.deepEqual((await pedir(clienta, '/portal/ia/capacidades')).cuerpo.data, { habilitado: true, puede_proponer_tareas: false })
  assert.equal(propuestaDe(await preguntar('Crea una tarea para revisar el brief', 1)), null)

  await interruptor(true)

  assert.deepEqual((await pedir(clienta, '/portal/ia/capacidades')).cuerpo.data, { habilitado: true, puede_proponer_tareas: true })
})

test('proponer no escribe; confirmar crea la Tarea una sola vez y rechazar no crea nada', async () => {
  await encenderOrbe()
  await interruptor(true)

  const antes = PROCESOS.length
  const stream = await preguntar('Crea una tarea para revisar el brief', 1)
  const propuesta = propuestaDe(stream)

  assert.ok(propuesta, 'el stream trae event: propuesta')
  assert.deepEqual(Object.keys(propuesta).sort(), ['detalle', 'estado', 'expira_en', 'herramienta', 'id', 'resultado', 'resumen', 'supuestos'])
  assert.equal(propuesta.estado, 'pendiente')
  assert.match(propuesta.resumen, /Revisar el brief/)
  assert.ok(propuesta.supuestos.length > 0, 'asumio el vencimiento que el cliente exige')
  assert.equal(PROCESOS.length, antes)

  // El hilo guardado la trae hidratada bajo `acciones`.
  const hilo = (await pedir(clienta, '/portal/ia/chat?proyecto_id=1')).cuerpo.data.mensajes
  const guardada = hilo.find((m) => m.rol === 'asistente').acciones

  assert.equal(guardada.length, 1)
  assert.equal(guardada[0].id, propuesta.id)

  // Otro contacto del mismo cliente no puede decidir sobre ella.
  assert.equal((await pedir(limitado, `/portal/ia/acciones/${propuesta.id}`, { method: 'POST', body: { decision: 'confirmar' } })).estado, 404)
  assert.equal(PROCESOS.length, antes)

  const decision = await pedir(clienta, `/portal/ia/acciones/${propuesta.id}`, { method: 'POST', body: { decision: 'confirmar' } })

  assert.equal(decision.estado, 200)
  assert.equal(decision.cuerpo.data.estado, 'ejecutada')

  const tarea = PROCESOS.find((p) => p.id === decision.cuerpo.data.tarea_id)

  assert.equal(tarea.name, 'Revisar el brief')
  assert.equal(tarea.created_by_contact.id, 1)
  assert.equal(PROCESOS.length, antes + 1)

  // Segunda decision: ya resuelta, 409, y no se crea otra.
  const repetida = await pedir(clienta, `/portal/ia/acciones/${propuesta.id}`, { method: 'POST', body: { decision: 'confirmar' } })

  assert.equal(repetida.estado, 409)
  assert.equal(repetida.cuerpo.error.code, 'ya_resuelta')
  assert.equal(PROCESOS.length, antes + 1)

  const otra = propuestaDe(await preguntar('Agrega una tarea de revisar los textos', 1))
  const rechazo = await pedir(clienta, `/portal/ia/acciones/${otra.id}`, { method: 'POST', body: { decision: 'rechazar' } })

  assert.deepEqual(rechazo.cuerpo.data, { id: otra.id, estado: 'rechazada' })
  assert.equal(PROCESOS.length, antes + 1)
})

test('confirmar revalida: si el interruptor se apago entre propuesta y clic, no se crea nada', async () => {
  await encenderOrbe()
  await interruptor(true)

  const propuesta = propuestaDe(await preguntar('Crea una tarea para el informe', 1))
  const antes = PROCESOS.length

  await interruptor(false)

  const decision = await pedir(clienta, `/portal/ia/acciones/${propuesta.id}`, { method: 'POST', body: { decision: 'confirmar' } })

  assert.equal(decision.estado, 404)
  assert.equal(PROCESOS.length, antes)
})

test('una decision invalida es 422 y una propuesta inexistente 404', async () => {
  await encenderOrbe()
  await interruptor(true)

  const propuesta = propuestaDe(await preguntar('Crea una tarea para el informe', 1))
  const mala = await pedir(clienta, `/portal/ia/acciones/${propuesta.id}`, { method: 'POST', body: { decision: 'quizas' } })

  assert.equal(mala.estado, 422)
  assert.equal((await pedir(clienta, '/portal/ia/acciones/999999', { method: 'POST', body: { decision: 'confirmar' } })).estado, 404)
})

test('sin pedir una Tarea, el chat sigue sin propuestas aunque el cliente pueda crearlas', async () => {
  await encenderOrbe()
  await interruptor(true)

  assert.equal(propuestaDe(await preguntar('¿Qué tareas esperan mi aprobación?', 1)), null)
})

test('un 429 al confirmar deja la propuesta pendiente y un 422 la deja fallida', async () => {
  process.env.PORTAL_TAREAS_ALTAS_POR_HORA = '1'
  await encenderOrbe()
  await interruptor(true)

  const primera = propuestaDe(await preguntar('Crea una tarea para el informe A', 1))
  const segunda = propuestaDe(await preguntar('Crea una tarea para el informe B', 1))

  assert.equal((await pedir(clienta, `/portal/ia/acciones/${primera.id}`, { method: 'POST', body: { decision: 'confirmar' } })).estado, 200)

  const tope = await pedir(clienta, `/portal/ia/acciones/${segunda.id}`, { method: 'POST', body: { decision: 'confirmar' } })

  assert.equal(tope.estado, 429)

  const hilo = (await pedir(clienta, '/portal/ia/chat?proyecto_id=1')).cuerpo.data.mensajes
  const estados = hilo.flatMap((m) => m.acciones ?? []).map((a) => [a.id, a.estado])

  assert.deepEqual(estados.find(([id]) => id === segunda.id), [segunda.id, 'pendiente'])

  // Con el interruptor apagado, confirmar es 404 y la propuesta queda fallida.
  delete process.env.PORTAL_TAREAS_ALTAS_POR_HORA
  await interruptor(false)
  assert.equal((await pedir(clienta, `/portal/ia/acciones/${segunda.id}`, { method: 'POST', body: { decision: 'confirmar' } })).estado, 404)

  const despues = (await pedir(clienta, '/portal/ia/chat?proyecto_id=1')).cuerpo.data.mensajes
  assert.equal(despues.flatMap((m) => m.acciones ?? []).find((a) => a.id === segunda.id).estado, 'fallida')
})

test('una fecha anterior a hoy es 422 anterior_al_inicio y start_date no se acepta', async () => {
  await interruptor(true)
  CLIENTES_SIN_VENCIMIENTO.add(1)

  assert.deepEqual((await crear({ name: 'Vieja', due_date: '2020-01-01' })).cuerpo.error.details, { due_date: ['anterior_al_inicio'] })
  assert.deepEqual((await crear({ name: 'Con inicio', start_date: '2027-01-01' })).cuerpo.error.details, { start_date: ['no_editable'] })
})
