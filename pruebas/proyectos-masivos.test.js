import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cambiarProyectos } from '../src/componentes/proyecto/proyectos-masivos.ts'

test('acciones masivas validan, deduplican, usan endpoints existentes y conservan fallos parciales', async () => {
  const llamadas = []
  const solicitar = async (url, opciones) => {
    llamadas.push([url, opciones])
    return url.includes('/2')
      ? new Response(JSON.stringify({ error: { message: 'Sin permiso' } }), { status: 403 })
      : new Response('{}')
  }
  await assert.rejects(cambiarProyectos([], { status: 4 }, solicitar))
  await assert.rejects(cambiarProyectos([0], { status: 4 }, solicitar))
  await assert.rejects(cambiarProyectos([1], { status: NaN }, solicitar))
  assert.equal(llamadas.length, 0)
  assert.deepEqual(await cambiarProyectos([1, 2, 1], { status: 4 }, solicitar), {
    aplicados: 1, fallos: [{ id: 2, mensaje: 'Sin permiso' }]
  })
  assert.equal(llamadas.length, 2)
  assert.equal(llamadas[0][1].method, 'PATCH')
  assert.equal(llamadas[0][1].body, '{"status":4}')
  await cambiarProyectos([1], { archive: true }, solicitar)
  assert.equal(llamadas.at(-1)[0], '/api/bff/projects/1/actions/archive')
  assert.equal(llamadas.at(-1)[1].method, 'POST')
  await cambiarProyectos([1], { archive: false }, solicitar)
  assert.equal(llamadas.at(-1)[0], '/api/bff/projects/1/actions/unarchive')
  const resultado = await cambiarProyectos([1], { status: 4 }, async () => { throw new Error('offline') })
  assert.equal(resultado.aplicados, 0)
  assert.match(resultado.fallos[0].mensaje, /No se pudo confirmar/)
})
