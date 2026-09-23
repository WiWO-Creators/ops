/**
 * Pruebas de `GET /portal/resumen`, el dashboard del cliente.
 *
 * Van contra el servidor y no contra las funciones porque lo que el frontend programa es la **forma
 * de la respuesta**. Dos cosas son las que hay que dejar clavadas:
 *
 *  1. **El resumen y el listado cuentan lo mismo.** El resumen existe porque la portada sumaba en el
 *     navegador sobre una pagina de cien filas; si el agregado del servidor no coincidiera con la
 *     lista que el cliente puede abrir, el arreglo seria peor que el problema.
 *  2. **El desglose lista todos los estados, tambien los que estan en cero.** Asi la fila de
 *     insignias tiene la misma forma para todos los clientes y ninguno cree que perdio un Proyecto.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { ESTADOS_ESPACIO } from './datos.js'

let base
let headers

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const respuesta = await fetch(`${base}/auth/portal/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'clienta@acme.com', password: 'portal1234' })
  })

  headers = { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/**
 * Pide una ruta del portal con el contacto ya autenticado.
 *
 * @param {string} ruta Ruta sin la base.
 * @returns {Promise<{estado: number, datos: unknown}>}
 */
async function pedir (ruta) {
  const respuesta = await fetch(`${base}${ruta}`, { headers })
  const cuerpo = await respuesta.json()

  return { estado: respuesta.status, datos: cuerpo.data }
}

test('el total del resumen es el mismo que el del listado de Proyectos', async () => {
  const { datos: resumen } = await pedir('/portal/resumen')
  const { datos: proyectos } = await pedir('/portal/projects?per_page=100')

  assert.equal(resumen.espacios.total, proyectos.length)
})

test('el desglose trae todos los estados del catalogo, tambien los que estan en cero', async () => {
  const { datos } = await pedir('/portal/resumen')

  assert.deepEqual(
    datos.espacios.by_status.map((e) => e.status),
    ESTADOS_ESPACIO.map((e) => e.id)
  )
  assert.equal(datos.espacios.by_status.some((e) => e.total === 0), true)
})

test('el desglose suma el total de Proyectos', async () => {
  const { datos } = await pedir('/portal/resumen')
  const sumado = datos.espacios.by_status.reduce((suma, estado) => suma + estado.total, 0)

  assert.equal(sumado, datos.espacios.total)
})

test('esperando_tu_respuesta es un numero cuando se puede contar, y nunca falta', async () => {
  // Este contacto tiene Proyectos con la pestaña Tareas encendida, asi que la cuenta se puede hacer.
  // El `null` —que NO es 0— es el caso de los Proyectos sin esa pestaña, y no se alcanza desde acá.
  const { datos } = await pedir('/portal/resumen')

  assert.equal(Object.hasOwn(datos, 'esperando_tu_respuesta'), true)
  assert.equal(typeof datos.esperando_tu_respuesta, 'number')
})

test('los contadores de Tareas cierran entre si', async () => {
  const { datos } = await pedir('/portal/resumen')

  assert.equal(datos.procesos.open + datos.procesos.completed, datos.procesos.total)
  assert.equal(datos.procesos.completed_percent >= 0 && datos.procesos.completed_percent <= 100, true)
})

test('los hitos vencidos no pueden superar al total', async () => {
  const { datos } = await pedir('/portal/resumen')

  assert.equal(datos.hitos.overdue <= datos.hitos.total, true)
})

test('el resumen no cuelga de un Proyecto: un segmento de mas es 404', async () => {
  // Es la vista transversal de todos los Proyectos, igual que `/portal/me`. `/portal/resumen/1` no
  // es "el resumen del Proyecto 1": esa ruta ya existe y es `/portal/projects/1/overview`.
  const { estado } = await pedir('/portal/resumen/1')

  assert.equal(estado, 404)
})

