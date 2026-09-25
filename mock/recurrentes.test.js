/**
 * Pruebas de `GET /tasks/recurrentes` y `POST /tasks/recurrentes/importar` del mock.
 *
 * Contra el servidor, no contra las funciones: lo que la pantalla consume es la respuesta HTTP, y lo
 * que se rompe en silencio es la forma —una clave de mas que la API no manda, un 200 donde la API
 * contesta 422—.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { interpretarFrecuencia, proximaCopia } from './recurrentes.js'
import { ESPACIOS, STAFF } from './datos.js'

let base
let cabeceras

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })
  cabeceras = { 'content-type': 'application/json', authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Las claves exactas de una regla en la API (`RecursoRecurrentes::presentar()`). */
const CLAVES_API = [
  'assignees', 'client', 'copies_count', 'cycles', 'frequency_label', 'id', 'last_copy', 'name', 'next_date',
  'paused', 'paused_at', 'project', 'recurring_type', 'recurring_until', 'repeat_every', 'skip_weekdays', 'start_date',
  'state', 'status', 'total_cycles', 'usage'
]

test('el listado trae las reglas con la forma exacta de la API, ordenadas por estado', async () => {
  const respuesta = await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })
  assert.equal(respuesta.status, 200)
  const { data, meta } = await respuesta.json()

  assert.ok(data.length >= 5)
  assert.equal(meta.total, data.length)
  for (const regla of data) assert.deepEqual(Object.keys(regla).sort(), CLAVES_API)

  const estados = data.map((regla) => regla.state)
  assert.ok(estados.includes('sin_calcular') && estados.includes('atrasada') && estados.includes('activa'))
  assert.equal(estados[0], 'sin_calcular', 'Lo que pide atencion va primero')
  assert.ok(data.some((regla) => regla.last_copy !== null && regla.copies_count > 0))
})

test('los filtros son enteros y filtran; un filtro basura es 422, no la lista entera', async () => {
  const espacio = ESPACIOS[0].id
  const filtrada = await (await fetch(`${base}/tasks/recurrentes?filter[project_id]=${espacio}`, { headers: cabeceras })).json()
  assert.ok(filtrada.data.every((regla) => regla.project?.id === espacio))

  const basura = await fetch(`${base}/tasks/recurrentes?filter[assignee]=abc`, { headers: cabeceras })
  assert.equal(basura.status, 422)
  assert.deepEqual((await basura.json()).error.details, { assignee: ['integer'] })
})

test('validar devuelve el parte por fila sin crear nada', async () => {
  const antes = (await (await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })).json()).data.length
  const respuesta = await fetch(`${base}/tasks/recurrentes/importar`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      modo: 'validar',
      filas: [
        { tarea: 'Informe de pauta', frecuencia: 'Mensual', responsable: STAFF[1].email, proyecto_id: String(ESPACIOS[0].id), fecha_inicio: '01/10/2026', vencimiento_dias: '3', fin: '31/12/2026' },
        { tarea: 'Cierre', frecuencia: 'el primer lunes', responsable: '1', proyecto_id: '1' },
        { tarea: 'Cierre', frecuencia: 'semanal', responsable: 'nadie@wiwo.me', proyecto_id: '1' },
        { tarea: 'Cierre', frecuencia: 'semanal', responsable: '1', proyecto_id: '99999' },
        { tarea: '', frecuencia: '', responsable: '', proyecto_id: '' }
      ]
    })
  })
  assert.equal(respuesta.status, 200)
  const { data } = await respuesta.json()

  assert.equal(data.validas, 1)
  assert.equal(data.invalidas, 4)
  assert.equal(data.filas[0].errores, null, 'Sin errores es null, no un objeto vacio')
  assert.deepEqual(data.filas[0].vista, {
    tarea: 'Informe de pauta', frecuencia: 'Cada mes', responsable_id: STAFF[1].id, proyecto_id: ESPACIOS[0].id,
    fecha_inicio: '2026-10-01', vencimiento: '2026-10-04', ciclos: 0, hasta: '2026-12-31'
  })
  assert.deepEqual(data.filas[1].errores, { frecuencia: ['no_soportada'] })
  assert.deepEqual(data.filas[2].errores, { responsable: ['no_existe'] })
  assert.deepEqual(data.filas[3].errores, { proyecto_id: ['sin_acceso'] })
  assert.deepEqual(data.filas[4].errores, { fila: ['vacia'] })

  const despues = (await (await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })).json()).data.length
  assert.equal(despues, antes)
})

