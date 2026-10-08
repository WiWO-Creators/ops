/**
 * Pruebas de las reglas del servidor MCP externo que viven en el navegador.
 *
 * Se protege lo que, si se rompe, deja pasar algo silenciosamente: una clave PRIVADA pegada por error
 * como si fuera la pública, un identificador de sistema que la API rechazaría después de guardar, y
 * una respuesta incompleta del backend que no debe tumbar la pantalla.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DECISION_HERRAMIENTAS_MCP, DOMINIOS_MCP, cuerpoDeRegenerarLlave, mensajeDeErrorDeClaves, EVENTOS_MCP, RPM_MAXIMO, TOPE_VIVAS_MAXIMO, alternarEnLista, armarClaves,
  cuotaDeTexto, describirEstadoDeClave, dominiosDeTexto, estadoDeDecisionRemota, etiquetaDeMetodo, filtrarLlamadas,
  leerLlamadas, leerLlaveAnteriorVigenteHasta, leerSistemaMcp, motivoDeClaveInvalida, motivoDeCuotaInvalida,
  motivoDeDecisionInvalida, motivoDeDominiosInvalidos, motivoDeSlugInvalido, motivoDeTtlInvalido
} from '../src/dominio/mcp-externo.ts'
import { ErrorApi } from '../mock/consulta.js'
import { integracionesRuta, propuestasRuta } from '../mock/mcp-externo.js'

const PUBLICA = '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----'

test('el identificador del sistema: minúsculas, números y guiones', () => {
  assert.equal(motivoDeSlugInvalido('metriq'), null)
  assert.equal(motivoDeSlugInvalido('wiwo-lab2'), null)

  for (const malo of ['', 'a', 'Metriq', '-x', 'con espacio', 'x'.repeat(32), 'ñandú']) {
    assert.notEqual(motivoDeSlugInvalido(malo), null, `«${malo}» no debería servir`)
  }
})

test('una clave privada se rechaza por nombre y una pública sin marcas también', () => {
  assert.equal(motivoDeClaveInvalida('k1', PUBLICA), null)
  assert.match(motivoDeClaveInvalida('k1', '-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----'), /privada/)
  assert.notEqual(motivoDeClaveInvalida('k1', 'basura'), null)
  assert.notEqual(motivoDeClaveInvalida('k 1', PUBLICA), null)
  assert.notEqual(motivoDeClaveInvalida('', PUBLICA), null)
})

test('la duración de propuestas va de 1 a 720 horas, enteras', () => {
  assert.equal(motivoDeTtlInvalido(1), null)
  assert.equal(motivoDeTtlInvalido(720), null)

  for (const malo of [0, 721, 1.5, Number.NaN, -3]) assert.notEqual(motivoDeTtlInvalido(malo), null)
})

test('alternar conserva el orden del catálogo y no repite', () => {
  assert.deepEqual(alternarEnLista([], 'procesos', DOMINIOS_MCP), ['procesos'])
  assert.deepEqual(alternarEnLista(['procesos'], 'nucleo', DOMINIOS_MCP), ['nucleo', 'procesos'])
  assert.deepEqual(alternarEnLista(['nucleo', 'procesos'], 'nucleo', DOMINIOS_MCP), ['procesos'])
  assert.deepEqual(alternarEnLista([], 'tarea.completada', EVENTOS_MCP), ['tarea.completada'])
})

test('leer un sistema tolera campos ausentes y descarta lo que no tiene forma', () => {
  assert.equal(leerSistemaMcp(null), null)
  assert.equal(leerSistemaMcp({ id: 1 }), null)

  const sistema = leerSistemaMcp({ id: 7, system: 'metriq', keys: [{ kid: 'k1', since: '2026-01-01T00:00:00Z' }, { sin: 'kid' }], domains: ['nucleo', 3] })

  assert.equal(sistema.system, 'metriq')
  assert.deepEqual(sistema.keys, [{
    kid: 'k1', purpose: 'mcp', since: '2026-01-01T00:00:00Z', until: null, status: 'active', expires_in_days: null, fingerprint: ''
  }])
  assert.deepEqual(sistema.domains, ['nucleo'])
  assert.deepEqual(sistema.events, [])
  assert.equal(sistema.proposal_ttl_hours, 72)
  assert.deepEqual(sistema.link_domains, [])
  assert.deepEqual(sistema.decision_tools, [])
  assert.equal(sistema.limits.rpm_person, null)
  assert.equal(sistema.limits.effective.max_pending, null)
  assert.equal(sistema.active_keys, 1)
  assert.equal(sistema.keys_expiring_soon, false)
})

const COMPLETO = {
  id: 7, system: 'metriq',
  keys: [
    { kid: 'a', purpose: 'decision', since: '2026-01-01T00:00:00Z', until: '2026-11-01T00:00:00Z', status: 'expiring', expires_in_days: 9, fingerprint: 'sha256:ab' },
    { kid: 'b', purpose: 'rara', since: null, until: null, status: 'inventado', expires_in_days: -3, fingerprint: 5 }
  ],
  active_keys: 2, keys_expiring_soon: true, domains: [], events: ['espacio.archivado'], proposal_ttl_hours: 48,
  link_domains: ['metriq.example', 7], decision_tools: ['comentar_tarea'],
  limits: { rpm_person: null, rpm_system: 600, max_pending: 10, effective: { rpm_person: 60, rpm_system: 600, max_pending: 10 } },
  updated_at: null
}

test('leer un sistema completo conserva propósito, estado, huella, cuotas y listas', () => {
  const sistema = leerSistemaMcp(COMPLETO)

  assert.equal(sistema.keys[0].purpose, 'decision')
  assert.equal(sistema.keys[0].status, 'expiring')
  assert.equal(sistema.keys[0].expires_in_days, 9)
  assert.equal(sistema.keys[0].fingerprint, 'sha256:ab')
  assert.equal(sistema.keys_expiring_soon, true)
  assert.deepEqual(sistema.link_domains, ['metriq.example'])
  assert.deepEqual(sistema.decision_tools, ['comentar_tarea'])
  assert.deepEqual(sistema.limits, COMPLETO.limits)
})

test('una clave con propósito, estado o días inválidos se lee con valores seguros', () => {
  const { keys } = leerSistemaMcp(COMPLETO)

  assert.equal(keys[1].purpose, 'mcp')
  assert.equal(keys[1].status, 'active')
  assert.equal(keys[1].expires_in_days, null)
  assert.equal(keys[1].fingerprint, '')
})

test('los eventos suscribibles incluyen los siete nuevos', () => {
  const claves = EVENTOS_MCP.map((e) => e.clave)

  for (const nuevo of ['persona.acceso_revocado', 'persona.permisos_cambiados', 'espacio.acceso_perdido', 'espacio.archivado', 'espacio.eliminado', 'tarea.inaccesible', 'sistema.catalogo_cambiado']) {
    assert.ok(claves.includes(nuevo), nuevo)
  }

  assert.equal(new Set(claves).size, claves.length)
})

test('una cuota vacía vale (usa el valor por defecto) y una numérica entera dentro del techo también', () => {
  assert.equal(motivoDeCuotaInvalida('', RPM_MAXIMO), null)
  assert.equal(motivoDeCuotaInvalida('   ', RPM_MAXIMO), null)
  assert.equal(motivoDeCuotaInvalida('1', RPM_MAXIMO), null)
  assert.equal(motivoDeCuotaInvalida(String(RPM_MAXIMO), RPM_MAXIMO), null)
  assert.equal(cuotaDeTexto(''), null)
  assert.equal(cuotaDeTexto(' 25 '), 25)
})

test('una cuota no numérica, decimal, cero, negativa o sobre el techo se rechaza', () => {
  for (const mala of ['abc', '12abc', '1.5', '1,5', '-3', '0', '1e3', '+4', String(RPM_MAXIMO + 1)]) {
    assert.notEqual(motivoDeCuotaInvalida(mala, RPM_MAXIMO), null, `«${mala}» no debería servir`)
  }

  assert.notEqual(motivoDeCuotaInvalida(String(TOPE_VIVAS_MAXIMO + 1), TOPE_VIVAS_MAXIMO), null)
})

test('los dominios de vínculo se parten, se pasan a minúsculas y no se repiten', () => {
  assert.deepEqual(dominiosDeTexto('Metriq.Example\n*.metriq.example, metriq.example;  '), ['metriq.example', '*.metriq.example'])
  assert.deepEqual(dominiosDeTexto('  \n '), [])
})

test('los dominios de vínculo bien formados sirven y la lista vacía también', () => {
  assert.equal(motivoDeDominiosInvalidos([]), null)
  assert.equal(motivoDeDominiosInvalidos(['metriq.example', '*.metriq.example', 'a-b.co.uk']), null)
})

test('los dominios mal formados se rechazan nombrando al culpable', () => {
  for (const malo of ['https://metriq.example', 'metriq.example/ruta', 'metriq', '*metriq.example', '*.*.metriq.example', '10.0.0.1', 'metriq.example:8443', '-x.example', 'con espacio.example', 'ñandú.example', '.example', 'a..example']) {
    assert.match(motivoDeDominiosInvalidos(['ok.example', malo]) ?? '', /no sirve/, `«${malo}» no debería servir`)
  }
})

test('los dominios de vínculo admiten hasta veinte', () => {
  const veinte = Array.from({ length: 20 }, (_, i) => `s${i}.example`)

  assert.equal(motivoDeDominiosInvalidos(veinte), null)
  assert.notEqual(motivoDeDominiosInvalidos([...veinte, 'extra.example']), null)
})

test('una herramienta de decisión fuera de la lista se rechaza', () => {
  assert.equal(motivoDeDecisionInvalida([]), null)
  assert.equal(motivoDeDecisionInvalida(DECISION_HERRAMIENTAS_MCP.map((d) => d.clave)), null)
  assert.match(motivoDeDecisionInvalida(['comentar_tarea', 'crear_tarea']), /crear_tarea/)
  assert.notEqual(motivoDeDecisionInvalida(['']), null)
})

test('la decisión remota está desactivada sin herramientas, aunque haya clave', () => {
  const clave = { purpose: 'decision', status: 'active' }

  assert.equal(estadoDeDecisionRemota({ decision_tools: [], keys: [clave] }), 'desactivada')
  assert.equal(estadoDeDecisionRemota({ decision_tools: ['comentar_tarea'], keys: [] }), 'sin_clave')
  assert.equal(estadoDeDecisionRemota({ decision_tools: ['comentar_tarea'], keys: [{ purpose: 'mcp', status: 'active' }] }), 'sin_clave')
  assert.equal(estadoDeDecisionRemota({ decision_tools: ['comentar_tarea'], keys: [{ purpose: 'decision', status: 'expired' }] }), 'sin_clave')
  assert.equal(estadoDeDecisionRemota({ decision_tools: ['comentar_tarea'], keys: [clave] }), 'activa')
})

const clave = (kid, purpose, status = 'active') => ({ kid, purpose, since: '2026-01-01T00:00:00Z', until: null, status, expires_in_days: null, fingerprint: '' })
const NUEVA = { kid: ' nueva ', pem: ` ${PUBLICA} `, proposito: 'decision' }

test('armar claves reenvía lo existente sin pem y agrega la nueva con el suyo', () => {
  const { claves } = armarClaves([clave('a', 'mcp')], NUEVA)

  assert.deepEqual(claves[0], { kid: 'a', proposito: 'mcp', desde: '2026-01-01T00:00:00Z', hasta: null })
  assert.equal('pem' in claves[0], false)
  assert.deepEqual(claves[1], { kid: 'nueva', proposito: 'decision', desde: null, hasta: null, pem: PUBLICA })
  assert.equal(armarClaves([clave('a', 'mcp')]).claves.length, 1)
})

test('armar claves rechaza un kid repetido y un tercer vigente del mismo propósito', () => {
  assert.match(armarClaves([clave('nueva', 'mcp')], NUEVA).motivo, /mismo identificador|ese identificador/)
  assert.match(armarClaves([clave('a', 'decision'), clave('b', 'decision', 'expiring')], NUEVA).motivo, /vigentes/)
  assert.match(armarClaves([clave('a', 'decision', 'scheduled'), clave('b', 'decision')], NUEVA).motivo, /vigentes/)
})

test('las vencidas y las de otro propósito no cuentan para el tope de dos vigentes', () => {
  assert.ok(armarClaves([clave('a', 'decision', 'expired'), clave('b', 'decision'), clave('c', 'mcp'), clave('d', 'mcp')], NUEVA).claves)
})

test('con seis claves se descartan solo las vencidas para hacer lugar, y si no alcanza se explica', () => {
  const seis = [clave('a', 'mcp'), clave('b', 'mcp', 'expired'), clave('c', 'mcp', 'expired'), clave('d', 'decision'), clave('e', 'mcp', 'expired'), clave('f', 'mcp', 'expired')]
  const { claves } = armarClaves(seis, NUEVA)

  assert.deepEqual(claves.map((c) => c.kid), ['a', 'd', 'nueva'])

  const llenas = [clave('a', 'mcp'), clave('b', 'mcp'), clave('c', 'decision'), clave('d', 'decision'), clave('e', 'mcp', 'scheduled'), clave('f', 'decision', 'scheduled')]
  const lleno = armarClaves(llenas, { ...NUEVA, proposito: 'mcp' })

  assert.match(lleno.motivo, /vigentes/)
})

test('el estado de una clave se dice con su tono y sus días', () => {
  assert.deepEqual(describirEstadoDeClave({ status: 'active', expires_in_days: null }), { texto: 'Vigente', tono: 'exito' })
  assert.deepEqual(describirEstadoDeClave({ status: 'expiring', expires_in_days: 1 }), { texto: 'Vence en 1 día', tono: 'aviso' })
  assert.deepEqual(describirEstadoDeClave({ status: 'expiring', expires_in_days: 9 }), { texto: 'Vence en 9 días', tono: 'aviso' })
  assert.deepEqual(describirEstadoDeClave({ status: 'expiring', expires_in_days: null }), { texto: 'Vence pronto', tono: 'aviso' })
  assert.equal(describirEstadoDeClave({ status: 'expired', expires_in_days: null }).texto, 'Vencida')
  assert.equal(describirEstadoDeClave({ status: 'scheduled', expires_in_days: null }).texto, 'Aún no rige')
})

test('la llave anterior vigente se lee solo si viene como texto', () => {
  assert.equal(leerLlaveAnteriorVigenteHasta({ key: 'x', previous_key_valid_until: '2026-10-08T12:15:00Z' }), '2026-10-08T12:15:00Z')

  for (const sin of [{ previous_key_valid_until: null }, { previous_key_valid_until: 5 }, {}, null, 'x']) {
    assert.equal(leerLlaveAnteriorVigenteHasta(sin), null)
  }
})

test('leer llamadas descarta filas sin id y completa lo que falta', () => {
  assert.deepEqual(leerLlamadas('no es lista'), [])

  const [fila, ...resto] = leerLlamadas([{ id: 1, tool: 'mis_tareas', code: 'ok', ms: 12, staff_id: 5 }, { tool: 'x' }])

  assert.equal(resto.length, 0)
  assert.equal(fila.tool, 'mis_tareas')
  assert.equal(fila.created_at, null)
  assert.equal(fila.reason, null)
  assert.equal(fila.request_id, null)
  assert.equal(fila.sid, null)
})

const LLAMADAS = leerLlamadas([
  { id: 3, method: 'decision', tool: 'comentar_tarea', code: 'ok', reason: 'confirmar', request_id: 'req-AA', sid: 'ses-1', ms: 1 },
  { id: 2, method: 'rechazo', code: '429', reason: 'cuota_persona', request_id: 'req-BB', sid: null, ms: 1 },
  { id: 1, method: 'tools/call', tool: 'mis_tareas', code: 'ok', reason: 7, request_id: 5, ms: 1 }
])

test('leer llamadas trae motivo, request_id y sid, y descarta lo que no es texto', () => {
  assert.equal(LLAMADAS[0].reason, 'confirmar')
  assert.equal(LLAMADAS[0].sid, 'ses-1')
  assert.equal(LLAMADAS[1].method, 'rechazo')
  assert.equal(LLAMADAS[2].reason, null)
  assert.equal(LLAMADAS[2].request_id, null)
})

test('filtrar llamadas por método y por texto en herramienta, motivo, request_id y sid', () => {
  assert.equal(filtrarLlamadas(LLAMADAS, 'todas', '').length, 3)
  assert.deepEqual(filtrarLlamadas(LLAMADAS, 'rechazo', '').map((l) => l.id), [2])
  assert.deepEqual(filtrarLlamadas(LLAMADAS, 'todas', 'CUOTA').map((l) => l.id), [2])
  assert.deepEqual(filtrarLlamadas(LLAMADAS, 'todas', 'req-aa').map((l) => l.id), [3])
  assert.deepEqual(filtrarLlamadas(LLAMADAS, 'todas', 'ses-1').map((l) => l.id), [3])
  assert.deepEqual(filtrarLlamadas(LLAMADAS, 'decision', 'mis_tareas'), [])
  assert.deepEqual(filtrarLlamadas([], 'rechazo', 'x'), [])
})

test('los métodos se leen en español y uno desconocido se muestra tal cual', () => {
  assert.equal(etiquetaDeMetodo('rechazo'), 'Rechazo')
  assert.equal(etiquetaDeMetodo('decision'), 'Decisión remota')
  assert.equal(etiquetaDeMetodo('raro/x'), 'raro/x')
  assert.equal(etiquetaDeMetodo(''), '—')
})

// -- El mock cumple el contrato que ops-v2 espera ---------------------------------------------------

/** Llama a una ruta del mock con un cuerpo ya armado. */
const llamar = (metodo, resto, datos = {}) => integracionesRuta(metodo, resto, async () => datos)

