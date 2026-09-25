/**
 * Pruebas de la Supervisión diaria en el mock (v2, por jerarquía y con doble check).
 *
 * Lo que se deja clavado es que el mock conteste lo mismo que la API, para que la pantalla se pueda
 * probar en local sin que pase de más:
 *
 *  1. **La regla nueva de la hoja**: clientes (asociados o como Focal) ∪ Tareas de la gente a
 *     cargo; vence ese día, atrasada abierta o completada ese día; "Sin cliente" al final.
 *  2. **Solo el propio supervisor escribe**, y una hoja firmada es 409 para todo.
 *  3. **La compuerta del árbol**: la hoja ajena es 403 salvo que uno esté sobre esa persona.
 *  4. **La contrafirma**: confirmar o devolver, con sus 403, 409 y 422, y la firma anulada al devolver.
 *  5. **Las hojas del equipo**: solo la descendencia, solo hojas no vacías, directos primero.
 *  6. **Solo supervisa quien es lead o superior** (422), desde el cliente y desde la persona.
 *
 * El árbol del fixture: Ana (gerencia, admin) → Bruno (director) y Carla (gerencia); de Bruno
 * cuelgan Diego y Elena (leads); de Diego, Facundo y Gina; de Elena, Hugo (de baja).
 */

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { reiniciarSupervision } from './supervision.js'

const FECHA = '2026-09-25'

let base
const sesiones = {}

/** Entra con una cuenta del fixture —pasando el 2FA si lo tiene— y devuelve su autorización. */
async function entrar (email) {
  const cabeceras = { 'content-type': 'application/json' }
  let datos = (await (await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ email, password: 'mock1234' })
  })).json()).data

  if (datos.two_factor_required) {
    datos = (await (await fetch(`${base}/auth/2fa`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({ challenge_token: datos.challenge_token, code: '123456' })
    })).json()).data
  }

  return { authorization: `Bearer ${datos.access_token}` }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  for (const nombre of ['ana', 'bruno', 'carla', 'diego', 'elena', 'facundo']) {
    sesiones[nombre] = await entrar(`${nombre}@wiwo.me`)
  }
})

beforeEach(() => { reiniciarSupervision() })

after(() => {
  reiniciarSupervision()

  return new Promise((resolver) => servidor.close(resolver))
})

async function pedir (ruta, { como = 'ana', ...opciones } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...sesiones[como], 'content-type': 'application/json' }
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

async function hoja (como = 'ana', staffId = null) {
  const consulta = staffId === null ? '' : `&staff_id=${staffId}`

  return await pedir(`/supervision/hoja?fecha=${FECHA}${consulta}`, { como })
}

function revisar (cuerpo, como = 'ana') {
  return pedir(`/supervision/hoja/${FECHA}/revisiones`, { como, method: 'PUT', body: JSON.stringify(cuerpo) })
}

function firmar (como) {
  return pedir(`/supervision/hoja/${FECHA}/firma`, { como, method: 'POST', body: '{}' })
}

function contrafirmar (cuerpo, como = 'bruno') {
  return pedir(`/supervision/hoja/${FECHA}/confirmacion`, { como, method: 'POST', body: JSON.stringify(cuerpo) })
}

/** Todas las Tareas de una hoja, en una lista. */
const tareasDe = (datos) => datos.clientes.flatMap((c) => c.tareas)

test('la hoja de un lead: vence hoy, atrasadas abiertas, completadas hoy y sin cliente al final', async () => {
  const { estado, cuerpo } = await hoja('diego')
  const datos = cuerpo.data
  const tareas = tareasDe(datos)

  assert.equal(estado, 200)
  assert.equal(datos.puede_editar, true)
  assert.equal(datos.puede_confirmar, false)
  assert.equal(datos.confirmacion, null)

  for (const tarea of tareas) {
    const venceHoy = tarea.duedate === FECHA
    const atrasadaAbierta = !tarea.completada && tarea.duedate < FECHA
    const cerradaHoy = tarea.completada && tarea.completada_en?.slice(0, 10) === FECHA

    assert.ok(venceHoy || atrasadaAbierta || cerradaHoy, `la ${tarea.id} no debería estar`)
    assert.equal(tarea.completada, tarea.status === 5)
    if (tarea.completada) assert.equal(tarea.dias_atraso, 0)
    assert.deepEqual(tarea.revisiones_equipo, [])
  }

  assert.equal(datos.totales.tareas, tareas.length)
  assert.equal(datos.totales.completadas, tareas.filter((t) => t.completada).length)

  const cerrada = tareas.find((t) => t.id === 902)
  assert.equal(cerrada.completada_en, '2026-09-25 11:40:00')
  assert.deepEqual(cerrada.origen, ['cliente', 'equipo'])

  const ultimo = datos.clientes.at(-1)
  assert.equal(ultimo.client_id, null)
  assert.equal(ultimo.company, 'Sin cliente')
  assert.deepEqual(ultimo.tareas.map((t) => t.id), [901, 900])
  assert.ok(ultimo.tareas.every((t) => t.origen.join() === 'equipo'))
})

