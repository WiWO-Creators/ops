/**
 * Pruebas de las propuestas externas: que lo que llega de otro sistema no pueda colar un enlace
 * peligroso, que una fila rota no se lleve a las demás y que el plazo se diga en su unidad.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aAccionIA, contarPendientes, leerProcedencia, leerPropuestas, leerVinculos, textoDeRestante, urlHttps } from '../src/dominio/propuestas.ts'

const buena = {
  id: 4, tool: 'crear_tarea', summary: 'Crear «Revisar métricas»', detail: ['Proyecto: Nestlé'], assumptions: [],
  state: 'pendiente', result: null, expires_at: '2026-10-10T12:00:00Z', created_at: '2026-10-07T12:00:00Z',
  origin: { system: 'metriq', name: 'Metriq' }, link: { external_id: 'm-9', url: 'https://metriq.wiwo.me/a/9' }
}

test('solo se acepta https en los enlaces que vienen de otro sistema', () => {
  assert.equal(urlHttps('https://metriq.wiwo.me/a'), 'https://metriq.wiwo.me/a')

  for (const malo of ['javascript:alert(1)', 'http://metriq.wiwo.me', 'data:text/html,x', '//x.com', 'no es url', null, 5]) {
    assert.equal(urlHttps(malo), null, `${String(malo)} no debería servir`)
  }
})

test('una fila rota no se lleva a las demás', () => {
  const lista = leerPropuestas([buena, { id: 5 }, { ...buena, id: 6, state: 'rara' }, { ...buena, id: 7, summary: '' }, 'x'])

  assert.deepEqual(lista.map((p) => p.id), [4])
  assert.equal(lista[0].link.url, 'https://metriq.wiwo.me/a/9')
  assert.deepEqual(leerPropuestas(null), [])
})

test('un enlace no https de una propuesta queda sin url', () => {
  const [p] = leerPropuestas([{ ...buena, link: { external_id: 'm-9', url: 'javascript:alert(1)' } }])

  assert.equal(p.link.url, '')
})

test('la tarjeta recibe la propuesta en su forma de siempre', () => {
  const [p] = leerPropuestas([buena])
  const accion = aAccionIA(p)

  assert.deepEqual(accion, {
    id: 4, herramienta: 'crear_tarea', resumen: 'Crear «Revisar métricas»', detalle: ['Proyecto: Nestlé'],
    supuestos: [], estado: 'pendiente', resultado: null, expira_en: '2026-10-10T12:00:00Z'
  })
})

test('los vínculos de una tarea toleran el campo ausente y el enlace inseguro', () => {
  assert.deepEqual(leerVinculos(undefined), [])

  const [v] = leerVinculos([{ system: 'metriq', external_id: 'm-9', url: 'http://inseguro' }, { system: '' }])

  assert.deepEqual(v, { system: 'metriq', external_id: 'm-9', url: null })
})

test('el plazo se dice en minutos, horas o días', () => {
  assert.equal(textoDeRestante(30), 'menos de un minuto')
  assert.equal(textoDeRestante(60), '1 minuto')
  assert.equal(textoDeRestante(25 * 60), '25 minutos')
  assert.equal(textoDeRestante(3 * 3600), '3 horas')
  assert.equal(textoDeRestante(72 * 3600), '3 días')
})

test('el contador solo cuenta las pendientes que no vencieron', () => {
  const [a] = leerPropuestas([buena])
  const ahora = Date.parse('2026-10-08T00:00:00Z')

  assert.equal(contarPendientes([a], ahora), 1)
  assert.equal(contarPendientes([a], Date.parse('2026-10-11T00:00:00Z')), 0)
  assert.equal(contarPendientes([{ ...a, state: 'ejecutada' }], ahora), 0)
  assert.equal(contarPendientes([{ ...a, expires_at: null }], ahora), 1)
})

test('una propuesta sin los campos nuevos se lee sin huella, sin enlace, no visible y sin procedencia', () => {
  const [p] = leerPropuestas([buena])

  assert.equal(p.args_hash, null)
  assert.equal(p.url_ops, null)
  assert.equal(p.visible_to_client, false)
  assert.equal(p.provenance, null)
})

test('huella, enlace profundo y visibilidad al cliente se leen; solo `true` cuenta como visible', () => {
  const [p] = leerPropuestas([{ ...buena, args_hash: 'abc123', url_ops: 'https://ops.wiwo.me/propuestas/4', visible_to_client: true }])

  assert.equal(p.args_hash, 'abc123')
  assert.equal(p.url_ops, 'https://ops.wiwo.me/propuestas/4')
  assert.equal(p.visible_to_client, true)

  for (const raro of [1, 'true', null, undefined, {}]) {
    assert.equal(leerPropuestas([{ ...buena, visible_to_client: raro }])[0].visible_to_client, false, String(raro))
  }

  assert.equal(leerPropuestas([{ ...buena, url_ops: 'javascript:alert(1)' }])[0].url_ops, null)
  assert.equal(leerPropuestas([{ ...buena, args_hash: '' }])[0].args_hash, null)
})

test('la procedencia nunca es de confianza, aunque la API diga lo contrario', () => {
  const leida = leerProcedencia({ trusted: true, data: { alerta: 'Caída', n: 3, ok: false } })

  assert.equal(leida.trusted, false)
  assert.deepEqual(leida.data, { alerta: 'Caída', n: '3', ok: 'false' })
})

test('la procedencia descarta lo que no es texto plano y queda en null si no sobra nada', () => {
  assert.deepEqual(leerProcedencia({ data: { a: 'x', b: { anidado: 1 }, c: ['l'], d: null } }).data, { a: 'x' })

  for (const vacia of [null, undefined, 'texto', [], {}, { data: null }, { data: [] }, { data: {} }, { data: { b: { x: 1 } } }]) {
    assert.equal(leerProcedencia(vacia), null, JSON.stringify(vacia))
  }
})

test('la procedencia con marcas HTML queda como texto, sin interpretar', () => {
  const leida = leerProcedencia({ data: { nota: '<img src=x onerror=alert(1)>' } })

  assert.equal(leida.data.nota, '<img src=x onerror=alert(1)>')
})