/** Un PEM público distinto por nombre, para que dos claves no se confundan por tener el mismo texto. */
const pemDe = (nombre) => `-----BEGIN PUBLIC KEY-----\n${Buffer.from(nombre).toString('base64')}\n-----END PUBLIC KEY-----`

/** Crea un sistema MCP y devuelve su id. */
async function crearSistema (slug) {
  const { cuerpo } = await llamar('POST', [], { nombre: slug, sistema: slug, alcance: 'mcp' })

  return cuerpo.data.id
}

/** El `ErrorApi` que lanza la llamada, o `null` si no lanzó. */
async function falla (promesa) {
  try {
    await promesa

    return null
  } catch (error) {
    assert.ok(error instanceof ErrorApi)

    return error
  }
}

test('el mock sirve el sistema nuevo con cuotas por defecto, sin herramientas de decisión ni dominios', async () => {
  const id = await crearSistema('mock-uno')
  const { cuerpo } = await llamar('GET', [String(id), 'mcp'])
  const sistema = leerSistemaMcp(cuerpo.data)

  assert.deepEqual(sistema.decision_tools, [])
  assert.deepEqual(sistema.link_domains, [])
  assert.deepEqual(sistema.limits, { rpm_person: null, rpm_system: null, max_pending: null, effective: { rpm_person: 60, rpm_system: 300, max_pending: 25 } })
})