test('los clientes donde es Focal cuentan como suyos, con origen cliente', async () => {
  const { cuerpo } = await hoja('diego')
  const deRivera = cuerpo.data.clientes.find((c) => c.client_id === 7)

  // Diego no está asociado a Rivera (7): es su Focal.
  assert.ok(deRivera.tareas.length > 0)
  assert.ok(deRivera.tareas.every((t) => t.origen.includes('cliente')))

  const supervisores = (await pedir('/supervision/supervisores', { como: 'diego' })).cuerpo.data
  assert.deepEqual(supervisores, [{ staffid: 4, nombre: 'Diego Sosa', escalon: 'lead', clientes: 2 }])

  // La lista EXTRA no cambia: sigue siendo solo la tabla propia.
  const extra = (await pedir('/staff/4/supervision')).cuerpo.data
  assert.deepEqual(extra.map((c) => c.client_id), [3])
})

test('un staff no tiene hoja aunque haya Tareas vencidas', async () => {
  const { cuerpo } = await hoja('facundo')

  assert.deepEqual(cuerpo.data.clientes, [])
  assert.equal(cuerpo.data.totales.tareas, 0)
})

test('marcar, desmarcar y la nota demasiado larga', async () => {
  const tarea = tareasDe((await hoja()).cuerpo.data)[0]

  const marcada = await revisar({ task_id: tarea.id, estado: 'ok', nota: '  bien  ' })
  assert.equal(marcada.estado, 200)
  assert.equal(marcada.cuerpo.data.estado, 'ok')
  assert.equal(marcada.cuerpo.data.nota, 'bien')
  assert.equal((await hoja()).cuerpo.data.totales.ok, 1)

  const borrada = await revisar({ task_id: tarea.id, estado: null })
  assert.equal(borrada.estado, 200)
  assert.equal(borrada.cuerpo.data, null)
  assert.equal((await hoja()).cuerpo.data.totales.revisadas, 0)

  const larga = await revisar({ task_id: tarea.id, estado: 'no_ok', nota: 'x'.repeat(501) })
  assert.equal(larga.estado, 422)
})

test('422 si la tarea no está en la hoja o el estado es inválido', async () => {
  const tarea = tareasDe((await hoja()).cuerpo.data)[0]

  assert.equal((await revisar({ task_id: 999999, estado: 'ok' })).estado, 422)
  assert.equal((await revisar({ task_id: tarea.id, estado: 'quizas' })).estado, 422)
  assert.equal((await pedir('/supervision/hoja?fecha=2026-02-31')).estado, 422)
  assert.equal((await pedir('/supervision/equipo?fecha=2026-02-31')).estado, 422)
})

test('firmar cierra la hoja: 409 para revisar y para volver a firmar', async () => {
  const tarea = tareasDe((await hoja()).cuerpo.data)[0]
  await revisar({ task_id: tarea.id, estado: 'ok' })

  const firma = await firmar('ana')
  assert.equal(firma.estado, 200)
  assert.equal(firma.cuerpo.data.staffid, 1)

  const despues = (await hoja()).cuerpo.data
  assert.equal(despues.puede_editar, false)
  assert.equal(despues.puede_confirmar, false, 'nadie confirma la propia')
  assert.equal(despues.firma.nombre, 'Ana Ríos')

  assert.equal((await revisar({ task_id: tarea.id, estado: 'no_ok' })).estado, 409)
  assert.equal((await firmar('ana')).estado, 409)
})

