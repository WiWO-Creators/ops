/**
 * Pruebas de los documentos colaborativos (Meeting Paper) de «Ops en vivo».
 *
 * Servicio real + board falso firmado + clientes `@hocuspocus/provider` en Node. Lo que se protege:
 * que dos personas converjan, que el board reciba UN guardado por tanda de ediciones con los autores
 * de las dos, que un conflicto se resuelva recargando lo del board, que sin boleto bueno no se entre y
 * que perder el acceso cierre la edición en vez de guardar a ciegas. También `interno/actas/{id}/aplicar`:
 * el Thinking Orb escribe en un acta abierta con su propio cursor y el guardado sale con origen `orb`.
 */

import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as esperar } from 'node:timers/promises'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import { firmar } from '../src/lib/en-vivo/firma.ts'
import {
  SECRETO,
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

  const revisionInicial = board.estado.revision

  assert.match(revisionInicial, /^\d{4}-\d{2}-\d{2}T[\d:]+Z~[0-9a-f]{16}$/, 'la revisión del acta es un texto opaco «<ISO>~huella»')

  agregarParrafo(ana.ydoc, 'Línea de Ana')
  agregarParrafo(beto.ydoc, 'Línea de Beto')

  await esperarHasta(() => board.estado.puts.length >= 1, 4000, 'el guardado en el board')
  await esperar(600)

  assert.equal(board.estado.puts.length, 1, 'un solo PUT tras las dos ediciones')

  const [put] = board.estado.puts

  assert.equal(put.origen, 'colaborativo')
  assert.equal(put.espacio_id, 3)
  assert.equal(put.revision, revisionInicial)
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

test('un 409 combina lo del board con lo que Ana escribió (3 bandas), avisa «fusionado» y guarda lo combinado', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  // Alguien guarda el acta por otra vía mientras Ana escribe.
  board.estado.editarPorFuera('<p>Versión de otra persona</p>')
  const revisionAjena = board.estado.revision

  agregarParrafo(ana.ydoc, 'Esto no se pierde')

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'), 4000, 'el aviso de fusión')
  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'fusionado' })
  await esperarHasta(() => board.estado.puts.length === 1, 6000, 'el guardado de lo combinado')

  assert.deepEqual(textos(ana.ydoc), ['Versión de otra persona', 'Esto no se pierde'])
  assert.equal(board.estado.puts[0].revision, revisionAjena, 'se guarda sobre la revisión nueva del board')
  assert.ok(board.estado.puts[0].content.includes('Versión de otra persona') && board.estado.puts[0].content.includes('Esto no se pierde'))
})

test('un evento «acta» con una revisión nueva combina con el texto sin guardar en vez de descartarlo', async () => {
  const { board, servicio } = await montar({ content: '<p>Uno</p><p>Dos</p>' }, { EN_VIVO_DEBOUNCE_MS: '8000', EN_VIVO_MAX_DEBOUNCE_MS: '9000' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  anexarTexto(ana.ydoc, 1, ' de Ana')
  await esperar(200)

  board.estado.editarPorFuera('<p>Uno ajeno</p><p>Dos</p>')
  await enviarEventos(servicio.urlBase, [evento('acta', 12, { espacio: true }, 3)])
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'), 4000, 'el aviso')

  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'fusionado' })
  await esperarHasta(() => textos(ana.ydoc).join('|') === 'Uno ajeno|Dos de Ana', 3000, 'los dos cambios juntos')
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

test('si el board niega a quien guardaba (403), se lo descarta y se guarda como otro editor sin cerrar a nadie', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })
  const beto = conectar(servicio, { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)
  board.estado.denegarA.add(22)

  agregarParrafo(ana.ydoc, 'Línea de Ana')
  await esperar(100)
  agregarParrafo(beto.ydoc, 'Línea de Beto')

  await esperarHasta(() => board.estado.puts.length === 1, 6000, 'el guardado como Ana')

  const [put] = board.estado.puts

  assert.equal(put.staff_id, 11)
  assert.deepEqual(put.autores, [11], 'Beto ya no figura como autor')
  assert.equal(ana.statelesss.some((m) => m.t === 'sin_acceso') || beto.statelesss.some((m) => m.t === 'sin_acceso'), false)
  assert.equal(ana.fallo || beto.fallo, false)

  // Beto quedó en solo lectura: lo que escriba después no entra al documento ni cuenta como autoría.
  agregarParrafo(beto.ydoc, 'Beto sigue escribiendo')
  await esperar(600)
  assert.equal(textos(ana.ydoc).includes('Beto sigue escribiendo'), false)
  assert.equal(board.estado.puts.length, 1)
})