test('el mock guarda cuotas, dominios y herramientas, y null vuelve al valor por defecto', async () => {
  const id = await crearSistema('mock-dos')
  const { cuerpo } = await llamar('PUT', [String(id), 'mcp'], {
    rpm_persona: 10, tope_vivas: 5, dominios_vinculo: [' Metriq.Example ', '*.metriq.example', 'metriq.example'], decision_herramientas: ['registrar_horas'], eventos: ['espacio.eliminado']
  })
  const sistema = leerSistemaMcp(cuerpo.data)

  assert.equal(sistema.limits.rpm_person, 10)
  assert.equal(sistema.limits.effective.max_pending, 5)
  assert.deepEqual(sistema.link_domains, ['metriq.example', '*.metriq.example'])
  assert.deepEqual(sistema.decision_tools, ['registrar_horas'])
  assert.deepEqual(sistema.events, ['espacio.eliminado'])

  const vuelto = leerSistemaMcp((await llamar('PUT', [String(id), 'mcp'], { rpm_persona: null })).cuerpo.data)

  assert.equal(vuelto.limits.rpm_person, null)
  assert.equal(vuelto.limits.effective.rpm_person, 60)
  assert.equal(vuelto.limits.max_pending, 5)
})

test('el mock rechaza con 422 cuotas, dominios y herramientas inválidos, y no guarda nada a medias', async () => {
  const id = await crearSistema('mock-tres')

  const malos = [
    { rpm_persona: '12' }, { rpm_persona: 0 }, { rpm_sistema: 1.5 }, { rpm_sistema: RPM_MAXIMO + 1 }, { tope_vivas: TOPE_VIVAS_MAXIMO + 1 },
    { dominios_vinculo: 'metriq.example' }, { dominios_vinculo: ['https://metriq.example'] }, { dominios_vinculo: ['10.0.0.1'] },
    { dominios_vinculo: Array.from({ length: 21 }, (_, i) => `s${i}.example`) },
    { decision_herramientas: ['crear_tarea'] }, { decision_herramientas: 'comentar_tarea' }, { eventos: ['evento.inventado'] }
  ]

  for (const cuerpo of malos) {
    const error = await falla(llamar('PUT', [String(id), 'mcp'], { dominios: ['nucleo'], ...cuerpo }))

    assert.equal(error?.estado, 422, JSON.stringify(cuerpo))
  }

  assert.deepEqual(leerSistemaMcp((await llamar('GET', [String(id), 'mcp'])).cuerpo.data).domains, [])
})

