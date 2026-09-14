/**
 * Pruebas del panel de accesos — los dos ejes del modelo de permisos nuevo.
 *
 * Van contra el servidor y no contra una función porque lo que importa es la puerta: quién entra y
 * qué se rechaza. Cuatro cosas que, si se rompen, no se ven hasta producción:
 *
 *   1. Que **solo un superadministrador** administre accesos, y **nunca su propio escalón**.
 *   2. Que los escalones sean **los cuatro fijos**: no se crean, no se borran, y uno inventado es 422.
 *   3. Que el árbol no se pueda **cerrar sobre sí mismo** —ni con un jefe inexistente, ni poniéndose
 *      a uno mismo, ni colgando a alguien de su propio descendiente—.
 *   4. Que `permissions` sea **el mismo juego para todo el que no es administrador**: en el modelo
 *      nuevo lo que cambia entre dos personas es cuántas filas ven, no qué pueden hacer.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { STAFF } from './datos.js'

let base
let tokenSuper
let tokenComun

// Ana es la única superadministradora del fixture; Carla es staff común (Bruno tiene 2FA y su login
// no devuelve token en un paso).
const ANA = STAFF[0]
const CARLA = STAFF[2]

async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return (await respuesta.json()).data.access_token
}

/** Una lectura autenticada, con el estado y el cuerpo ya parseados. */
async function leer (ruta, token = tokenSuper) {
  const respuesta = await fetch(`${base}/${ruta}`, { headers: { authorization: `Bearer ${token}` } })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

/** Escribe una persona del panel de accesos. */
async function editarPersona (staffId, cambio, token = tokenSuper) {
  const respuesta = await fetch(`${base}/accesos/personas/${staffId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cambio)
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  tokenSuper = await entrar('ana@wiwo.me')
  tokenComun = await entrar('carla@wiwo.me')
})

after(async () => {
  // El fixture vive en memoria del módulo: dejarlo movido le cambia el árbol a las demás pruebas.
  await editarPersona(CARLA.id, { escalon: 'director', jefe_staffid: ANA.id })
  await new Promise((resolver) => servidor.close(resolver))
})

test('un staff común no entra al panel de accesos', async () => {
  const { estado, cuerpo } = await leer('accesos/catalogo', tokenComun)

  assert.equal(estado, 403)
  assert.equal(cuerpo.error.code, 'forbidden')
})

test('el catálogo trae los cuatro escalones fijos, con su gente, y un solo interruptor', async () => {
  const { estado, cuerpo } = await leer('accesos/catalogo')

  assert.equal(estado, 200)
  assert.deepEqual(
    cuerpo.data.escalones.map((escalon) => [escalon.clave, escalon.nombre, escalon.orden]),
    [['staff', 'Staff', 1], ['lead', 'Lead', 2], ['director', 'Director', 3], ['gerencia', 'Gerencia', 4]]
  )
  assert.equal(
    cuerpo.data.escalones.reduce((total, escalon) => total + escalon.personas, 0),
    STAFF.length,
    'cada persona cuenta en exactamente un escalón'
  )
  assert.deepEqual(cuerpo.data.interruptores.map((uno) => uno.clave), ['wiwo_permisos_jerarquia'])
  assert.equal(cuerpo.data.roles, undefined, 'el mapa de rol a escalón se fue con el modelo viejo')
  assert.equal(cuerpo.data.alcances, undefined, 'el alcance sale del árbol, no de una lista')
  assert.deepEqual(cuerpo.data.features.projects, ['view', 'create', 'edit', 'delete', 'edit_milestones'])
})

test('los escalones y los roles ya no tienen puerta propia', async () => {
  for (const ruta of ['accesos/escalones', 'accesos/roles']) {
    const alta = await fetch(`${base}/${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenSuper}` },
      body: JSON.stringify({ nombre: 'Inventado', clave: 'inventado', orden: 9 })
    })

    assert.equal(alta.status, 404, ruta)
    await alta.arrayBuffer()
  }
})

test('el listado de personas trae el escalón, el jefe y su nombre, y filtra por escalón', async () => {
  const { estado, cuerpo } = await leer('accesos/personas')

  assert.equal(estado, 200)

  const carla = cuerpo.data.find((persona) => persona.staffid === CARLA.id)

  assert.deepEqual(
    Object.keys(carla).sort(),
    ['activo', 'area_id', 'area_ids', 'cargo_id', 'correo', 'escalon', 'jefe_nombre', 'jefe_staffid', 'nombre', 'staffid']
  )
  assert.equal(carla.jefe_staffid, ANA.id)
  assert.equal(carla.jefe_nombre, ANA.full_name)
  assert.equal(cuerpo.meta.pagination.total, STAFF.length)

  const soloStaff = await leer('accesos/personas?escalon=staff')

  assert.equal(soloStaff.cuerpo.data.every((persona) => persona.escalon === 'staff'), true)
  assert.equal(soloStaff.cuerpo.data.length < STAFF.length, true, 'el filtro recorta de verdad')
})

test('un escalón inventado es 422 y el propio es 409', async () => {
  const invalido = await editarPersona(CARLA.id, { escalon: 'head' })

  assert.equal(invalido.estado, 422)
  assert.deepEqual(invalido.cuerpo.error.details.escalon, ['invalid'])

  const propio = await editarPersona(ANA.id, { escalon: 'lead' })

  assert.equal(propio.estado, 409)
})

test('mover a alguien de escalón y de jefe se ve en el listado y en el árbol', async () => {
  const movida = await editarPersona(CARLA.id, { escalon: 'lead', jefe_staffid: STAFF[1].id })

  assert.equal(movida.estado, 200)
  assert.deepEqual(movida.cuerpo.data, { staffid: CARLA.id })

  const fila = (await leer('accesos/personas')).cuerpo.data.find((persona) => persona.staffid === CARLA.id)

  assert.equal(fila.escalon, 'lead')
  assert.equal(fila.jefe_staffid, STAFF[1].id)

  const arbol = await leer('accesos/arbol')

  assert.equal(arbol.estado, 200)
  assert.equal(arbol.cuerpo.data.every((persona) => persona.jefe_staffid !== undefined), true)
  assert.equal(
    arbol.cuerpo.data.some((persona) => persona.staffid === STAFF[STAFF.length - 1].id),
    false,
    'una baja no manda a nadie: el árbol es de gente activa'
  )
  assert.deepEqual(
    arbol.cuerpo.data.find((persona) => persona.staffid === CARLA.id),
    { staffid: CARLA.id, nombre: CARLA.full_name, escalon: 'lead', jefe_staffid: STAFF[1].id }
  )
})

test('el jefe inexistente, el propio y el que cierra un ciclo vuelven con 422 y su motivo', async () => {
  const casos = [
    [{ jefe_staffid: 999999 }, 'unknown'],
    [{ jefe_staffid: CARLA.id }, 'propio'],
    // Diego cuelga de Bruno, que cuelga de Ana: colgar a Ana de Diego cierra el árbol sobre sí mismo.
    [{ jefe_staffid: STAFF[3].id }, 'ciclo']
  ]

  for (const [cambio, motivo] of casos) {
    const objetivo = motivo === 'ciclo' ? ANA.id : CARLA.id
    const { estado, cuerpo } = await editarPersona(objetivo, cambio)

    assert.equal(estado, 422, motivo)
    assert.deepEqual(cuerpo.error.details.jefe_staffid, [motivo])
  }
})

test('desenganchar deja a la persona sin jefe', async () => {
  const suelta = await editarPersona(CARLA.id, { jefe_staffid: null })

  assert.equal(suelta.estado, 200)

  const fila = (await leer('accesos/personas')).cuerpo.data.find((persona) => persona.staffid === CARLA.id)

  assert.equal(fila.jefe_staffid, null)
  assert.equal(fila.jefe_nombre, null)
})

test('el interruptor de jerarquía se escribe; cualquier otra clave es 422', async () => {
  const escribir = (cuerpo) => fetch(`${base}/accesos/interruptores`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenSuper}` },
    body: JSON.stringify(cuerpo)
  })

  const apagado = await escribir({ wiwo_permisos_jerarquia: '0' })

  assert.equal(apagado.status, 200)
  assert.equal((await apagado.json()).data[0].valor, '0')

  const desconocido = await escribir({ wiwo_permisos_alcance: '1' })

  assert.equal(desconocido.status, 422)
  assert.deepEqual((await desconocido.json()).error.details.wiwo_permisos_alcance, ['desconocido'])

  const encendido = await escribir({ wiwo_permisos_jerarquia: '1' })

  assert.equal(encendido.status, 200)
  assert.equal((await encendido.json()).data[0].valor, '1')
})

