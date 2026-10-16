/**
 * Pruebas del acceso con Google al portal en el mock: `GET|POST /auth/portal/google`,
 * `GET|PUT /clients/{id}/portal-google`, el interruptor global y el bloqueo `google_required`.
 *
 * Lo que se deja clavado es que el mock se porte como el contrato:
 *
 *  1. **Apagado de fabrica y sin rastro.** Con el global apagado el GET publico dice `enabled: false`,
 *     el POST es 404 y `exigir_google` no bloquea la contraseña.
 *  2. **La configuracion valida como la API**: formato, tope, sufijos publicos, correo gratuito y
 *     solapamiento entre clientes (409).
 *  3. **La resolucion de dominios**: gana el exacto, despues el padre mas cercano con comodin.
 *  4. **El token se verifica contra el cliente candidato** (`aud`, `hd`, email verificado, contacto).
 *  5. **`exigir_google` cierra la contraseña DESPUES de validarla**: una clave mala sigue siendo 401.
 */

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { servidor } from './servidor.js'
import { PORTAL_GOOGLE, reiniciarPortalGoogle, resolverDominio } from './portal-google.js'

let base
let staff

const CLIENT_ID_ACME = 'acme-123.apps.googleusercontent.com'
const CLIENT_ID_OTRO = 'otro-456.apps.googleusercontent.com'

/** Entra como staff y devuelve la cabecera de autorizacion. */
async function entrarStaff () {
  const respuesta = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })

  return { authorization: `Bearer ${(await respuesta.json()).data.access_token}` }
}

before(async () => {
  await new Promise((resolver) => servidor.listen(0, resolver))
  base = `http://127.0.0.1:${servidor.address().port}/api/v1`
  staff = await entrarStaff()
})

afterEach(() => { reiniciarPortalGoogle(false) })

after(() => new Promise((resolver) => servidor.close(resolver)))

/** Pide como el actor que se indique (o anonimo con `{}`). */
async function pedir (actor, ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...actor, 'content-type': 'application/json' },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body)
  })
  const texto = await respuesta.text()

  return { estado: respuesta.status, cuerpo: texto === '' ? null : JSON.parse(texto) }
}

/** Guarda la configuracion de un cliente como lo hace la ficha. */
async function guardar (clienteId, cuerpo) {
  return await pedir(staff, `/clients/${clienteId}/portal-google`, { method: 'PUT', body: cuerpo })
}

/** Configuracion minima valida del cliente 1: `acme.com` con subdominios. */
function acme (extra = {}) {
  return {
    google_client_id: CLIENT_ID_ACME,
    exigir_google: false,
    dominios: [{ dominio: 'acme.com', incluir_subdominios: true }],
    ...extra
  }
}

/** Enciende el interruptor global como lo hace Administracion → Acceso. */
async function encenderGlobal (valor = true) {
  return await pedir(staff, '/settings', { method: 'PATCH', body: { wiwo_portal_google_enabled: valor } })
}

/** Un ID token con el payload dado; la firma no se verifica en el mock. */
function jwt (payload) {
  const parte = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url')

  return `${parte({ alg: 'RS256' })}.${parte(payload)}.firma`
}

/** El payload de un token valido para `email` del cliente 1, con lo que se quiera pisar. */
function tokenDe (email, extra = {}) {
  return jwt({ email, hd: email.split('@')[1], email_verified: true, aud: CLIENT_ID_ACME, ...extra })
}

test('nace apagado: el GET publico dice enabled false y el POST es 404', async () => {
  const publico = await pedir({}, '/auth/portal/google?email=clienta@acme.com')

  assert.equal(publico.estado, 200)
  assert.deepEqual(publico.cuerpo.data, { enabled: false, client_id: null, required: false })
  assert.equal((await pedir({}, '/auth/portal/google', { method: 'POST', body: { credential: 'mock:clienta@acme.com' } })).estado, 404)
})

test('la configuracion de un cliente nace vacia y el global se enciende por /settings', async () => {
  const vacia = await pedir(staff, '/clients/1/portal-google')

  assert.deepEqual(vacia.cuerpo.data, {
    configurado: false,
    google_client_id: '',
    exigir_google: false,
    dominios: [],
    global_habilitado: false,
    contactos_sin_cobertura: 0
  })

  assert.equal((await encenderGlobal()).estado, 200)
  assert.equal((await pedir(staff, '/clients/1/portal-google')).cuerpo.data.global_habilitado, true)
  assert.equal((await pedir(staff, '/settings')).cuerpo.data.editable.wiwo_portal_google_enabled.value, true)
})

test('el PUT devuelve lo guardado y vaciar Client ID y dominios borra la configuracion', async () => {
  const puesta = await guardar(1, acme())

  assert.equal(puesta.estado, 200)
  assert.equal(puesta.cuerpo.data.configurado, true)
  assert.deepEqual(puesta.cuerpo.data.dominios, [{ dominio: 'acme.com', incluir_subdominios: true }])

  const borrada = await guardar(1, { google_client_id: '', exigir_google: false, dominios: [] })

  assert.equal(borrada.estado, 200)
  assert.equal(borrada.cuerpo.data.configurado, false)
})