test('el mock exige propósito válido, kids únicos y dos vigentes como máximo por propósito', async () => {
  const id = await crearSistema('mock-cuatro')
  const ruta = [String(id), 'mcp']
  const alta = (kid, proposito) => ({ kid, pem: pemDe(kid), ...(proposito === undefined ? {} : { proposito }) })

  assert.equal((await falla(llamar('PUT', ruta, { claves: [alta('a', 'otro')] })))?.estado, 422)
  assert.equal((await falla(llamar('PUT', ruta, { claves: [alta('a'), alta('a')] })))?.estado, 422)
  assert.equal((await falla(llamar('PUT', ruta, { claves: [alta('a', 'decision'), alta('b', 'decision'), alta('c', 'decision')] })))?.estado, 422)

  const guardado = leerSistemaMcp((await llamar('PUT', ruta, { claves: [alta('a'), alta('b', 'decision'), alta('c', 'decision')] })).cuerpo.data)

  assert.deepEqual(guardado.keys.map((c) => [c.kid, c.purpose, c.status]), [['a', 'mcp', 'active'], ['b', 'decision', 'active'], ['c', 'decision', 'active']])
  assert.equal(guardado.active_keys, 3)
  assert.ok(guardado.keys.every((c) => c.fingerprint !== '' && !('pem' in c)))
})

