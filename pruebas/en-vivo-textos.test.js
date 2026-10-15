/**
 * Pruebas de la edición conjunta de textos (fase 8): la descripción de una tarea (`tarea:{id}`) y el
 * borrador de respuesta de un ticket (`ticket-borrador:{id}`).
 *
 * Servicio real + board falso firmado + clientes `@hocuspocus/provider` en Node. Lo que se protege: que
 * el texto pase a Yjs y vuelva con el esquema del editor sin deformarse, que dos personas converjan y el
 * board reciba UN guardado como la última persona que editó, que un cambio de otra cosa de la tarea no
 * pise lo que se escribe (la revisión de la tarea se mueve con cualquier cambio), que un cambio real de
 * la descripción sí se recargue, que un borrador vacío se borre y que el borrador enviado se limpie en
 * todos los clientes.
 */

import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as esperar } from 'node:timers/promises'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import { textoAYDoc, yDocATexto } from '../servicios/en-vivo/adaptadores/texto.ts'
import {
  WebSocketConOrigen,
  boletoDe,
  enviarEventos,
  esperarHasta,
  evento,
  iniciarServicio
} from './apoyo/en-vivo.mjs'
import { crearBoardDeTextos } from './apoyo/board-textos.mjs'

const recursos = []

afterEach(async () => {
  for (const cierre of recursos.splice(0).reverse()) await cierre()
})

/** Levanta board falso y servicio; ambos se cierran solos al terminar la prueba. */
async function montar (opciones = {}) {
  const board = await crearBoardDeTextos(opciones)
  const servicio = await iniciarServicio({ board })

  recursos.push(board.cerrar, servicio.cerrar)

  return { board, servicio }
}

/** Un cliente colaborativo de un documento: su Y.Doc, lo que le llega por stateless y si se sincronizó. */
function conectar (servicio, nombre, { staffId = 11, boleto } = {}) {
  const ydoc = new Y.Doc()
  const cliente = { ydoc, statelesss: [], sincronizado: false, fallo: false }

  cliente.provider = new HocuspocusProvider({
    url: servicio.urlDoc,
    name: nombre,
    document: ydoc,
    token: boleto ?? boletoDe({ suj: 'staff', id: staffId, salas: [], doc: nombre, esp: null }),
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

/** Vacía el documento como lo hace el editor: un documento nunca queda sin bloques, queda un párrafo vacío. */
function vaciar (ydoc) {
  const fragmento = ydoc.getXmlFragment('default')

  ydoc.transact(() => {
    fragmento.delete(0, fragmento.length)
    fragmento.insert(0, [new Y.XmlElement('paragraph')])
  })
}

const IMAGEN = '/api/bff/files/texto-rico/0123456789abcdef0123456789abcdef'

// --- Esquema -------------------------------------------------------------------------------------

const vuelta = (html) => yDocATexto(textoAYDoc(html))

test('el texto conserva lo que el editor sabe hacer y descarta lo que no', () => {
  const html = vuelta([
    '<h2>Título</h2><h3>Subtítulo</h3>',
    '<p>Con <strong>negrita</strong>, <em>cursiva</em>, <u>subrayado</u>, <s>tachado</s> y <a href="https://wiwo.me/ops">enlace</a>.</p>',
    '<ul><li><p>Uno</p></li></ul><ol><li><p>Dos</p></li></ol>',
    '<blockquote><p>Cita</p></blockquote>',
    `<p>Imagen <img src="${IMAGEN}" alt="captura"></p>`
  ].join(''))

  for (const fragmento of [
    '<h2>Título</h2>', '<h3>Subtítulo</h3>', '<strong>negrita</strong>', '<em>cursiva</em>', '<u>subrayado</u>', '<s>tachado</s>',
    'href="https://wiwo.me/ops"', '<ul><li><p>Uno</p></li></ul>', '<ol><li><p>Dos</p></li></ol>', '<blockquote><p>Cita</p></blockquote>',
    `<img src="${IMAGEN}" alt="captura">`
  ]) {
    assert.ok(html.includes(fragmento), `falta ${fragmento} en ${html}`)
  }
})

test('lo que ninguna vista pinta no entra: código, línea horizontal, título 1, imagen ajena y javascript:', () => {
  const html = vuelta('<h1>Grande</h1><pre><code>x = 1</code></pre><hr><p><code>en línea</code></p><p><img src="https://otro.com/a.png"></p><p><a href="javascript:alert(1)">peligro</a></p>')

  assert.ok(!html.includes('<h1>'), html)
  assert.ok(!html.includes('<pre>') && !html.includes('<code>') && !html.includes('<hr>'), html)
  assert.ok(!html.includes('otro.com'), html)
  assert.ok(!html.includes('javascript:'), html)
  assert.ok(html.includes('peligro') && html.includes('Grande'))
})

test('es estable (una segunda vuelta no cambia nada) y un texto vacío es un párrafo vacío', () => {
  const una = vuelta(`<h2>T</h2><p>a <strong>b</strong> <img src="${IMAGEN}" alt=""></p><ul><li><p>x</p></li></ul>`)

  assert.equal(vuelta(una), una)
  assert.equal(vuelta(''), '<p></p>')
})

// --- Tarea ---------------------------------------------------------------------------------------

test('tarea: dos personas convergen y el board recibe UN guardado como quien editó último', async () => {
  const { board, servicio } = await montar({ descripcion: '<p>Inicial</p>' })
  const ana = conectar(servicio, 'tarea:500', { staffId: 11 })
  const beto = conectar(servicio, 'tarea:500', { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado, 4000, 'sincronizar los dos clientes')
  assert.deepEqual(textos(ana.ydoc), ['Inicial'])

  agregarParrafo(ana.ydoc, 'Línea de Ana')
  agregarParrafo(beto.ydoc, 'Línea de Beto')

  await esperarHasta(() => board.estado.puts.length >= 1, 4000, 'el guardado en el board')
  await esperar(600)

  assert.equal(board.estado.puts.length, 1, 'un solo PUT tras las dos ediciones')

  const [put] = board.estado.puts

  assert.equal(put.ruta, 'en-vivo/tareas/500')
  assert.equal(put.revision, 't1')
  assert.ok([11, 22].includes(put.staff_id))
  assert.deepEqual(Object.keys(put).sort(), ['content', 'revision', 'ruta', 'staff_id'], 'sin autores ni origen: el contrato de la tarea no los tiene')
  assert.ok(put.content.includes('Línea de Ana') && put.content.includes('Línea de Beto'))
  assert.deepEqual(textos(ana.ydoc), textos(beto.ydoc))

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'guardado'))
  assert.equal(ana.statelesss.find((m) => m.t === 'guardado').revision, board.estado.tarea.revision)
})

test('tarea: sin cambios no se guarda nada', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => ana.sincronizado)
  await esperar(500)
  assert.equal(board.estado.puts.length, 0)
})