test('la hoja vacía no se firma', async () => {
  const { estado } = await pedir('/supervision/hoja/2020-01-01/firma', { method: 'POST', body: '{}' })

  assert.equal(estado, 422)
})

test('la hoja ajena: la jefatura la lee sin editar, quien no está sobre ella recibe 403', async () => {
  const deDiego = await hoja('bruno', 4)
  assert.equal(deDiego.estado, 200)
  assert.equal(deDiego.cuerpo.data.puede_editar, false)

  assert.equal((await hoja('elena', 4)).estado, 403)
  assert.equal((await hoja('carla', 4)).estado, 403)
  assert.equal((await hoja('ana', 4)).estado, 200)
})

test('las revisiones del lead se ven en la hoja del director', async () => {
  await revisar({ task_id: 900, estado: 'no_ok', nota: 'Falta el anexo' }, 'diego')

  const deBruno = tareasDe((await hoja('bruno')).cuerpo.data).find((t) => t.id === 900)

  assert.deepEqual(deBruno.revisiones_equipo, [{ staffid: 4, nombre: 'Diego Sosa', estado: 'no_ok', nota: 'Falta el anexo' }])
  assert.equal(deBruno.revision, null)
})

test('confirmar: 409 sin firma, luego confirma, y confirmada queda cerrada del todo', async () => {
  assert.equal((await contrafirmar({ staff_id: 4, accion: 'confirmar' })).estado, 409)

  await firmar('diego')
  assert.equal((await hoja('bruno', 4)).cuerpo.data.puede_confirmar, true)

  const confirmada = await contrafirmar({ staff_id: 4, accion: 'confirmar' })
  assert.equal(confirmada.estado, 200)
  assert.equal(confirmada.cuerpo.data.estado, 'confirmada')
  assert.equal(confirmada.cuerpo.data.nota, null)

  const vista = (await hoja('bruno', 4)).cuerpo.data
  assert.equal(vista.puede_confirmar, false)
  assert.notEqual(vista.firma, null)

  assert.equal((await contrafirmar({ staff_id: 4, accion: 'devolver', nota: 'tarde' })).estado, 409)
  assert.equal((await contrafirmar({ staff_id: 4, accion: 'confirmar' })).estado, 409)
})

test('devolver anula la firma y reabre la hoja; al re-firmar la devolución se borra', async () => {
  await firmar('diego')

  const devuelta = await contrafirmar({ staff_id: 4, accion: 'devolver', nota: '  Revisa la 900  ' })
  assert.equal(devuelta.estado, 200)
  assert.deepEqual({ ...devuelta.cuerpo.data, en: null }, {
    estado: 'devuelta', staffid: 2, nombre: 'Bruno Cabral', nota: 'Revisa la 900', en: null
  })

  const propia = (await hoja('diego')).cuerpo.data
  assert.equal(propia.firma, null)
  assert.equal(propia.puede_editar, true)
  assert.equal(propia.confirmacion.estado, 'devuelta')
  assert.equal((await revisar({ task_id: 900, estado: 'ok' }, 'diego')).estado, 200)

  assert.equal((await firmar('diego')).estado, 200)
  assert.equal((await hoja('diego')).cuerpo.data.confirmacion, null)
})

test('la contrafirma: 403 a sí mismo o a quien no cuelga de uno, 422 sin nota o con acción inválida', async () => {
  await firmar('diego')

  assert.equal((await contrafirmar({ staff_id: 4, accion: 'confirmar' }, 'diego')).estado, 403)
  assert.equal((await contrafirmar({ staff_id: 4, accion: 'confirmar' }, 'elena')).estado, 403)
  assert.equal((await contrafirmar({ staff_id: 4, accion: 'confirmar' }, 'carla')).estado, 403)

  const sinNota = await contrafirmar({ staff_id: 4, accion: 'devolver', nota: '   ' })
  assert.equal(sinNota.estado, 422)
  assert.deepEqual(sinNota.cuerpo.error.details, { nota: ['required'] })

  assert.equal((await contrafirmar({ staff_id: 4, accion: 'aprobar' })).estado, 422)
  assert.equal((await contrafirmar({ staff_id: 4, accion: 'devolver', nota: 'x'.repeat(501) })).estado, 422)

  // La administración confirma aunque no esté en la rama directa.
  assert.equal((await contrafirmar({ staff_id: 4, accion: 'confirmar' }, 'ana')).estado, 200)
})