test('el mock marca por vencer, vencida y programada, y conserva clave y propósito al reenviar sin pem', async () => {
  const id = await crearSistema('mock-cinco')
  const ruta = [String(id), 'mcp']
  const en = (dias) => new Date(Date.now() + dias * 86400000).toISOString()

  await llamar('PUT', ruta, { claves: [
    { kid: 'pronto', pem: pemDe('pronto'), proposito: 'decision', hasta: en(3) },
    { kid: 'lejos', pem: pemDe('lejos'), hasta: en(90) },
    { kid: 'vieja', pem: pemDe('vieja'), desde: en(-30), hasta: en(-1) },
    { kid: 'futura', pem: pemDe('futura'), desde: en(5) }
  ] })

  const reenviado = leerSistemaMcp((await llamar('PUT', ruta, { claves: [
    { kid: 'pronto', desde: en(-1), hasta: en(3) }, { kid: 'lejos' }, { kid: 'vieja' }, { kid: 'futura' }
  ] })).cuerpo.data)
  const por = Object.fromEntries(reenviado.keys.map((c) => [c.kid, c]))

  assert.equal(por.pronto.status, 'expiring')
  assert.equal(por.pronto.purpose, 'decision')
  assert.ok(por.pronto.expires_in_days >= 1 && por.pronto.expires_in_days <= 3)
  assert.equal(por.lejos.status, 'active')
  assert.equal(por.vieja.status, 'expired')
  assert.equal(por.vieja.expires_in_days, null)
  assert.equal(por.futura.status, 'scheduled')
  assert.equal(reenviado.keys_expiring_soon, true)
  assert.equal(reenviado.active_keys, 2)
  assert.notEqual(por.lejos.fingerprint, '')
})