test('aplicar con una fila mala es 422 y no crea; sin errores crea todas', async () => {
  const buena = { tarea: 'Respaldo del sitio', frecuencia: 'cada 2 semanas', responsable: '1', proyecto_id: String(ESPACIOS[1].id), fin: '6 veces' }
  const rechazo = await fetch(`${base}/tasks/recurrentes/importar`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ modo: 'aplicar', filas: [buena, { ...buena, frecuencia: 'a veces' }] })
  })
  assert.equal(rechazo.status, 422)
  assert.deepEqual((await rechazo.json()).error.details, { 'filas.1.frecuencia': ['no_soportada'] })

  const aplicada = await fetch(`${base}/tasks/recurrentes/importar`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ modo: 'aplicar', filas: [buena] })
  })
  assert.equal(aplicada.status, 201)
  const { data } = await aplicada.json()
  assert.equal(data.creadas.length, 1)

  const tarea = (await (await fetch(`${base}/tasks/${data.creadas[0].task_id}`, { headers: cabeceras })).json()).data
  assert.equal(tarea.recurring, true)
  assert.equal(tarea.repeat_every, 2)
  assert.equal(tarea.recurring_type, 'week')
  assert.equal(tarea.cycles, 6)
})

test('dejar de repetir apaga la recurrencia y la regla sale del listado', async () => {
  const { data } = await (await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })).json()
  // Ni la de dias excluidos ni la 501: las usan las pruebas de abajo.
  const regla = data.find((r) => r.state === 'activa' && r.skip_weekdays.length === 0 && r.id !== 501)

  const respuesta = await fetch(`${base}/tasks/${regla.id}`, { method: 'PATCH', headers: cabeceras, body: JSON.stringify({ recurring: false }) })
  assert.equal(respuesta.status, 200)
  const tarea = (await respuesta.json()).data
  assert.equal(tarea.recurring, false)
  assert.equal(tarea.recurring_until, null)

  const despues = (await (await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })).json()).data
  assert.ok(!despues.some((r) => r.id === regla.id))
})

test('la frecuencia y la proxima copia se calculan como en la API', () => {
  assert.deepEqual(interpretarFrecuencia('Quincenal'), [2, 'week'])
  assert.deepEqual(interpretarFrecuencia('cada 10 días'), [10, 'day'])
  assert.equal(interpretarFrecuencia('el primer lunes'), null)

  const regla = { status: 1, repeat_every: 1, recurring_type: 'week', cycles: 0, total_cycles: 0, start_date: '2026-09-01' }
  assert.equal(proximaCopia({ ...regla, last_recurring_date: '2026-09-21' }, '2026-09-23'), '2026-09-28')
  assert.equal(proximaCopia({ ...regla, last_recurring_date: '2026-09-01' }, '2026-09-23'), '2026-09-22')
  assert.equal(proximaCopia({ ...regla, last_recurring_date: '2026-09-21', recurring_until: '2026-09-27' }, '2026-09-23'), null)
})

/** PATCH de una Tarea, devuelve estado y cuerpo. */
async function parchar (id, cuerpo) {
  const respuesta = await fetch(`${base}/tasks/${id}`, { method: 'PATCH', headers: cabeceras, body: JSON.stringify(cuerpo) })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

/** La regla de una Tarea en el listado, o undefined. */
async function reglaDe (id) {
  const { data } = await (await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })).json()

  return data.find((regla) => regla.id === id)
}