test('hojas del equipo: la descendencia con hoja no vacía, directos primero, con su estado', async () => {
  const antes = (await pedir(`/supervision/equipo?fecha=${FECHA}`, { como: 'bruno' })).cuerpo.data

  assert.deepEqual(antes.map((f) => [f.staffid, f.estado]), [[4, 'sin_firmar'], [5, 'sin_firmar']])
  assert.equal(antes[0].jefe_staffid, 2)
  assert.deepEqual(Object.keys(antes[0].totales).sort(), ['completadas', 'revisadas', 'tareas'])

  await firmar('diego')
  await firmar('elena')
  await contrafirmar({ staff_id: 5, accion: 'devolver', nota: 'Incompleta' })

  const despues = (await pedir(`/supervision/equipo?fecha=${FECHA}`, { como: 'bruno' })).cuerpo.data
  assert.deepEqual(despues.map((f) => f.estado), ['firmada', 'devuelta'])
  assert.ok(despues[0].firmado_en)
  assert.equal(despues[1].confirmacion.nota, 'Incompleta')

  const deAna = (await pedir(`/supervision/equipo?fecha=${FECHA}`)).cuerpo.data
  assert.deepEqual(deAna.map((f) => f.staffid), [2, 3, 4, 5], 'directos (Bruno, Carla) primero')

  assert.deepEqual((await pedir(`/supervision/equipo?fecha=${FECHA}`, { como: 'diego' })).cuerpo.data, [])
  assert.deepEqual((await pedir('/supervision/equipo?fecha=2020-01-01', { como: 'bruno' })).cuerpo.data, [])
})

test('supervisores visibles: por clientes o por gente a cargo', async () => {
  const deAna = await pedir('/supervision/supervisores')
  assert.deepEqual(deAna.cuerpo.data.map((s) => s.staffid).sort(), [1, 2, 3, 4, 5])
  assert.equal(deAna.cuerpo.data.find((s) => s.staffid === 1).clientes, 4)

  const deBruno = await pedir('/supervision/supervisores', { como: 'bruno' })
  assert.deepEqual(deBruno.cuerpo.data.map((s) => s.staffid), [2, 4, 5])

  const deElena = await pedir('/supervision/supervisores', { como: 'elena' })
  assert.deepEqual(deElena.cuerpo.data, [{ staffid: 5, nombre: 'Elena Paz', escalon: 'lead', clientes: 0 }])
})

test('solo supervisa quien es lead o superior', async () => {
  const conStaff = await pedir('/clients/5/supervisores', { method: 'PUT', body: JSON.stringify({ staff_ids: [6] }) })
  assert.equal(conStaff.estado, 422)
  assert.deepEqual(conStaff.cuerpo.error.details, { staff_ids: ['invalid'] })

  const conLead = await pedir('/clients/5/supervisores', { method: 'PUT', body: JSON.stringify({ staff_ids: [5] }) })
  assert.equal(conLead.estado, 200)
  assert.deepEqual(conLead.cuerpo.data.map((s) => s.staffid), [5])

  const persona = await pedir('/staff/5/supervision')
  assert.deepEqual(persona.cuerpo.data, [{ client_id: 5, company: 'Costa Norte' }])

  const aStaff = await pedir('/staff/6/supervision', { method: 'PUT', body: JSON.stringify({ client_ids: [1] }) })
  assert.equal(aStaff.estado, 422)
})

test('la persona reemplaza sus clientes sin tocar a los otros supervisores', async () => {
  const guardado = await pedir('/staff/4/supervision', { method: 'PUT', body: JSON.stringify({ client_ids: [1, 3] }) })

  assert.equal(guardado.estado, 200)
  assert.deepEqual(guardado.cuerpo.data.map((c) => c.client_id), [1, 3])

  const delCliente = await pedir('/clients/1/supervisores')
  assert.deepEqual(delCliente.cuerpo.data.map((s) => s.staffid).sort(), [1, 4])

  const inexistente = await pedir('/staff/4/supervision', { method: 'PUT', body: JSON.stringify({ client_ids: [999] }) })
  assert.equal(inexistente.estado, 422)
})