test('el mock responde las llamadas con rechazos, decisiones y correlación', async () => {
  const id = await crearSistema('mock-seis')
  const llamadas = leerLlamadas((await llamar('GET', [String(id), 'mcp', 'llamadas'])).cuerpo.data)

  assert.ok(llamadas.some((l) => l.method === 'rechazo' && l.reason !== null))
  assert.ok(llamadas.some((l) => l.method === 'decision'))
  assert.ok(llamadas.some((l) => l.request_id !== null && l.sid !== null))
})

test('regenerar la llave de un sistema MCP trae hasta cuándo sirve la anterior y la de una pantalla no', async () => {
  const id = await crearSistema('mock-siete')
  const mcp = (await llamar('POST', [String(id), 'llave'])).cuerpo.data
  const pantalla = (await llamar('POST', ['1', 'llave'])).cuerpo.data

  assert.ok(Date.parse(leerLlaveAnteriorVigenteHasta(mcp)) > Date.now())
  assert.equal(leerLlaveAnteriorVigenteHasta(pantalla), null)
  assert.match(mcp.key, /^[0-9a-f]{64}$/)
})

test('el mock sirve las propuestas con huella, enlace, visibilidad y procedencia', async () => {
  const { cuerpo } = await propuestasRuta('GET', ['propuestas'], new URLSearchParams('estado=todas'), async () => ({}))

  assert.ok(cuerpo.data.every((p) => 'args_hash' in p && 'url_ops' in p && typeof p.visible_to_client === 'boolean' && 'provenance' in p))
  assert.ok(cuerpo.data.some((p) => p.visible_to_client))
  assert.ok(cuerpo.data.some((p) => p.provenance?.trusted === false))
})