test('tarea: si solo cambió otra cosa de la tarea, un 409 adopta la revisión y vuelve a guardar sin recargar', async () => {
  const { board, servicio } = await montar({ descripcion: '<p>Inicial</p>' })
  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => ana.sincronizado)
  board.estado.cambiarOtraCosaDeLaTarea()
  agregarParrafo(ana.ydoc, 'Lo que escribe Ana')

  await esperarHasta(() => board.estado.puts.length === 1, 4000, 'el guardado tras adoptar la revisión')
  assert.equal(board.estado.puts[0].revision, 't2', 'el segundo intento va con la revisión nueva')
  assert.ok(board.estado.puts[0].content.includes('Lo que escribe Ana'))
  assert.equal(ana.statelesss.some((m) => m.t === 'recargado'), false, 'no se pisó el documento')
  assert.deepEqual(textos(ana.ydoc), ['Inicial', 'Lo que escribe Ana'])
})

test('tarea: si alguien cambió la descripción por otra vía, un 409 recarga lo del board', async () => {
  const { board, servicio } = await montar({ descripcion: '<p>Inicial</p>' })
  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => ana.sincronizado)
  board.estado.editarTareaPorFuera('<p>Versión de otra persona</p>')
  agregarParrafo(ana.ydoc, 'Esto se pierde')

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'), 4000, 'el aviso de recarga')
  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'conflicto' })
  await esperarHasta(() => textos(ana.ydoc).join('|') === 'Versión de otra persona')
  assert.equal(board.estado.puts.length, 0)
})

test('tarea: un evento «tarea» por otro campo no toca el documento; uno por la descripción lo recarga', async () => {
  const { board, servicio } = await montar({ descripcion: '<p>Inicial</p>' })
  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => ana.sincronizado)

  board.estado.cambiarOtraCosaDeLaTarea()
  await enviarEventos(servicio.urlBase, [evento('tarea', 500, { equipo: true })])
  await esperarHasta(() => board.estado.gets.length >= 2, 3000, 'la lectura de sincronía')
  await esperar(300)
  assert.equal(ana.statelesss.some((m) => m.t === 'recargado'), false)

  board.estado.editarTareaPorFuera('<p>Otra descripción</p>')
  await enviarEventos(servicio.urlBase, [evento('tarea', 500, { equipo: true })])
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado'), 4000, 'la recarga')
  assert.deepEqual(ana.statelesss.find((m) => m.t === 'recargado'), { t: 'recargado', motivo: 'externo' })
  await esperarHasta(() => textos(ana.ydoc).join('|') === 'Otra descripción')
})