test('el fixture siembra una regla pausada y una con dias excluidos, y la pausada va tras las activas', async () => {
  const { data } = await (await fetch(`${base}/tasks/recurrentes`, { headers: cabeceras })).json()
  const pausada = data.find((regla) => regla.state === 'pausada')
  assert.ok(pausada !== undefined)
  assert.equal(pausada.paused, true)
  assert.equal(pausada.next_date, null)
  assert.equal(typeof pausada.paused_at, 'string')

  const habiles = data.find((regla) => regla.skip_weekdays.length > 0)
  assert.deepEqual(habiles.skip_weekdays, [6, 7])
  assert.equal(habiles.frequency_label, 'Cada día, salvo sábado y domingo')

  const estados = data.map((regla) => regla.state)
  assert.ok(estados.lastIndexOf('activa') < estados.indexOf('pausada'))
  assert.ok(estados.indexOf('pausada') < estados.indexOf('terminada'))
})

test('pausar conserva la regla y reanudar no crea las copias atrasadas', async () => {
  const antes = await reglaDe(503)
  assert.equal(antes.state, 'atrasada')

  const pausa = await parchar(503, { recurring_paused: true })
  assert.equal(pausa.estado, 200)
  assert.equal(pausa.cuerpo.data.recurring_paused, true)
  assert.equal(typeof pausa.cuerpo.data.recurring_paused_at, 'string')
  assert.equal(pausa.cuerpo.data.repeat_every, 2, 'La regla se conserva')

  const pausada = await reglaDe(503)
  assert.equal(pausada.state, 'pausada')
  assert.equal(pausada.next_date, null)

  const reanuda = await parchar(503, { recurring_paused: false })
  assert.equal(reanuda.estado, 200)
  assert.equal(reanuda.cuerpo.data.recurring_paused_at, null)

  const reanudada = await reglaDe(503)
  const hoy = new Date().toISOString().slice(0, 10)
  assert.equal(reanudada.state, 'activa')
  assert.ok(reanudada.next_date >= hoy, 'La proxima copia es de hoy en adelante')
})

test('pausar una Tarea que no es recurrente es 422 sin_recurrencia', async () => {
  const { estado, cuerpo } = await parchar(500, { recurring_paused: true })
  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details, { recurring_paused: ['sin_recurrencia'] })

  const noBooleano = await parchar(501, { recurring_paused: 'si' })
  assert.deepEqual(noBooleano.cuerpo.error.details, { recurring_paused: ['no_booleano'] })
})

test('los dias excluidos exigen recurring, se validan, se conservan si no vienen y se borran al dejar de repetir', async () => {
  const regla = { recurring: true, repeat_every: 1, recurring_type: 'day', cycles: 0 }

  assert.deepEqual((await parchar(501, { skip_weekdays: [6, 7] })).cuerpo.error.details, { recurring: ['requerido'] })
  assert.deepEqual((await parchar(501, { ...regla, skip_weekdays: [1, 2, 3, 4, 5, 6, 7] })).cuerpo.error.details, { skip_weekdays: ['excluye_todos'] })
  assert.deepEqual((await parchar(501, { ...regla, skip_weekdays: [6, 6] })).cuerpo.error.details, { skip_weekdays: ['repetido'] })
  assert.deepEqual((await parchar(501, { ...regla, skip_weekdays: [0] })).cuerpo.error.details, { skip_weekdays: ['invalid'] })
  assert.deepEqual((await parchar(501, { recurring: false, skip_weekdays: [] })).cuerpo.error.details, { skip_weekdays: ['sobra_sin_recurrencia'] })

  const guardada = await parchar(501, { ...regla, skip_weekdays: [7, 6] })
  assert.equal(guardada.estado, 200)
  assert.deepEqual(guardada.cuerpo.data.skip_weekdays, [6, 7])

  const sinDias = await parchar(501, { ...regla, repeat_every: 2 })
  assert.deepEqual(sinDias.cuerpo.data.skip_weekdays, [6, 7], 'Ausente no se toca')
  assert.equal((await reglaDe(501)).frequency_label, 'Cada 2 días, salvo sábado y domingo')

  const limpia = await parchar(501, { ...regla, skip_weekdays: [] })
  assert.deepEqual(limpia.cuerpo.data.skip_weekdays, [])

  await parchar(501, { recurring_paused: true })
  const apagada = await parchar(501, { recurring: false })
  assert.equal(apagada.cuerpo.data.recurring_paused, false)
  assert.deepEqual(apagada.cuerpo.data.skip_weekdays, [])
})