test('si el único editor es negado (403) se recarga lo del board; solo si el acta ya no existe se cierra', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  board.estado.denegarA.add(11)
  agregarParrafo(ana.ydoc, 'No debería guardarse')

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'), 4000, 'la recarga')
  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'sin_permiso' })
  assert.equal(ana.statelesss.some((m) => m.t === 'sin_acceso'), false)
  await esperarHasta(() => textos(ana.ydoc).join('|') === 'Inicial')
  assert.equal(board.estado.puts.length, 0)

  // Ya sin permiso para guardar y con el acta fuera de alcance: ahí sí, sin acceso.
  const otra = await montar()
  const beto = conectar(otra.servicio, { staffId: 22 })

  await esperarHasta(() => beto.sincronizado)
  otra.board.estado.estadoPut = 403
  otra.board.estado.estadoGet = 404
  agregarParrafo(beto.ydoc, 'No debería guardarse')
  await esperarHasta(() => beto.statelesss.some((m) => m.t === 'sin_acceso'), 4000, 'el aviso de sin acceso')
  assert.equal(otra.board.estado.puts.length, 0)
})

test('un boleto sin escritura abre el acta en solo lectura: no escribe, no figura como autor y no provoca 403', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })
  const lector = conectar(servicio, {
    staffId: 33,
    boleto: boletoDe({ suj: 'staff', id: 33, salas: [], doc: 'acta:12', esp: 3, escritura: false })
  })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => lector.sincronizado && ana.sincronizado)
  board.estado.denegarA.add(33)

  agregarParrafo(lector.ydoc, 'Lo que el lector intenta escribir')
  await esperar(700)
  assert.deepEqual(textos(ana.ydoc), ['Inicial'])
  assert.equal(board.estado.puts.length, 0)

  agregarParrafo(ana.ydoc, 'Línea de Ana')
  await esperarHasta(() => board.estado.puts.length === 1, 4000, 'el guardado de Ana')
  assert.deepEqual(board.estado.puts[0].autores, [11])
  assert.equal(board.estado.puts[0].staff_id, 11)
  assert.equal(ana.statelesss.some((m) => m.t === 'sin_acceso') || lector.statelesss.some((m) => m.t === 'sin_acceso'), false)
  await esperarHasta(() => textos(lector.ydoc).includes('Línea de Ana'), 3000, 'que el lector vea lo de Ana')
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

test('un 422 del board avisa «no_guardado» y cierra el documento para que cada cliente siga en el editor de siempre', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  board.estado.estadoPut = 422
  agregarParrafo(ana.ydoc, 'No entra')

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'no_guardado'), 6000, 'el aviso no_guardado')
  assert.equal(board.estado.puts.length, 0)
  await esperarHasta(() => servicio.servicio.documentosCargados() === 0, 4000, 'el documento se suelta')
})

test('un socket de documento que no se autentica a tiempo se cierra con 4408', async () => {
  const { servicio } = await montar({}, { EN_VIVO_ESPERA_HOLA_MS: '300' })
  const ws = new WebSocketConOrigen(servicio.urlDoc)
  const codigo = await new Promise((resolver) => ws.on('close', (c) => resolver(c)))

  assert.equal(codigo, 4408)
})

