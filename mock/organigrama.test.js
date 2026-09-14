/**
 * Pruebas de `GET /organigrama` en el mock.
 *
 * Van contra el servidor y no contra una función porque lo que importa es el recorte: **quién ve qué
 * parte**. Es la pieza que la pantalla NO repite —la API ya recorta— y por eso, si acá se rompe, en
 * la pantalla no hay nada que lo detecte.
 *
 * Cuatro cosas que, si se rompen, no se ven hasta producción:
 *
 *   1. Que administración vea la casa entera, y que el resto vea sólo su parte.
 *   2. Que `personas` y `leads` de cada tarjeta cuenten **lo visible**, o la tarjeta prometería gente
 *      que al entrar no aparece.
 *   3. Que `puede_editar` sea superadministración y nada más: la pantalla esconde la edición con eso.
 *   4. Que la gente sin área viaje con `area_id: null` en vez de esconderse.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { AREAS, STAFF } from './datos.js'

let base
let tokenSuper
let tokenComun

// Ana es la única superadministradora del fixture; Carla es staff común y dirige el área Analytics
// (Bruno tiene 2FA y su login no devuelve token en un paso).
const ANA = STAFF[0]
const CARLA = STAFF[2]
const GINA = STAFF[6]

async function entrar (email) {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'mock1234' })
  })

  return (await respuesta.json()).data.access_token
}

/** El organigrama tal como lo ve quien tenga ese token. */
async function organigrama (token = tokenSuper) {
  const respuesta = await fetch(`${base}/organigrama`, {
    headers: { authorization: `Bearer ${token}` }
  })

  return { estado: respuesta.status, datos: (await respuesta.json()).data }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  tokenSuper = await entrar('ana@wiwo.me')
  tokenComun = await entrar('carla@wiwo.me')
})

after(async () => {
  await new Promise((resolver) => servidor.close(resolver))
})

test('administración ve la casa entera, áreas vacías incluidas', async () => {
  const { estado, datos } = await organigrama()

  assert.equal(estado, 200)
  assert.equal(datos.areas.length, AREAS.length)
  assert.equal(datos.personas.length, STAFF.length)
  // Sin las áreas vacías el mapa escondería justo las que hay que llenar: doce de las diecisiete
  // están sin gente en el fixture, igual que el día después de la migración.
  assert.ok(datos.areas.some((area) => area.personas === 0))
})

test('puede_editar es superadministración y nada más', async () => {
  assert.equal((await organigrama()).datos.yo.puede_editar, true)
  assert.equal((await organigrama(tokenComun)).datos.yo.puede_editar, false)
})

test('quien no administra ve su rama, su cadena hacia arriba y su área, no la casa', async () => {
  const { datos } = await organigrama(tokenComun)
  const ids = datos.personas.map((persona) => persona.staffid)

  assert.equal(datos.yo.staffid, CARLA.id)
  assert.ok(ids.includes(CARLA.id), 'se ve a sí misma')
  assert.ok(ids.includes(ANA.id), 've a su jefa')
  // Gina no tiene área y no cuelga de la rama de Carla: no tiene por qué aparecerle.
  assert.ok(!ids.includes(GINA.id), 'no ve a quien no está ni en su rama ni en su área')
  assert.ok(ids.length < STAFF.length)
})

test('las cuentas de cada tarjeta son las de lo visible, no las reales', async () => {
  const { datos } = await organigrama(tokenComun)

  for (const area of datos.areas) {
    const suya = datos.personas.filter((persona) => persona.area_id === area.id)

    // Si la tarjeta contara gente que el árbol no dibuja, entrar en ella desmentiría a la tarjeta.
    assert.equal(area.personas, suya.length, `la tarjeta de ${area.nombre} cuenta lo que muestra`)
    assert.equal(area.leads, suya.filter((persona) => persona.escalon === 'lead').length)
  }
})

test('la gente sin área viaja con area_id nulo en vez de esconderse', async () => {
  const { datos } = await organigrama()
  const gina = datos.personas.find((persona) => persona.staffid === GINA.id)

  assert.equal(gina.area_id, null)
  assert.equal(gina.nombre, GINA.full_name)
})

test('cada persona trae lo que la caja necesita, incluida la baja', async () => {
  const { datos } = await organigrama()
  const baja = datos.personas.find((persona) => !persona.activo)

  // Una baja colgada de un área se marca en vez de esconderse: si no, un área dice "3 personas"
  // donde sólo trabajan 2 y nadie entiende por qué.
  assert.ok(baja !== undefined)
  assert.deepEqual(Object.keys(baja).sort(), [
    'activo', 'area_id', 'avatar', 'correo', 'escalon', 'jefe_staffid', 'nombre', 'staffid'
  ])
})

test('sólo se lee: cualquier otro verbo es 404', async () => {
  const respuesta = await fetch(`${base}/organigrama`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenSuper}` },
    body: '{}'
  })

  assert.equal(respuesta.status, 404)
})