test('regenerar sin gracia mata la anterior al instante en un sistema MCP; sin pedirlo rige la gracia', async () => {
  const id = await crearSistema('mock-ocho')
  const sin = (await llamar('POST', [String(id), 'llave'], { sin_gracia: true })).cuerpo.data
  const con = (await llamar('POST', [String(id), 'llave'], { sin_gracia: false })).cuerpo.data

  assert.equal(leerLlaveAnteriorVigenteHasta(sin), null)
  assert.notEqual(leerLlaveAnteriorVigenteHasta(con), null)
})

test('sin_gracia tiene que ser un booleano', async () => {
  const id = await crearSistema('mock-nueve')

  for (const malo of ['true', 1, 0, null, {}, []]) {
    assert.equal((await falla(llamar('POST', [String(id), 'llave'], { sin_gracia: malo })))?.estado, 422, JSON.stringify(malo))
  }
})

test('el cuerpo de regenerar solo lleva sin_gracia cuando se pidió', () => {
  assert.deepEqual(cuerpoDeRegenerarLlave(true), { sin_gracia: true })
  assert.equal(cuerpoDeRegenerarLlave(false), undefined)
})

test('el mock no deja cambiar el propósito de una clave registrada', async () => {
  const id = await crearSistema('mock-diez')
  const ruta = [String(id), 'mcp']

  await llamar('PUT', ruta, { claves: [{ kid: 'a', pem: pemDe('a'), proposito: 'mcp' }] })

  for (const reenvio of [{ kid: 'a', proposito: 'decision' }, { kid: 'a', proposito: 'decision', pem: pemDe('a') }]) {
    const error = await falla(llamar('PUT', ruta, { claves: [reenvio] }))

    assert.equal(error?.estado, 422)
    assert.deepEqual(error.detalles, { claves: ['proposito_inmutable'] })
  }

  const igual = leerSistemaMcp((await llamar('PUT', ruta, { claves: [{ kid: 'a', proposito: 'mcp' }] })).cuerpo.data)

  assert.equal(igual.keys[0].purpose, 'mcp')
})

