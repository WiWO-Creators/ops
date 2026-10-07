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
  DOMINIOS_MCP, EVENTOS_MCP, alternarEnLista, leerLlamadas, leerSistemaMcp,
  motivoDeClaveInvalida, motivoDeSlugInvalido, motivoDeTtlInvalido
} from '../src/dominio/mcp-externo.ts'

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
  assert.deepEqual(sistema.keys, [{ kid: 'k1', since: '2026-01-01T00:00:00Z', until: null }])
  assert.deepEqual(sistema.domains, ['nucleo'])
  assert.deepEqual(sistema.events, [])
  assert.equal(sistema.proposal_ttl_hours, 72)
})

test('leer llamadas descarta filas sin id y completa lo que falta', () => {
  assert.deepEqual(leerLlamadas('no es lista'), [])

  const [fila, ...resto] = leerLlamadas([{ id: 1, tool: 'mis_tareas', code: 'ok', ms: 12, staff_id: 5 }, { tool: 'x' }])

  assert.equal(resto.length, 0)
  assert.equal(fila.tool, 'mis_tareas')
  assert.equal(fila.created_at, null)
})
