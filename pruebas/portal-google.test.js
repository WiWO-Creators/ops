/**
 * Pruebas de las reglas del acceso con Google al portal de clientes.
 *
 * Lo importante no es que acepte un Client ID, sino que la pantalla nunca ofrezca una combinacion que
 * deje a alguien sin puerta: «exigir Google» sin boton, o una configuracion a medias.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accesoGoogleDelPortal, cantidadSinCobertura, configuracionDesdeApi, cuerpoDeGuardado, etiquetaDeDominio,
  fraseDeConfiguracion, frasesDeRechazo, hayCambios, mensajeDeEntradaAlPortal, motivoParaRechazarClientId,
  motivoParaRechazarConfiguracion, motivoParaRechazarDominioDelCliente, MAX_DOMINIOS_PORTAL, PORTAL_SIN_GOOGLE
} from '../src/dominio/portal-google.ts'
import { AJUSTES_GOOGLE, tieneAjusteDePortalGoogle } from '../src/dominio/acceso.ts'

const CLIENT_ID = '1234567890-abc.apps.googleusercontent.com'
const WOM = { dominio: 'wom.cl', incluir_subdominios: true }

test('el acceso queda sin Google si el interruptor global esta apagado o la respuesta es rara', () => {
  assert.deepEqual(accesoGoogleDelPortal({ enabled: false, client_id: CLIENT_ID, required: true }), PORTAL_SIN_GOOGLE)
  assert.deepEqual(accesoGoogleDelPortal(null), PORTAL_SIN_GOOGLE)
  assert.deepEqual(accesoGoogleDelPortal('hola'), PORTAL_SIN_GOOGLE)
  assert.deepEqual(accesoGoogleDelPortal({}), PORTAL_SIN_GOOGLE)
})

test('required solo vale si hay un client_id: exigir Google sin boton dejaria a la persona afuera', () => {
  assert.deepEqual(accesoGoogleDelPortal({ enabled: true, client_id: CLIENT_ID, required: true }), {
    enabled: true, client_id: CLIENT_ID, required: true
  })
  assert.deepEqual(accesoGoogleDelPortal({ enabled: true, client_id: null, required: true }), {
    enabled: true, client_id: null, required: false
  })
  assert.deepEqual(accesoGoogleDelPortal({ enabled: true, client_id: '', required: true }), {
    enabled: true, client_id: null, required: false
  })
  assert.equal(accesoGoogleDelPortal({ enabled: true, client_id: 42 }).client_id, null)
})

test('el Client ID vacio vale (quita la config); uno mal pegado no', () => {
  assert.equal(motivoParaRechazarClientId(''), null)
  assert.equal(motivoParaRechazarClientId(`  ${CLIENT_ID}  `), null)

  for (const malo of ['alguien@wom.cl', 'https://accounts.google.com', 'GOCSPX-secreto', '1234567890-abc.apps.google.com']) {
    assert.notEqual(motivoParaRechazarClientId(malo), null, malo)
  }
})

test('un dominio se rechaza si no tiene forma de dominio o ya esta en la lista', () => {
  assert.equal(motivoParaRechazarDominioDelCliente('wom.cl', []), null)
  assert.equal(motivoParaRechazarDominioDelCliente('Consultor.WOM.cl', [WOM]), null)
  assert.notEqual(motivoParaRechazarDominioDelCliente('', []), null)
  assert.notEqual(motivoParaRechazarDominioDelCliente('*.wom.cl', []), null)
  assert.notEqual(motivoParaRechazarDominioDelCliente('ana@wom.cl', []), null)
  assert.match(motivoParaRechazarDominioDelCliente('WOM.cl', [WOM]), /ya está/)
})

test('la configuracion exige Client ID y dominios juntos, y dominios para exigir Google', () => {
  assert.equal(motivoParaRechazarConfiguracion(CLIENT_ID, [WOM], false), null)
  assert.equal(motivoParaRechazarConfiguracion(CLIENT_ID, [WOM], true), null)
  assert.equal(motivoParaRechazarConfiguracion('', [], false), null, 'vacia: es quitar la configuracion')
  assert.match(motivoParaRechazarConfiguracion('', [WOM], false), /Client ID/)
  assert.match(motivoParaRechazarConfiguracion(CLIENT_ID, [], false), /dominio/)
  assert.match(motivoParaRechazarConfiguracion(CLIENT_ID, [], true), /dominio/)
  assert.notEqual(motivoParaRechazarConfiguracion('nada.com', [WOM], false), null)

  const demasiados = Array.from({ length: MAX_DOMINIOS_PORTAL + 1 }, (_, i) => ({ dominio: `d${i}.cl`, incluir_subdominios: false }))

  assert.match(motivoParaRechazarConfiguracion(CLIENT_ID, demasiados, false), /20/)
})

test('hayCambios ignora el orden de los dominios y los espacios del Client ID', () => {
  const guardado = configuracionDesdeApi({
    configurado: true,
    google_client_id: CLIENT_ID,
    exigir_google: false,
    dominios: [WOM, { dominio: 'acme.com', incluir_subdominios: false }]
  })

  assert.equal(hayCambios(guardado, ` ${CLIENT_ID} `, [guardado.dominios[1], guardado.dominios[0]], false), false)
  assert.equal(hayCambios(guardado, CLIENT_ID, guardado.dominios, true), true)
  assert.equal(hayCambios(guardado, CLIENT_ID, [{ ...WOM, incluir_subdominios: false }, guardado.dominios[1]], false), true)
  assert.equal(hayCambios(guardado, CLIENT_ID, [WOM], false), true)
  assert.equal(hayCambios(guardado, 'otro.apps.googleusercontent.com', guardado.dominios, false), true)
})

test('el cuerpo del PUT lleva solo lo editable, con dominios normalizados', () => {
  assert.deepEqual(cuerpoDeGuardado(` ${CLIENT_ID} `, [{ dominio: ' WOM.cl ', incluir_subdominios: true }], true), {
    google_client_id: CLIENT_ID,
    exigir_google: true,
    dominios: [{ dominio: 'wom.cl', incluir_subdominios: true }]
  })
})

test('la configuracion de la API se lee con tolerancia: numeros por booleanos, lista por cantidad', () => {
  const config = configuracionDesdeApi({
    configurado: true,
    google_client_id: CLIENT_ID,
    exigir_google: 1,
    dominios: [{ dominio: 'WOM.cl', incluir_subdominios: 1 }, { dominio: 7 }, null],
    global_habilitado: true,
    contactos_sin_cobertura: [{ id: 1 }, { id: 2 }]
  })

  assert.equal(config.exigir_google, true)
  assert.deepEqual(config.dominios, [WOM])
  assert.equal(config.contactos_sin_cobertura, 2)
  assert.equal(configuracionDesdeApi(undefined).configurado, false)
  assert.equal(cantidadSinCobertura(-3), 0)
  assert.equal(cantidadSinCobertura('4'), 0)
  assert.equal(cantidadSinCobertura(3.7), 3)
})

test('los mensajes de entrada distinguen la via y no ofrecen la contraseña cuando esta cerrada', () => {
  const clave401 = mensajeDeEntradaAlPortal(undefined, 401, undefined, 'clave', false)
  const google401 = mensajeDeEntradaAlPortal(undefined, 401, undefined, 'google', false)
  const google401Exigido = mensajeDeEntradaAlPortal(undefined, 401, undefined, 'google', true)

  assert.equal(clave401, 'Correo o contraseña incorrectos.')
  assert.match(google401, /contraseña/)
  assert.doesNotMatch(google401Exigido, /contraseña/)
  assert.match(mensajeDeEntradaAlPortal('google_required', 403, undefined, 'clave', true), /Google/)
  assert.match(mensajeDeEntradaAlPortal('forbidden', 403, undefined, 'google', false), /desactivado/)
  assert.match(mensajeDeEntradaAlPortal('rate_limited', 429, undefined, 'clave', false), /Demasiados intentos/)
  assert.match(mensajeDeEntradaAlPortal(undefined, 429, undefined, 'google', false), /Demasiados intentos/)
  assert.match(mensajeDeEntradaAlPortal(undefined, 404, undefined, 'google', false), /no está disponible/)
  assert.match(mensajeDeEntradaAlPortal(undefined, 503, undefined, 'google', false), /Google no responde/)
  assert.equal(mensajeDeEntradaAlPortal(undefined, 500, 'Algo pasó', 'clave', false), 'Algo pasó')
  assert.equal(mensajeDeEntradaAlPortal(undefined, 500, undefined, 'clave', false), 'No se pudo entrar. Intenta de nuevo.')
})

test('el 422 del PUT se traduce a frases con el nombre del dominio de cada posicion', () => {
  const frases = frasesDeRechazo({
    google_client_id: ['invalid'],
    'dominios.1.dominio': ['free_mail'],
    'dominios.0.incluir_subdominios': ['public_suffix'],
    exigir_google: ['requires_domains'],
    dominios: ['too_many', 'otro_codigo_nuevo'],
    'dominios.5.dominio': ['duplicate']
  }, [{ dominio: 'com.cl', incluir_subdominios: true }, { dominio: 'gmail.com', incluir_subdominios: false }])

  assert.ok(frases.some((f) => f.includes('Client ID')))
  assert.ok(frases.some((f) => f.includes('«gmail.com»') && f.includes('gratuito')))
  assert.ok(frases.some((f) => f.includes('«com.cl»') && f.includes('sufijo público')))
  assert.ok(frases.some((f) => f.includes('«ese dominio» está repetido')))
  assert.equal(frases.length, 6, 'el codigo desconocido se omite')
  assert.deepEqual(frasesDeRechazo(undefined, []), [])
  assert.deepEqual(frasesDeRechazo({ x: ['y'] }, []), [])
})

test('las frases de la regla y de los dominios se leen en español', () => {
  const sola = configuracionDesdeApi({ configurado: false })
  const abierta = configuracionDesdeApi({ configurado: true, google_client_id: CLIENT_ID, dominios: [WOM] })
  const cerrada = configuracionDesdeApi({ configurado: true, google_client_id: CLIENT_ID, dominios: [WOM], exigir_google: true })

  assert.match(fraseDeConfiguracion(sola), /solo con su contraseña/)
  assert.match(fraseDeConfiguracion(abierta), /Google o con su contraseña/)
  assert.match(fraseDeConfiguracion(cerrada), /solo con Google/)
  assert.equal(etiquetaDeDominio(WOM), 'wom.cl y sus subdominios')
  assert.equal(etiquetaDeDominio({ dominio: 'acme.com', incluir_subdominios: false }), 'acme.com')
})

test('el interruptor global solo aparece si la API lo publica como bool', () => {
  const con = { editable: { [AJUSTES_GOOGLE.portalHabilitado]: { group: 'acceso', type: 'bool', value: false } } }
  const sin = { editable: {} }
  const mal = { editable: { [AJUSTES_GOOGLE.portalHabilitado]: { group: 'acceso', type: 'texto', value: '0' } } }

  assert.equal(tieneAjusteDePortalGoogle(con), true)
  assert.equal(tieneAjusteDePortalGoogle(sin), false)
  assert.equal(tieneAjusteDePortalGoogle(mal), false)
})
