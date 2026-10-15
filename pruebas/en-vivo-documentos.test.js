/**
 * Pruebas de los documentos colaborativos (Meeting Paper) de «Ops en vivo».
 *
 * Servicio real + board falso firmado + clientes `@hocuspocus/provider` en Node. Lo que se protege:
 * que dos personas converjan, que el board reciba UN guardado por tanda de ediciones con los autores
 * de las dos, que un conflicto se resuelva recargando lo del board, que sin boleto bueno no se entre y
 * que perder el acceso cierre la edición en vez de guardar a ciegas.
 */

import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as esperar } from 'node:timers/promises'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import {
  WebSocketConOrigen,
  boletoDe,
  crearBoardFalso,
  enviarEventos,
  esperarHasta,
  evento,
  iniciarServicio
} from './apoyo/en-vivo.mjs'

const recursos = []

afterEach(async () => {
  for (const cierre of recursos.splice(0).reverse()) await cierre()
})

/** Levanta board falso y servicio; ambos se cierran solos al terminar la prueba. */
async function montar (opciones = {}, entorno = {}) {
  const board = await crearBoardFalso(opciones)
  const servicio = await iniciarServicio({ board, entorno })

  recursos.push(board.cerrar, servicio.cerrar)

  return { board, servicio }
}

/** Un cliente colaborativo: su Y.Doc, lo que le llega por stateless y si se sincronizó. */
function conectar (servicio, { staffId, boleto, nombre = 'acta:12' }) {
  const ydoc = new Y.Doc()
  const cliente = { ydoc, statelesss: [], sincronizado: false, fallo: false }

  cliente.provider = new HocuspocusProvider({
    url: servicio.urlDoc,
    name: nombre,
    document: ydoc,
    token: boleto ?? boletoDe({ suj: 'staff', id: staffId, salas: [], doc: nombre, esp: 3 }),
    WebSocketPolyfill: WebSocketConOrigen,
    onSynced: ({ state }) => { cliente.sincronizado = state },
    onStateless: ({ payload }) => cliente.statelesss.push(JSON.parse(payload)),
    onAuthenticationFailed: () => { cliente.fallo = true }
  })
  recursos.push(async () => { cliente.provider.destroy() })

  return cliente
}

/** El texto del documento, párrafo por párrafo, según el esquema de ProseMirror. */
function textos (ydoc) {
  const { content = [] } = yDocToProsemirrorJSON(ydoc, 'default')

  return content.map((nodo) => (nodo.content ?? []).map((hijo) => hijo.text ?? '').join(''))
}

/** Escribe un párrafo nuevo al final, como lo haría el editor de esa persona. */
function agregarParrafo (ydoc, texto) {
  const fragmento = ydoc.getXmlFragment('default')
  const parrafo = new Y.XmlElement('paragraph')
  const contenido = new Y.XmlText()

  contenido.insert(0, texto)
  parrafo.insert(0, [contenido])
  fragmento.insert(fragmento.length, [parrafo])
}

test('dos personas convergen y el board recibe UN guardado con los dos autores', async () => {
  const { board, servicio } = await montar({ content: '<h1>Título</h1><p>Inicial</p>' })
  const ana = conectar(servicio, { staffId: 11 })
  const beto = conectar(servicio, { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado, 4000, 'sincronizar los dos clientes')
  assert.deepEqual(textos(ana.ydoc), ['Título', 'Inicial'])
  assert.deepEqual(textos(beto.ydoc), ['Título', 'Inicial'])

  agregarParrafo(ana.ydoc, 'Línea de Ana')
  agregarParrafo(beto.ydoc, 'Línea de Beto')

  await esperarHasta(() => board.estado.puts.length >= 1, 4000, 'el guardado en el board')
  await esperar(600)

  assert.equal(board.estado.puts.length, 1, 'un solo PUT tras las dos ediciones')

  const [put] = board.estado.puts

  assert.equal(put.origen, 'colaborativo')
  assert.equal(put.espacio_id, 3)
  assert.equal(put.revision, 'r1')
  assert.deepEqual([...put.autores].sort(), [11, 22])
  assert.ok([11, 22].includes(put.staff_id))
  assert.ok(put.content.includes('Línea de Ana') && put.content.includes('Línea de Beto'))
  assert.deepEqual(textos(ana.ydoc), textos(beto.ydoc))
  assert.equal(textos(ana.ydoc).length, 4)

  // Los dos se enteran de que quedó guardado, con la revisión nueva.
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'guardado') && beto.statelesss.some((m) => m.t === 'guardado'))
  assert.equal(ana.statelesss.find((m) => m.t === 'guardado').revision, board.estado.revision)
})