test('el mock no deja usar la misma clave para llamadas y para decisiones', async () => {
  const id = await crearSistema('mock-once')
  const error = await falla(llamar('PUT', [String(id), 'mcp'], { claves: [
    { kid: 'a', pem: pemDe('x'), proposito: 'mcp' }, { kid: 'b', pem: pemDe('x'), proposito: 'decision' }
  ] }))

  assert.equal(error?.estado, 422)
  assert.deepEqual(error.detalles, { claves: ['clave_repetida_entre_propositos'] })

  assert.ok((await llamar('PUT', [String(id), 'mcp'], { claves: [
    { kid: 'a', pem: pemDe('x'), proposito: 'mcp' }, { kid: 'b', pem: pemDe('x'), proposito: 'mcp' }
  ] })).cuerpo.data)
})

test('los 422 de claves con explicación propia se dicen en español claro, y el resto conserva el mensaje de la API', () => {
  assert.match(mensajeDeErrorDeClaves({ claves: ['proposito_inmutable'] }, 'validation_failed', 'raw'), /no cambia de propósito/)
  assert.match(mensajeDeErrorDeClaves({ claves: ['clave_repetida_entre_propositos'] }, undefined, 'raw'), /misma clave/)
  assert.match(mensajeDeErrorDeClaves(undefined, 'proposito_inmutable', 'raw'), /no cambia de propósito/)
  assert.match(mensajeDeErrorDeClaves({ claves: ['max_active'] }, undefined, 'raw'), /dos claves vigentes/)
  assert.equal(mensajeDeErrorDeClaves({ claves: ['otra'] }, 'validation_failed', 'raw'), 'raw')
  assert.equal(mensajeDeErrorDeClaves({ claves: 'x' }, undefined, 'raw'), 'raw')
  assert.equal(mensajeDeErrorDeClaves(undefined, undefined, 'raw'), 'raw')
  assert.equal(mensajeDeErrorDeClaves({ claves: ['toString'] }, undefined, 'raw'), 'raw')
})

test('el mock incluye un rechazo por propósito equivocado y ninguna fila ip_bloqueada', async () => {
  const id = await crearSistema('mock-doce')
  const llamadas = leerLlamadas((await llamar('GET', [String(id), 'mcp', 'llamadas'])).cuerpo.data)

  assert.ok(llamadas.some((l) => l.reason === 'proposito_equivocado'))
  assert.ok(llamadas.every((l) => l.reason !== 'ip_bloqueada'))
})