test('el PUT rechaza con 422 lo que la API rechaza', async () => {
  const casos = [
    [acme({ google_client_id: 'esto-no-es-un-id' }), 'google_client_id'],
    [acme({ dominios: [{ dominio: 'com.cl', incluir_subdominios: true }] }), 'dominios'],
    [acme({ dominios: [{ dominio: 'gmail.com', incluir_subdominios: false }] }), 'dominios'],
    [acme({ dominios: [{ dominio: 'acme', incluir_subdominios: false }] }), 'dominios'],
    [acme({ dominios: [{ dominio: 'acme.com' }, { dominio: 'ACME.com' }] }), 'dominios'],
    [acme({ dominios: [] }), 'dominios'],
    [acme({ google_client_id: '' }), 'google_client_id'],
    [acme({ exigir_google: 'si' }), 'exigir_google'],
    [{ google_client_id: '', exigir_google: true, dominios: [] }, 'exigir_google'],
    [acme({ dominios: Array.from({ length: 21 }, (_, i) => ({ dominio: `d${i}.cl`, incluir_subdominios: false })) }), 'dominios']
  ]

  for (const [cuerpo, campo] of casos) {
    const respuesta = await guardar(1, cuerpo)

    assert.equal(respuesta.estado, 422, JSON.stringify(cuerpo.dominios))
    const claves = Object.keys(respuesta.cuerpo.error.details)

    assert.ok(claves.some((k) => k === campo || k.startsWith(`${campo}.`)), `${campo}: ${claves.join(',')}`)
  }

  assert.equal((await pedir(staff, '/clients/1/portal-google')).cuerpo.data.configurado, false)
})

test('dos clientes no se solapan: exacto, subdominio bajo un comodin y comodin sobre un hijo son 409', async () => {
  assert.equal((await guardar(1, acme({ dominios: [{ dominio: 'wom.cl', incluir_subdominios: true }] }))).estado, 200)

  const otro = (dominio, incluir = false) => guardar(2, {
    google_client_id: CLIENT_ID_OTRO,
    exigir_google: false,
    dominios: [{ dominio, incluir_subdominios: incluir }]
  })

  assert.equal((await otro('wom.cl')).estado, 409)
  assert.equal((await otro('consultor.wom.cl')).estado, 409)
  assert.equal((await otro('a.b.wom.cl')).estado, 409)
  assert.equal((await otro('nordelta.com')).estado, 200)

  // Y al reves: el comodin de un dominio que ya tiene un hijo ajeno tambien choca.
  assert.equal((await guardar(1, acme({ dominios: [{ dominio: 'nordelta.com', incluir_subdominios: true }] }))).estado, 409)
  // El mismo cliente puede volver a guardar sus propios dominios.
  assert.equal((await guardar(1, acme({ dominios: [{ dominio: 'wom.cl', incluir_subdominios: true }] }))).estado, 200)
})

test('resolverDominio: gana el exacto y despues el padre mas cercano con comodin', () => {
  PORTAL_GOOGLE.clientes.set(1, { google_client_id: 'a', exigir_google: false, dominios: [{ dominio: 'wom.cl', incluir_subdominios: true }] })
  PORTAL_GOOGLE.clientes.set(2, { google_client_id: 'b', exigir_google: false, dominios: [{ dominio: 'consultor.wom.cl', incluir_subdominios: false }] })
  PORTAL_GOOGLE.clientes.set(3, { google_client_id: 'c', exigir_google: false, dominios: [{ dominio: 'e.wom.cl', incluir_subdominios: true }] })

  assert.equal(resolverDominio('wom.cl'), 1)
  assert.equal(resolverDominio('consultor.wom.cl'), 2, 'el exacto gana sobre el comodin del padre')
  assert.equal(resolverDominio('x.consultor.wom.cl'), 1, 'sin comodin en consultor, sube al padre con comodin')
  assert.equal(resolverDominio('x.e.wom.cl'), 3, 'gana el padre mas cercano')
  assert.equal(resolverDominio('otro.cl'), null)
  assert.equal(resolverDominio('cl'), null)
})

test('encendido: el GET publico ofrece el client_id solo a los dominios configurados', async () => {
  await guardar(1, acme())
  await encenderGlobal()

  const conGoogle = await pedir({}, '/auth/portal/google?email=alguien@acme.com')
  const subdominio = await pedir({}, '/auth/portal/google?email=alguien@e.acme.com')
  const ajeno = await pedir({}, '/auth/portal/google?email=alguien@nordelta.com')
  const sinCorreo = await pedir({}, '/auth/portal/google')

  assert.deepEqual(conGoogle.cuerpo.data, { enabled: true, client_id: CLIENT_ID_ACME, required: false })
  assert.deepEqual(subdominio.cuerpo.data, conGoogle.cuerpo.data)
  assert.deepEqual(ajeno.cuerpo.data, { enabled: true, client_id: null, required: false })
  assert.deepEqual(sinCorreo.cuerpo.data, { enabled: true, client_id: null, required: false })
})