test('tarea: un evento de otra tarea no toca este documento', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => ana.sincronizado)

  const lecturas = board.estado.gets.length

  await enviarEventos(servicio.urlBase, [evento('tarea', 501, { equipo: true })])
  await esperar(300)
  assert.equal(board.estado.gets.length, lecturas)
})

test('tarea: si el board niega el guardado se avisa «sin_acceso»; si el texto queda vacío (422) no se cierra', async () => {
  const { board, servicio } = await montar({ descripcion: '<p>Inicial</p>' })
  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => ana.sincronizado)

  // Descripción vacía: el board contesta 422 y el servicio no cierra nada.
  vaciar(ana.ydoc)
  await esperar(700)
  assert.equal(board.estado.puts.length, 0)
  assert.equal(ana.statelesss.some((m) => m.t === 'sin_acceso'), false)

  board.estado.estadoPut = 403
  agregarParrafo(ana.ydoc, 'Sin permiso')
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'sin_acceso'), 4000, 'el aviso de sin acceso')
})

test('tarea: si el board no la tiene, nadie se sincroniza', async () => {
  const { board, servicio } = await montar()

  board.estado.estadoGet = 404

  const ana = conectar(servicio, 'tarea:500')

  await esperarHasta(() => board.estado.gets.length >= 1, 4000, 'la lectura de la tarea')
  await esperar(300)
  assert.equal(ana.sincronizado, false)
})

// --- Borrador de ticket --------------------------------------------------------------------------

test('borrador: sin borrador abre vacío, guarda con revisión nula y las siguientes con la que devolvió el board', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, 'ticket-borrador:40')

  await esperarHasta(() => ana.sincronizado)
  assert.deepEqual(textos(ana.ydoc), [''], 'un párrafo vacío')

  agregarParrafo(ana.ydoc, 'Hola, ya lo estamos revisando')
  await esperarHasta(() => board.estado.puts.length === 1, 4000, 'el primer guardado')
  assert.equal(board.estado.puts[0].ruta, 'en-vivo/tickets/40/borrador')
  assert.equal(board.estado.puts[0].revision, null)
  assert.equal(board.estado.puts[0].staff_id, 11)
  assert.ok(board.estado.puts[0].content.includes('ya lo estamos revisando'))

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'guardado'))
  assert.equal(ana.statelesss.find((m) => m.t === 'guardado').revision, 'b1')

  agregarParrafo(ana.ydoc, 'Segunda línea')
  await esperarHasta(() => board.estado.puts.length === 2, 4000, 'el segundo guardado')
  assert.equal(board.estado.puts[1].revision, 'b1')
})

test('borrador: lo guardado se ve al abrir de nuevo, y dos personas convergen', async () => {
  const { servicio } = await montar({ borrador: '<p>Borrador de Ana</p>' })
  const ana = conectar(servicio, 'ticket-borrador:40', { staffId: 11 })
  const beto = conectar(servicio, 'ticket-borrador:40', { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)
  assert.deepEqual(textos(beto.ydoc), ['Borrador de Ana'])

  agregarParrafo(beto.ydoc, 'Y yo sumo esto')
  await esperarHasta(() => textos(ana.ydoc).length === 2)
  assert.deepEqual(textos(ana.ydoc), ['Borrador de Ana', 'Y yo sumo esto'])
})

test('borrador: vaciarlo lo borra en el board y el guardado sale con revisión nula', async () => {
  const { board, servicio } = await montar({ borrador: '<p>Se va a vaciar</p>' })
  const ana = conectar(servicio, 'ticket-borrador:40')

  await esperarHasta(() => ana.sincronizado)
  vaciar(ana.ydoc)

  await esperarHasta(() => board.estado.puts.length === 1, 4000, 'el guardado vacío')
  assert.equal(board.estado.borrador.revision, null)
  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'guardado'))
  assert.equal(ana.statelesss.find((m) => m.t === 'guardado').revision, null)

  // Lo que escriba después parte de «no hay borrador»: revisión nula otra vez.
  agregarParrafo(ana.ydoc, 'Nuevo borrador')
  await esperarHasta(() => board.estado.puts.length === 2, 4000, 'el guardado siguiente')
  assert.equal(board.estado.puts[1].revision, null)
})