test('un contacto que no verifico su correo no recibe el resumen', async () => {
  // El resumen agrega datos de TODOS los Proyectos del cliente, asi que esta detras de las mismas
  // puertas que cada uno: el correo verificado y el permiso de Proyectos. La portada trata ese 403
  // como "este bloque no es para vos" y sigue dibujando el resto; lo que no puede es mostrar ceros.
  const respuesta = await fetch(`${base}/auth/portal/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'sinverificar@nordelta.com', password: 'portal1234' })
  })

  const token = (await respuesta.json()).data.access_token
  const resumen = await fetch(`${base}/portal/resumen`, { headers: { authorization: `Bearer ${token}` } })

  assert.equal(resumen.status, 403)
})

test('proximos_hitos viaja siempre y cada fila dice a que Proyecto pertenece', async () => {
  // Es el detalle del contador `hitos` y comparte su puerta —ninguna—, asi que la clave no puede
  // faltar: una lista vacia significaria "no hay ninguno comprometido", no "no se".
  const { datos } = await pedir('/portal/resumen')

  assert.equal(Array.isArray(datos.proximos_hitos), true)

  for (const hito of datos.proximos_hitos) {
    assert.equal(typeof hito.project.id, 'number')
    assert.equal(typeof hito.project.name, 'string')
    assert.equal(typeof hito.vencido, 'boolean')
  }
})

test('los proximos hitos vienen por fecha ascendente y no superan al contador', async () => {
  const { datos } = await pedir('/portal/resumen')
  const fechas = datos.proximos_hitos.map((hito) => hito.due_date)

  assert.deepEqual(fechas, [...fechas].sort())
  assert.equal(datos.proximos_hitos.length <= datos.hitos.total, true)
  assert.equal(datos.proximos_hitos.filter((hito) => hito.vencido).length <= datos.hitos.overdue, true)
})

test('los bloqueados traen motivo, fecha y de quien dependen', async () => {
  const { datos } = await pedir('/portal/resumen')

  assert.equal(Object.hasOwn(datos, 'bloqueados'), true)

  for (const bloqueo of datos.bloqueados) {
    assert.equal(typeof bloqueo.motivo, 'string')
    assert.equal(typeof bloqueo.project.name, 'string')
    assert.equal(bloqueo.responsable === null || ['cliente', 'equipo', 'tercero'].includes(bloqueo.responsable), true)
    assert.equal(bloqueo.dias_bloqueada === null || typeof bloqueo.dias_bloqueada === 'number', true)
  }
})

test('los que dependen del cliente vienen primero, como en la API real', async () => {
  // Con seis lugares, dejar que un bloqueo nuestro empuje afuera uno suyo convierte la lista en
  // ruido: lo unico que el cliente puede destrabar solo es lo que depende de el.
  const { datos } = await pedir('/portal/resumen')
  const suyos = datos.bloqueados.map((bloqueo) => bloqueo.responsable === 'cliente')

  assert.deepEqual(suyos, [...suyos].sort((uno, otro) => Number(otro) - Number(uno)))
})

test('el fixture trae el caso de la fecha ilegible, que no es cero dias', async () => {
  // `dias_bloqueada` en `null` es "no se pudo leer la fecha". Sin una fila asi en el fixture, nadie
  // descubre que la pantalla lo pinta como "hace 0 dias" hasta que pasa en produccion.
  const { datos } = await pedir('/portal/resumen')

  assert.equal(datos.bloqueados.some((bloqueo) => bloqueo.dias_bloqueada === null), true)
  assert.equal(datos.bloqueados.some((bloqueo) => bloqueo.dias_bloqueada === 0), true)
})

test('tickets cuenta lo mismo que la bandeja y trae los ultimos con la forma de la API', async () => {
  const { datos } = await pedir('/portal/resumen')
  const { datos: bandeja } = await pedir('/portal/tickets?per_page=100')
  const abiertos = bandeja.filter((t) => t.status !== 5)

  assert.equal(datos.tickets.abiertos, abiertos.length)
  assert.ok(datos.tickets.esperando_tu_respuesta <= datos.tickets.abiertos)
  assert.ok(datos.tickets.ultimos.length <= 5)

  const [primero] = datos.tickets.ultimos
  assert.deepEqual(Object.keys(primero).sort(), ['id', 'last_reply', 'project', 'status', 'subject'])
  assert.deepEqual(Object.keys(primero.status).sort(), ['color', 'id', 'name'])
  assert.ok(datos.tickets.ultimos.every((t) => t.last_reply === null || /Z$/.test(t.last_reply)))

  // Abiertos primero: ningun cerrado antes de un abierto.
  const estados = datos.tickets.ultimos.map((t) => t.status.id === 5)
  assert.deepEqual(estados, [...estados].sort((a, b) => Number(a) - Number(b)))
})

test('tickets no viaja para un contacto sin la seccion de soporte', async () => {
  const respuesta = await fetch(`${base}/auth/portal/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'limitado@acme.com', password: 'portal1234' })
  })
  const token = (await respuesta.json()).data.access_token
  const resumen = await fetch(`${base}/portal/resumen`, { headers: { authorization: `Bearer ${token}` } })

  assert.ok(!('tickets' in (await resumen.json()).data))
})