test('encendido: un ID token valido abre la sesion del contacto con el cuerpo del login', async () => {
  await guardar(1, acme())
  await encenderGlobal()

  const entro = await pedir({}, '/auth/portal/google', { method: 'POST', body: { credential: tokenDe('clienta@acme.com') } })

  assert.equal(entro.estado, 201)
  assert.ok(entro.cuerpo.data.access_token)
  assert.equal(entro.cuerpo.data.contact.email, 'clienta@acme.com')

  const atajo = await pedir({}, '/auth/portal/google', { method: 'POST', body: { credential: 'mock:limitado@acme.com' } })

  assert.equal(atajo.estado, 201)
})

test('el token se rechaza con 401 si falla aud, hd, email verificado, contacto o forma', async () => {
  await guardar(1, acme())
  await encenderGlobal()

  const probar = async (credential) =>
    (await pedir({}, '/auth/portal/google', { method: 'POST', body: { credential } })).estado

  assert.equal(await probar(tokenDe('clienta@acme.com', { aud: CLIENT_ID_OTRO })), 401, 'aud de otro cliente')
  assert.equal(await probar(tokenDe('clienta@acme.com', { hd: undefined })), 401, 'sin hd: cuenta personal')
  assert.equal(await probar(tokenDe('clienta@acme.com', { hd: 'otro.com' })), 401, 'hd ajeno')
  assert.equal(await probar(tokenDe('clienta@acme.com', { email_verified: false })), 401, 'email sin verificar')
  assert.equal(await probar(tokenDe('nadie@acme.com')), 401, 'el contacto no existe')
  assert.equal(await probar(tokenDe('clienta@nordelta.com')), 401, 'el dominio no es de ningun cliente')
  assert.equal(await probar('no-es-un-jwt'), 401)

  const vacia = await pedir({}, '/auth/portal/google', { method: 'POST', body: {} })

  assert.equal(vacia.estado, 422)
})

test('hd puede ser un subdominio del dominio del cliente; el contacto inactivo recibe 403', async () => {
  await guardar(1, acme())
  await encenderGlobal()

  const subdominio = await pedir({}, '/auth/portal/google', {
    method: 'POST', body: { credential: tokenDe('clienta@acme.com', { hd: 'e.acme.com' }) }
  })
  const inactivo = await pedir({}, '/auth/portal/google', { method: 'POST', body: { credential: tokenDe('exempleado@acme.com') } })

  assert.equal(subdominio.estado, 201)
  assert.equal(inactivo.estado, 403)
  assert.equal(inactivo.cuerpo.error.code, 'forbidden')
})

test('contactos_sin_cobertura cuenta a los activos fuera de los dominios', async () => {
  await guardar(1, acme({ dominios: [{ dominio: 'otra.com', incluir_subdominios: false }] }))

  const config = (await pedir(staff, '/clients/1/portal-google')).cuerpo.data

  // clienta y limitado (activos); exempleado esta dado de baja.
  assert.equal(config.contactos_sin_cobertura, 2)
})

test('exigir_google cierra la contraseña despues de validarla, y solo con el global encendido', async () => {
  await guardar(1, acme({ exigir_google: true }))

  const clave = (password) => pedir({}, '/auth/portal/login', { method: 'POST', body: { email: 'clienta@acme.com', password } })

  // Global apagado: la contraseña vuelve para todos.
  assert.equal((await clave('portal1234')).estado, 201)

  await encenderGlobal()

  const bloqueada = await clave('portal1234')

  assert.equal(bloqueada.estado, 403)
  assert.equal(bloqueada.cuerpo.error.code, 'google_required')
  assert.equal((await clave('mala')).estado, 401, 'no sirve de oraculo: la clave mala sigue siendo 401')
  assert.equal((await pedir({}, '/auth/portal/google?email=clienta@acme.com')).cuerpo.data.required, true)

  // Un contacto de otro cliente no se ve afectado.
  const otro = await pedir({}, '/auth/portal/login', { method: 'POST', body: { email: 'sinverificar@nordelta.com', password: 'portal1234' } })

  assert.equal(otro.estado, 201)
})

test('el PUT y el GET de la configuracion piden permiso sobre clientes', async () => {
  const clienta = await fetch(`${base}/auth/portal/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'clienta@acme.com', password: 'portal1234' })
  })
  const contacto = { authorization: `Bearer ${(await clienta.json()).data.access_token}` }

  assert.equal((await pedir(contacto, '/clients/1/portal-google')).estado, 401)
  assert.equal((await pedir(staff, '/clients/999/portal-google')).estado, 404)
})
