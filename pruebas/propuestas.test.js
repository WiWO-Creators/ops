/**
 * Pruebas de las propuestas externas: que lo que llega de otro sistema no pueda colar un enlace
 * peligroso, que una fila rota no se lleve a las demás y que el plazo se diga en su unidad.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aAccionIA, contarPendientes, leerPropuestas, leerVinculos, textoDeRestante, urlHttps } from '../src/dominio/propuestas.ts'

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