test('los sockets de documento pasan el tope propio: el excedente se cierra con 4429 y los demás siguen', async () => {
  const { servicio } = await montar({}, { EN_VIVO_MAX_CONEXIONES_DOC: '1' })
  const primero = new WebSocketConOrigen(servicio.urlDoc)

  await new Promise((resolver) => primero.once('open', resolver))

  const segundo = new WebSocketConOrigen(servicio.urlDoc)
  const codigo = await new Promise((resolver) => segundo.on('close', (c) => resolver(c)))

  assert.equal(codigo, 4429)
  assert.equal(primero.readyState, primero.OPEN)
  primero.terminate()
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

/** Lo que el board manda al servicio para que el orbe escriba en un acta abierta. */
async function aplicarComoBoard (servicio, { id = 12, html, base = '<p>Inicial</p>', revision = null, crudo = null, staffId = 22, espacioId = 3, secreto = SECRETO } = {}) {
  const cuerpo = crudo ?? JSON.stringify({ html, base, revision, staff_id: staffId, espacio_id: espacioId })
  const respuesta = await fetch(`${servicio.urlBase}/interno/actas/${id}/aplicar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...firmar(secreto, 'POST', `interno/actas/${id}/aplicar`, cuerpo) },
    body: cuerpo
  })

  return { estado: respuesta.status, datos: await respuesta.json() }
}

/** Anota cada estado de awareness del orbe que ve un cliente (nombre, color y si trae cursor). */
function observarOrbe (cliente) {
  const vistos = []

  cliente.provider.awareness.on('update', () => {
    for (const estado of cliente.provider.awareness.getStates().values()) {
      if (estado.user?.name === 'Thinking Orb') vistos.push({ color: estado.user.color, conCursor: estado.cursor != null })
    }
  })

  return {
    vistos,
    /** ¿Queda algún orbe en el awareness del cliente? */
    presente: () => [...cliente.provider.awareness.getStates().values()].some((estado) => estado.user?.name === 'Thinking Orb')
  }
}

test('aplicar sin nadie conectado responde 404 y no toca el acta', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })

  const sinDocumento = await aplicarComoBoard(servicio, { html: '<p>Nuevo</p>' })

  assert.equal(sinDocumento.estado, 404)
  assert.deepEqual(sinDocumento.datos, { abierta: false })

  // Alguien abre y cierra: sin conexiones el documento deja de estar «abierto».
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)
  ana.provider.destroy()
  await esperarHasta(() => servicio.servicio.documentosCargados() === 0, 3000, 'descargar el documento')

  const trasCerrar = await aplicarComoBoard(servicio, { html: '<p>Nuevo</p>' })

  assert.equal(trasCerrar.estado, 404)
  assert.equal(board.estado.puts.length, 0)
})

test('aplicar exige firma, cuerpo válido y el Espacio del acta abierta', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)

  assert.equal((await aplicarComoBoard(servicio, { html: '<p>x</p>', secreto: 'otro-secreto-que-no-es-el-del-servicio-123' })).estado, 401)
  assert.equal((await aplicarComoBoard(servicio, { crudo: '{"html":5,"base":"<p>Inicial</p>","staff_id":22,"espacio_id":3}' })).estado, 422)
  assert.equal((await aplicarComoBoard(servicio, { crudo: '{"html":"<p>x</p>","base":"<p>Inicial</p>","staff_id":0,"espacio_id":3}' })).estado, 422)
  assert.equal((await aplicarComoBoard(servicio, { crudo: '{"html":"<p>x</p>","staff_id":22,"espacio_id":3}' })).estado, 422, 'sin base no hay 3 bandas')
  assert.equal((await aplicarComoBoard(servicio, { crudo: '{"html":"<p>x</p>","base":7,"staff_id":22,"espacio_id":3}' })).estado, 422)
  assert.equal((await aplicarComoBoard(servicio, { crudo: '{"html":"<p>x</p>","base":"","revision":5,"staff_id":22,"espacio_id":3}' })).estado, 422)
  assert.equal((await aplicarComoBoard(servicio, { crudo: 'no es json {' })).estado, 422)
  assert.equal((await aplicarComoBoard(servicio, { html: '<p>x</p>', espacioId: 4 })).estado, 404)

  await esperar(300)
  assert.deepEqual(textos(ana.ydoc), ['Inicial'])
  assert.equal(board.estado.puts.length, 0)
})

test('el orbe escribe por tramos con su cursor, y el guardado sale con origen orb y quien lo pidió', async () => {
  const { board, servicio } = await montar({ content: '<h1>Acta</h1><p>Uno</p><p>Dos</p>' })
  const ana = conectar(servicio, { staffId: 11 })
  const beto = conectar(servicio, { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)

  const orbe = observarOrbe(ana)
  const revisionInicial = board.estado.revision
  const respuesta = await aplicarComoBoard(servicio, {
    html: '<h1>Acta</h1><p>Uno corregido</p><p>Dos</p><p>Tres</p>',
    base: '<h1>Acta</h1><p>Uno</p><p>Dos</p>',
    revision: revisionInicial,
    staffId: 33
  })

  assert.equal(respuesta.estado, 202)
  assert.deepEqual(respuesta.datos, { aplicada: true })

  await esperarHasta(() => board.estado.puts.length === 1, 8000, 'el guardado del orbe')

  const [put] = board.estado.puts

  assert.equal(put.origen, 'orb')
  assert.equal(put.staff_id, 33)
  assert.deepEqual(put.autores, [33])
  assert.equal(put.espacio_id, 3)
  assert.equal(put.revision, revisionInicial)
  assert.ok(put.content.includes('Uno corregido') && put.content.includes('Tres'))

  // Las dos personas ven el texto final, y el orbe apareció con su cursor y se fue.
  assert.deepEqual(textos(ana.ydoc), ['Acta', 'Uno corregido', 'Dos', 'Tres'])
  assert.deepEqual(textos(beto.ydoc), ['Acta', 'Uno corregido', 'Dos', 'Tres'])
  assert.ok(orbe.vistos.length > 0, 'el awareness del orbe llegó al cliente')
  assert.ok(orbe.vistos.every((visto) => visto.color === '#7c3aed'))
  assert.ok(orbe.vistos.some((visto) => visto.conCursor))
  await esperarHasta(() => !orbe.presente(), 2000, 'que el cursor del orbe desaparezca')
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'guardado'))

  // Un guardado posterior de una persona vuelve a rotularse «colaborativo».
  agregarParrafo(ana.ydoc, 'A mano')
  await esperarHasta(() => board.estado.puts.length === 2, 4000, 'el guardado de Ana')
  assert.equal(board.estado.puts[1].origen, 'colaborativo')
  assert.deepEqual(board.estado.puts[1].autores, [11])
})

test('si alguien agrega un párrafo mientras escribe el orbe, el reemplazo cae en su bloque', async () => {
  const { board, servicio } = await montar({ content: '<h1>Acta</h1><p>Uno</p><p>Dos</p>' })
  const ana = conectar(servicio, { staffId: 11 })
  const beto = conectar(servicio, { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)

  const orbe = observarOrbe(ana)

  await aplicarComoBoard(servicio, {
    html: '<h1>Acta</h1><p>Uno</p><p>Dos revisado</p><p>Tres</p>',
    base: '<h1>Acta</h1><p>Uno</p><p>Dos</p>',
    staffId: 33
  })
  await esperarHasta(() => orbe.vistos.length > 0, 3000, 'que aparezca el orbe')

  // Beto abre un párrafo arriba del todo mientras el orbe trabaja.
  const fragmento = beto.ydoc.getXmlFragment('default')
  const parrafo = new Y.XmlElement('paragraph')
  const contenido = new Y.XmlText()

  contenido.insert(0, 'De Beto')
  parrafo.insert(0, [contenido])
  fragmento.insert(0, [parrafo])

  await esperarHasta(() => board.estado.puts.length >= 1, 8000, 'el guardado')
  await esperar(500)

  assert.deepEqual(textos(ana.ydoc), ['De Beto', 'Acta', 'Uno', 'Dos revisado', 'Tres'])
  assert.deepEqual(textos(beto.ydoc), textos(ana.ydoc))
  assert.equal(board.estado.puts.at(-1).origen, 'orb')
  assert.ok(board.estado.puts.at(-1).autores.includes(33))
})

test('un acta ya igual a lo que manda el orbe se acepta pero no guarda nada', async () => {
  const { board, servicio } = await montar({ content: '<p>Inicial</p>' })
  const ana = conectar(servicio, { staffId: 11 })

  await esperarHasta(() => ana.sincronizado)

  assert.equal((await aplicarComoBoard(servicio, { html: '<p>Inicial</p>' })).estado, 202)
  await esperar(500)
  assert.equal(board.estado.puts.length, 0)
})

/** Agrega texto al final del bloque `indice`, como lo hace quien escribe en ese párrafo. */
function anexarTexto (ydoc, indice, texto) {
  const contenido = ydoc.getXmlFragment('default').get(indice).get(0)

  contenido.insert(contenido.length, texto)
}

const ACTA_BASE = '<h1>Acta</h1><p>Uno</p><p>Dos</p><p>Tres</p>'

/** Monta el acta con dos personas conectadas y el guardado automático lejos, para que sus cambios queden «sin guardar». */
async function montarConDosPersonas () {
  const montaje = await montar({ content: ACTA_BASE }, { EN_VIVO_DEBOUNCE_MS: '8000', EN_VIVO_MAX_DEBOUNCE_MS: '9000' })
  const ana = conectar(montaje.servicio, { staffId: 11 })
  const beto = conectar(montaje.servicio, { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)

  return { ...montaje, ana, beto }
}

test('3 bandas en vivo: si una persona edita el bloque durante la animación del orbe, se conserva su texto', async () => {
  const { board, servicio, ana, beto } = await montarConDosPersonas()
  const orbe = observarOrbe(ana)

  await aplicarComoBoard(servicio, {
    html: '<h1>Acta</h1><p>Uno del orbe</p><p>Dos</p><p>Tres</p>',
    base: ACTA_BASE,
    revision: board.estado.revision,
    staffId: 33
  })
  await esperarHasta(() => orbe.vistos.length > 0, 3000, 'que aparezca el orbe')

  // El plan ya se hizo con «Uno» intacto; Ana escribe en él mientras el orbe marca lo que va a reemplazar.
  anexarTexto(ana.ydoc, 1, ' de Ana')

  await esperarHasta(() => board.estado.puts.length === 1, 10_000, 'el guardado del orbe')

  const esperado = ['Acta', 'Uno de Ana', 'Uno del orbe', 'Dos', 'Tres']

  assert.deepEqual(textos(ana.ydoc), esperado)
  assert.deepEqual(textos(beto.ydoc), esperado)
})

test('3 bandas: una edición humana sin guardar en el bloque que el orbe también cambia conserva los dos textos', async () => {
  const { board, servicio, ana, beto } = await montarConDosPersonas()

  anexarTexto(ana.ydoc, 1, ' de Ana')
  await esperarHasta(() => textos(beto.ydoc)[1] === 'Uno de Ana', 3000, 'que la edición de Ana llegue al servicio')

  const respuesta = await aplicarComoBoard(servicio, {
    html: '<h1>Acta</h1><p>Uno del orbe</p><p>Dos</p><p>Tres</p>',
    base: ACTA_BASE,
    revision: board.estado.revision,
    staffId: 33
  })

  assert.equal(respuesta.estado, 202)
  await esperarHasta(() => board.estado.puts.length === 1, 10_000, 'el guardado del orbe')

  const esperado = ['Acta', 'Uno de Ana', 'Uno del orbe', 'Dos', 'Tres']

  assert.deepEqual(textos(ana.ydoc), esperado)
  assert.deepEqual(textos(beto.ydoc), esperado)
  assert.ok(board.estado.puts[0].content.includes('Uno de Ana') && board.estado.puts[0].content.includes('Uno del orbe'))
  assert.equal(board.estado.puts[0].origen, 'orb')
  assert.deepEqual([...board.estado.puts[0].autores].sort(), [11, 33], 'Ana figura como autora de lo suyo y 33 de lo del orbe')
})

test('3 bandas: los bloques que el orbe no toca quedan intactos aunque una persona los haya editado', async () => {
  const { board, servicio, ana, beto } = await montarConDosPersonas()

  anexarTexto(ana.ydoc, 1, ' de Ana')
  anexarTexto(beto.ydoc, 3, ' de Beto')
  await esperarHasta(() => textos(ana.ydoc)[3] === 'Tres de Beto' && textos(beto.ydoc)[1] === 'Uno de Ana', 3000, 'que lleguen las dos ediciones')

  await aplicarComoBoard(servicio, {
    html: '<h1>Acta</h1><p>Uno</p><p>Dos revisado</p><p>Tres</p>',
    base: ACTA_BASE,
    staffId: 33
  })
  await esperarHasta(() => board.estado.puts.length === 1, 10_000, 'el guardado del orbe')

  assert.deepEqual(textos(ana.ydoc), ['Acta', 'Uno de Ana', 'Dos revisado', 'Tres de Beto'])
  assert.deepEqual(textos(beto.ydoc), textos(ana.ydoc))
})

test('3 bandas: lo escrito sin guardar al final del acta sobrevive cuando el orbe también agrega', async () => {
  const { board, servicio, ana, beto } = await montarConDosPersonas()

  agregarParrafo(ana.ydoc, 'Cierre de Ana')
  await esperarHasta(() => textos(beto.ydoc).length === 5, 3000, 'que llegue el párrafo de Ana')

  await aplicarComoBoard(servicio, {
    html: `${ACTA_BASE}<p>Cierre del orbe</p>`,
    base: ACTA_BASE,
    staffId: 33
  })
  await esperarHasta(() => board.estado.puts.length === 1, 10_000, 'el guardado del orbe')

  const final = textos(ana.ydoc)

  assert.equal(final.length, 6)
  assert.ok(final.includes('Cierre de Ana') && final.includes('Cierre del orbe'))
  assert.deepEqual(textos(beto.ydoc), final)
})