test('sin cambios no se guarda nada', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  await esperar(500)
  assert.equal(board.estado.puts.length, 0)
})

test('un 409 recarga lo que tiene el board y avisa «recargado»', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  // Alguien guarda el acta por otra vía mientras Ana escribe.
  board.estado.editarPorFuera('<p>Versión de otra persona</p>')
  agregarParrafo(ana.ydoc, 'Esto se pierde')

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'), 4000, 'el aviso de recarga')
  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'conflicto' })
  await esperarHasta(() => textos(ana.ydoc).join('|') === 'Versión de otra persona')
  assert.equal(board.estado.puts.length, 0)
})

test('un evento «acta» del board con una revisión nueva recarga a los conectados', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)

  // Mismo contenido y revisión: el evento no recarga nada.
  await enviarEventos(servicio.urlBase, [evento('acta', 12, { espacio: true }, 3)])
  await esperar(300)
  assert.equal(ana.statelesss.some((m) => m.t === 'recargado'), false)

  board.estado.editarPorFuera('<p>Editada fuera</p>')
  await enviarEventos(servicio.urlBase, [evento('acta', 12, { espacio: true }, 3)])
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'))

  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'externo' })
  await esperarHasta(() => textos(ana.ydoc).join('|') === 'Editada fuera')
})

test('si el board niega el acta al guardar, se avisa «sin_acceso» y se cierra', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  board.estado.estadoPut = 403
  agregarParrafo(ana.ydoc, 'No debería guardarse')

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'sin_acceso'), 4000, 'el aviso de sin acceso')
  assert.equal(board.estado.puts.length, 0)
})

test('si el board falla (5xx) el guardado se reintenta y no se pierde', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  board.estado.estadoPut = 503
  agregarParrafo(ana.ydoc, 'Sobrevive al fallo')
  await esperar(500)
  assert.equal(board.estado.puts.length, 0)

  board.estado.estadoPut = null
  await esperarHasta(() => board.estado.puts.length === 1, 8000, 'el reintento')
  assert.ok(board.estado.puts[0].content.includes('Sobrevive al fallo'))
})

test('al irse la última persona se guarda sin esperar el debounce', async () => {
  // Debounce de 5 s: si el guardado llega antes, es por el cierre y no por la espera.
  const { board, servicio } = await montar({}, { EN_VIVO_DEBOUNCE_MS: '5000', EN_VIVO_MAX_DEBOUNCE_MS: '9000' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  agregarParrafo(ana.ydoc, 'Último cambio')
  await esperar(100)
  ana.provider.destroy()

  await esperarHasta(() => board.estado.puts.length === 1, 2000, 'el guardado al cerrar')
  assert.deepEqual(board.estado.puts[0].autores, [11])
})

test('un boleto malo, de otro documento o de otro Espacio no entra', async () => {
  const { servicio } = await montar()
  const malo = conectar(servicio, { staffId: 11, boleto: 'no.es-un-boleto' })
  const otroDoc = conectar(servicio, { staffId: 11, boleto: boletoDe({ suj: 'staff', id: 11, salas: [], doc: 'acta:99', esp: 3 }) })
  const sinDoc = conectar(servicio, { staffId: 11, boleto: boletoDe({ suj: 'staff', id: 11, salas: ['equipo'] }) })
  const deContacto = conectar(servicio, { staffId: 11, boleto: boletoDe({ suj: 'contacto', id: 11, salas: [], doc: 'acta:12', esp: 3 }) })
  const otroEspacio = conectar(servicio, { staffId: 11, boleto: boletoDe({ suj: 'staff', id: 11, salas: [], doc: 'acta:12', esp: 4 }) })

  await esperarHasta(() => [malo, otroDoc, sinDoc, deContacto, otroEspacio].every((c) => c.fallo), 4000, 'todos rechazados')
  for (const cliente of [malo, otroDoc, sinDoc, deContacto, otroEspacio]) assert.equal(cliente.sincronizado, false)
})

test('un documento que no es un acta se rechaza', async () => {
  const { servicio } = await montar()
  const raro = conectar(servicio, { staffId: 11, nombre: 'cosa:1', boleto: boletoDe({ suj: 'staff', id: 11, salas: [], doc: 'acta:12', esp: 3 }) })

  await esperarHasta(() => raro.fallo)
})

test('si el board no tiene el acta, nadie se sincroniza', async () => {
  const { board, servicio } = await montar()

  board.estado.estadoGet = 404

  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => board.estado.gets >= 1, 4000, 'la lectura del acta')
  await esperar(300)
  assert.equal(ana.sincronizado, false)
})

test('el servicio firma sus llamadas al board', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  assert.equal(board.estado.gets, 1)
  assert.equal(board.estado.firmasInvalidas, 0)
})