test('/me trae los dos ejes y el mismo juego de permisos para todo el que no es administrador', async () => {
  const mia = await leer('me', tokenComun)

  assert.equal(mia.estado, 200)
  assert.equal(mia.cuerpo.data.nivel, undefined, 'el nivel viejo se fue')
  assert.equal(mia.cuerpo.data.modelo_permisos, undefined, 'el modelo consolidado se fue')
  assert.equal(typeof mia.cuerpo.data.escalon, 'string')
  assert.equal('jefe_staffid' in mia.cuerpo.data, true)
  assert.equal(typeof mia.cuerpo.data.es_jefatura, 'boolean')
  assert.deepEqual(mia.cuerpo.data.permissions, {
    tasks: ['view', 'create', 'edit', 'delete'],
    projects: ['view', 'create', 'edit', 'delete', 'edit_milestones'],
    customers: ['view', 'create', 'edit', 'delete'],
    staff: ['view'],
    leads: ['view', 'delete']
  })

  const suya = await leer('me', tokenSuper)

  assert.deepEqual(suya.cuerpo.data.permissions.invoices, ['view', 'create', 'edit', 'delete'],
    'quien administra sí ve las facturas')
  assert.equal(suya.cuerpo.data.es_jefatura, true, 'Ana dirige un área y tiene gente colgando')
})

test('el catálogo de permisos por persona se fue con la matriz', async () => {
  const { estado } = await leer('roles/catalogo')

  assert.equal(estado, 404)
})
