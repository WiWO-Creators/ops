/**
 * Pruebas del Proyecto de entrada del portal: `GET|PUT /clients/{id}/proyecto-de-entrada` y el
 * `proyecto_de_entrada` que sale de `GET /portal/me`.
 *
 * Lo que se deja clavado acá es lo que decide si la pantalla del panel se puede probar sin la API
 * real, y —más importante— si lo que pasa en local también pasa en producción:
 *
 *  1. **Nace apagado y sin Proyecto.** Ningún cliente tiene apertura automática hasta que alguien
 *     la elija. Un mock que la siembre encendida probaría siempre el caso que en producción todavía
 *     no existe.
 *  2. **Encender sin elegir es 422**, y no un interruptor encendido que no abre nada.
 *  3. **Un Proyecto de otro cliente es 422.** Es la única forma en que este endpoint podría mandar
 *     a un contacto a algo ajeno.
 *  4. **Apagar conserva la elección.** Es justo para eso que el id y el interruptor son dos
 *     columnas y no una.
 *  5. **El mock poda igual que la API.** `/portal/me` no publica el Proyecto cuando el contacto no
 *     tiene el permiso `projects`: si publicara de más, la pantalla pasaría en local y se caería en
 *     producción contra el `veEspacio()` de verdad.
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { CLIENTES, CONTACTOS, ESPACIOS } from './datos.js'

let base
let staff
let contacto

/** El contacto del fixture con el que se entra al portal, y su cliente. */
const CORREO_CONTACTO = 'clienta@acme.com'

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`

  const entrar = async (ruta, cuerpo) => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })

    return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
  }

  staff = await entrar('/auth/login', { email: 'ana@wiwo.me', password: 'mock1234' })
  contacto = await entrar('/auth/portal/login', { email: CORREO_CONTACTO, password: 'portal1234' })
})

after(() => new Promise((resolver) => servidor.close(resolver)))

/** El cliente del contacto del fixture: es el que tiene portal y sobre el que se prueba todo. */
function clienteDelFixture () {
  return CONTACTOS.find((c) => c.email === CORREO_CONTACTO).client_id
}

/** Un Proyecto de ese cliente, y uno de cualquier otro. */
function proyectos () {
  const cliente = clienteDelFixture()

  return {
    propio: ESPACIOS.find((e) => e.clientid === cliente),
    ajeno: ESPACIOS.find((e) => e.clientid !== cliente)
  }
}

async function leerEntrada (clienteId = clienteDelFixture()) {
  const respuesta = await fetch(`${base}/clients/${clienteId}/proyecto-de-entrada`, { headers: staff })

  return { estado: respuesta.status, datos: (await respuesta.json()).data }
}

async function escribirEntrada (cuerpo, clienteId = clienteDelFixture()) {
  const respuesta = await fetch(`${base}/clients/${clienteId}/proyecto-de-entrada`, {
    method: 'PUT',
    headers: { ...staff, 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })

  return { estado: respuesta.status, cuerpo: await respuesta.json() }
}

/** `GET /portal/me` como el contacto. */
async function portalMe () {
  const respuesta = await fetch(`${base}/portal/me`, { headers: contacto })

  return (await respuesta.json()).data
}

test('nace apagado y sin proyecto elegido', async () => {
  const { estado, datos } = await leerEntrada()

  assert.equal(estado, 200)
  assert.deepEqual(datos, { project_id: null, project_name: null, activo: false })
})

test('sin apertura elegida, /portal/me no manda al contacto a ningún lado', async () => {
  assert.equal((await portalMe()).proyecto_de_entrada, null)
})

test('encender sin elegir proyecto es 422', async () => {
  const { estado, cuerpo } = await escribirEntrada({ project_id: null, activo: true })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.project_id, ['required'])
  assert.equal((await leerEntrada()).datos.activo, false, 'el 422 no escribió nada')
})

test('un proyecto de otro cliente es 422', async () => {
  const { ajeno } = proyectos()
  const { estado, cuerpo } = await escribirEntrada({ project_id: ajeno.id, activo: true })

  assert.equal(estado, 422)
  assert.deepEqual(cuerpo.error.details.project_id, ['invalid'])
})

test('faltar un campo del PUT es 422: se guarda entero o no se guarda', async () => {
  assert.equal((await escribirEntrada({ activo: true })).estado, 422)
  assert.equal((await escribirEntrada({ project_id: proyectos().propio.id })).estado, 422)
})

test('guardado y encendido, el portal manda al contacto a ese proyecto', async () => {
  const { propio } = proyectos()

  const { estado, cuerpo } = await escribirEntrada({ project_id: propio.id, activo: true })

  assert.equal(estado, 200)
  assert.deepEqual(cuerpo.data, { project_id: propio.id, project_name: propio.name, activo: true })
  assert.deepEqual(await portalMe().then((yo) => yo.proyecto_de_entrada), { id: propio.id, name: propio.name })
})

test('apagar conserva la elección y deja al contacto en su inicio', async () => {
  const { propio } = proyectos()

  await escribirEntrada({ project_id: propio.id, activo: true })
  const { cuerpo } = await escribirEntrada({ project_id: propio.id, activo: false })

  assert.equal(cuerpo.data.project_id, propio.id, 'apagar no borra el proyecto elegido')
  assert.equal(cuerpo.data.activo, false)
  assert.equal((await portalMe()).proyecto_de_entrada, null)
})

test('el cliente que no existe es 404 y no una fila vacía', async () => {
  const inexistente = Math.max(...CLIENTES.map((c) => c.id)) + 1

  assert.equal((await leerEntrada(inexistente)).estado, 404)
})