test('la vista previa cuenta las fechas saltando los dias excluidos, sin escribir', async () => {
  const previa = async (cuerpo) => {
    const respuesta = await fetch(`${base}/tasks/recurrentes/previa`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) })
    return { estado: respuesta.status, cuerpo: await respuesta.json() }
  }

  // 2030-01-07 es lunes.
  const habiles = await previa({ start_date: '2030-01-07', repeat_every: 1, recurring_type: 'day', skip_weekdays: [6, 7] })
  assert.equal(habiles.estado, 200)
  assert.deepEqual(habiles.cuerpo.data, {
    frequency_label: 'Cada día, salvo sábado y domingo',
    dates: ['2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-14'],
    none: false
  })

  const tope = await previa({ start_date: '2030-01-07', repeat_every: 1, recurring_type: 'week', cycles: 2, cantidad: 12 })
  assert.deepEqual(tope.cuerpo.data.dates, ['2030-01-14', '2030-01-21'])

  // Semanal desde un sabado, excluyendo el sabado: nunca genera.
  const nunca = await previa({ start_date: '2030-01-05', repeat_every: 1, recurring_type: 'week', skip_weekdays: [6] })
  assert.deepEqual(nunca.cuerpo.data, { frequency_label: 'Cada semana, salvo sábado', dates: [], none: true })

  assert.deepEqual((await previa({ repeat_every: 1, recurring_type: 'day' })).cuerpo.error.details, { start_date: ['requerido'] })
  assert.deepEqual((await previa({ start_date: '2030-01-07', repeat_every: 1, recurring_type: 'day', skip_weekdays: [1, 2, 3, 4, 5, 6, 7] })).cuerpo.error.details,
    { skip_weekdays: ['excluye_todos'] })
  assert.deepEqual((await previa({ start_date: '2030-01-07', repeat_every: 0, recurring_type: 'day', cantidad: 13 })).cuerpo.error.details,
    { cantidad: ['fuera_de_rango'], repeat_every: ['fuera_de_rango'] })
  assert.deepEqual((await previa({ task_id: 999999, repeat_every: 1, recurring_type: 'day' })).cuerpo.error.details, { task_id: ['no_existe'] })

  const conTarea = await previa({ task_id: 502, repeat_every: 1, recurring_type: 'month', cycles: 12 })
  assert.equal(conTarea.estado, 200)
  assert.equal(conTarea.cuerpo.data.none, false)
  assert.ok(conTarea.cuerpo.data.dates.length <= 9, 'Descuenta las copias ya hechas')
})

test('la proxima copia salta los dias excluidos y es null si la regla nunca cae en uno valido', () => {
  // 2026-09-25 es viernes.
  const diaria = { status: 1, repeat_every: 1, recurring_type: 'day', cycles: 0, total_cycles: 0, start_date: '2026-09-01', skip_weekdays: [6, 7] }
  assert.equal(proximaCopia({ ...diaria, last_recurring_date: '2026-09-25' }, '2026-09-25'), '2026-09-28')
  const sabados = { status: 1, repeat_every: 1, recurring_type: 'week', cycles: 0, total_cycles: 0, start_date: '2026-09-26', skip_weekdays: [6] }
  assert.equal(proximaCopia(sabados, '2026-09-25'), null)
})