test('borrador: al enviarse la respuesta el board lo consume y el evento «ticket» lo limpia en todos los clientes', async () => {
  const { board, servicio } = await montar({ borrador: '<p>Respuesta lista para enviar</p>' })
  const ana = conectar(servicio, 'ticket-borrador:40', { staffId: 11 })
  const beto = conectar(servicio, 'ticket-borrador:40', { staffId: 22 })

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)
  assert.deepEqual(textos(beto.ydoc), ['Respuesta lista para enviar'])

  board.estado.consumirBorrador()
  await enviarEventos(servicio.urlBase, [evento('ticket', 40, { equipo: true })])

  await esperarHasta(() => ana.statelesss.some((m) => m.t === 'recargado') && beto.statelesss.some((m) => m.t === 'recargado'), 4000, 'la recarga a los dos')
  await esperarHasta(() => textos(ana.ydoc).join('') === '' && textos(beto.ydoc).join('') === '')
  assert.equal(board.estado.puts.length, 0, 'recargar lo del board no es un guardado')
})

test('borrador: si la persona limpia la caja tras enviar, el guardado no resucita el borrador', async () => {
  const { board, servicio } = await montar({ borrador: '<p>Respuesta lista para enviar</p>' })
  const ana = conectar(servicio, 'ticket-borrador:40')

  await esperarHasta(() => ana.sincronizado)
  // Enviar: el board consume el borrador y la caja se vacía, antes de que el servicio guarde nada.
  board.estado.consumirBorrador()
  vaciar(ana.ydoc)

  await esperar(900)
  assert.equal(board.estado.borrador.content, '', 'el board sigue sin borrador')
  assert.equal(board.estado.puts.length, 0, 'tras el 409 el board ya tenía el mismo texto (vacío): no hay nada que guardar')
  assert.equal(ana.statelesss.some((m) => m.t === 'recargado'), false)
})

// --- Boletos -------------------------------------------------------------------------------------

test('un boleto solo abre el documento que nombra y con su Espacio', async () => {
  const { servicio } = await montar()
  const deTarea = boletoDe({ suj: 'staff', id: 11, salas: [], doc: 'tarea:500', esp: null })
  const deBorrador = boletoDe({ suj: 'staff', id: 11, salas: [], doc: 'ticket-borrador:40', esp: null })
  const conEspacio = boletoDe({ suj: 'staff', id: 11, salas: [], doc: 'tarea:500', esp: 3 })

  const bueno = conectar(servicio, 'tarea:500', { boleto: deTarea })

  // Con el documento ya abierto, un boleto con otro Espacio (o de otro documento) no entra.
  await esperarHasta(() => bueno.sincronizado, 4000, 'la conexión buena')

  const cruzado1 = conectar(servicio, 'ticket-borrador:40', { boleto: deTarea })
  const cruzado2 = conectar(servicio, 'tarea:500', { boleto: deBorrador })
  const otroEspacio = conectar(servicio, 'tarea:500', { boleto: conEspacio })

  await esperarHasta(() => cruzado1.fallo && cruzado2.fallo && otroEspacio.fallo, 4000, 'los tres rechazos')
  assert.equal(cruzado1.sincronizado || cruzado2.sincronizado || otroEspacio.sincronizado, false)
})

test('nombres de documento inválidos se rechazan', async () => {
  const { servicio } = await montar()

  for (const nombre of ['tarea:abc', 'tarea:0', 'tarea:1:2', 'ticket:40', 'ticket-borrador:']) {
    const raro = conectar(servicio, nombre, { boleto: boletoDe({ suj: 'staff', id: 11, salas: [], doc: nombre, esp: null }) })

    await esperarHasta(() => raro.fallo, 3000, `rechazo de ${nombre}`)
  }
})

test('el servicio firma sus llamadas al board con el prefijo de cada texto', async () => {
  const { board, servicio } = await montar()
  const ana = conectar(servicio, 'tarea:500')
  const beto = conectar(servicio, 'ticket-borrador:40')

  await esperarHasta(() => ana.sincronizado && beto.sincronizado)
  assert.deepEqual([...new Set(board.estado.gets)].sort(), ['en-vivo/tareas/500', 'en-vivo/tickets/40/borrador'])
  assert.equal(board.estado.firmasInvalidas, 0)
})
