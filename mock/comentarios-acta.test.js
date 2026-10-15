/**
 * El módulo de comentarios en línea del mock sirve el mismo contrato que el board (fase 10): si se
 * desvía, el panel se probaría contra algo que la API real no hace.
 */

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { comentariosDelActaRuta, comentariosEncendidos, opcionesDeComentarios } from './comentarios-acta.js'

const ANA = { id: 1, is_admin: false }
const LUIS = { id: 2, is_admin: false }
const ADMIN = { id: 3, is_admin: true }
const autorDe = (id) => ({ staff_name: `Persona ${id}`, staff_image: null })

let acta = 100

beforeEach(() => {
  process.env.MOCK_EN_VIVO = '1'
  delete process.env.MOCK_COMENTARIOS
  acta += 1
})

afterEach(() => {
  delete process.env.MOCK_EN_VIVO
  delete process.env.MOCK_COMENTARIOS
})

const llamar = async (metodo, resto, actual, cuerpo) => await comentariosDelActaRuta(
  metodo, resto, acta, actual, async () => cuerpo ?? {}, autorDe
)

test('apagado contesta 404 y el ajuste lo refleja', async () => {
  process.env.MOCK_COMENTARIOS = '0'

  assert.equal(comentariosEncendidos(), false)
  assert.equal(opcionesDeComentarios().wiwo_acta_comentarios.value, '0')
  await assert.rejects(llamar('GET', [], ANA), (fallo) => fallo.estado === 404)
})

test('sin el maestro de «en vivo» también está apagado', async () => {
  delete process.env.MOCK_EN_VIVO

  assert.equal(opcionesDeComentarios().wiwo_acta_comentarios.value, '0')
  await assert.rejects(llamar('GET', [], ANA), (fallo) => fallo.estado === 404)
})

test('crea un hilo con ancla, lo lista y marca `mine` según quien pregunta', async () => {
  const creado = await llamar('POST', [], ANA, { content: ' Revisar el plazo ', anchor: 'abc_1', mentions: [2, 2] })

  assert.equal(creado.estado, 201)
  assert.equal(creado.cuerpo.data.anchor, 'abc_1')
  assert.equal(creado.cuerpo.data.comments[0].content, 'Revisar el plazo')
  assert.deepEqual(creado.cuerpo.data.comments[0].mentions, [2])

  const deLuis = await llamar('GET', [], LUIS)

  assert.equal(deLuis.cuerpo.data.length, 1)
  assert.equal(deLuis.cuerpo.data[0].comments[0].mine, false)
  assert.equal((await llamar('GET', [], ANA)).cuerpo.data[0].comments[0].mine, true)
})

test('rechaza ancla inválida o repetida, texto vacío o pasado de 2000, menciones malas y claves de más', async () => {
  const malos = [
    { content: 'x', anchor: 'con espacio' },
    { content: '   ', anchor: 'ok1' },
    { content: 'a'.repeat(2001), anchor: 'ok1' },
    { content: 'x', anchor: 'ok1', mentions: ['a'] },
    { content: 'x', anchor: 'ok1', mentions: Array.from({ length: 21 }, (_, i) => i + 1) },
    { content: 'x', anchor: 'ok1', extra: true },
    { content: 'x' }
  ]

  for (const cuerpo of malos) {
    await assert.rejects(llamar('POST', [], ANA, cuerpo), (fallo) => fallo.estado === 422, JSON.stringify(cuerpo).slice(0, 60))
  }

  await llamar('POST', [], ANA, { content: 'uno', anchor: 'repetida' })
  await assert.rejects(llamar('POST', [], ANA, { content: 'dos', anchor: 'repetida' }), (fallo) => fallo.estado === 422)
})

test('responde a un hilo; un hilo inexistente es 404 y uno que no es un id es 422', async () => {
  const { cuerpo: hilo } = await llamar('POST', [], ANA, { content: 'raíz', anchor: 'r1' })
  const respuesta = await llamar('POST', [], LUIS, { content: 'listo', hilo: hilo.data.id })

  assert.equal(respuesta.cuerpo.data.comments.length, 2)
  await assert.rejects(llamar('POST', [], LUIS, { content: 'x', hilo: 99999 }), (fallo) => fallo.estado === 404)
  await assert.rejects(llamar('POST', [], LUIS, { content: 'x', hilo: 'a' }), (fallo) => fallo.estado === 422)
})

test('editar es solo del autor (403) y marca la fecha de edición', async () => {
  const { cuerpo: hilo } = await llamar('POST', [], ANA, { content: 'antes', anchor: 'e1' })
  const id = String(hilo.data.id)

  await assert.rejects(llamar('PATCH', [id], LUIS, { content: 'intruso' }), (fallo) => fallo.estado === 403)

  const editado = await llamar('PATCH', [id], ANA, { content: 'después', mentions: [2] })

  assert.equal(editado.cuerpo.data.comments[0].content, 'después')
  assert.notEqual(editado.cuerpo.data.comments[0].date_edited, null)
})

test('resolver y reabrir; un cuerpo con otra cosa es 422', async () => {
  const { cuerpo: hilo } = await llamar('POST', [], ANA, { content: 'x', anchor: 'res1' })
  const id = String(hilo.data.id)

  assert.equal((await llamar('POST', [id, 'resolver'], LUIS)).cuerpo.data.resolved, true)
  assert.equal((await llamar('POST', [id, 'resolver'], LUIS, { resolved: false })).cuerpo.data.resolved, false)
  await assert.rejects(llamar('POST', [id, 'resolver'], LUIS, { resolved: 'sí' }), (fallo) => fallo.estado === 422)
  await assert.rejects(llamar('POST', [id, 'resolver'], LUIS, { otra: 1 }), (fallo) => fallo.estado === 422)
})

test('borrar: el autor o un admin; una raíz se lleva el hilo y una respuesta solo ella', async () => {
  const { cuerpo: hilo } = await llamar('POST', [], ANA, { content: 'raíz', anchor: 'b1' })
  const { cuerpo: conRespuesta } = await llamar('POST', [], LUIS, { content: 'resp', hilo: hilo.data.id })
  const respuestaId = String(conRespuesta.data.comments[1].id)

  await assert.rejects(llamar('DELETE', [respuestaId], ANA), (fallo) => fallo.estado === 403)
  assert.equal((await llamar('DELETE', [respuestaId], LUIS)).estado, 204)
  assert.equal((await llamar('GET', [String(hilo.data.id)], ANA)).cuerpo.data.comments.length, 1)

  assert.equal((await llamar('DELETE', [String(hilo.data.id)], ADMIN)).estado, 204)
  assert.deepEqual((await llamar('GET', [], ANA)).cuerpo.data, [])
  await assert.rejects(llamar('GET', [String(hilo.data.id)], ANA), (fallo) => fallo.estado === 404)
})

test('rutas inventadas y verbos que no existen son 404', async () => {
  await assert.rejects(llamar('PUT', [], ANA), (fallo) => fallo.estado === 404)
  await assert.rejects(llamar('GET', ['abc'], ANA), (fallo) => fallo.estado === 404)
  await assert.rejects(llamar('GET', ['1', 'otra'], ANA), (fallo) => fallo.estado === 404)
})
