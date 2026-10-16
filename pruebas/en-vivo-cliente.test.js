/**
 * Pruebas del cliente del bus de «Ops en vivo» para el navegador (`src/datos/en-vivo.ts`).
 *
 * Se ejecutan contra el servicio real en un puerto libre, con `ws` en lugar del `WebSocket` del
 * navegador y un reloj manual. Lo que se protege: que conecte con el boleto, que un cambio llegue
 * a quien escucha, que las salas extra se sumen y se suelten, que ante una caída o un boleto malo
 * se reintente con espera exponencial, y que una ráfaga de cambios iguales cuente una vez.
 */

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crearAgrupadorDeCambios,
  crearClienteEnVivo,
  ESPERA_INICIAL_MS,
  ESPERA_MAXIMA_MS,
  esperaDeReconexion
} from '../src/datos/en-vivo.ts'
import { WebSocketConOrigen, boletoDe, enviarEventos, esperarHasta, evento, iniciarServicio } from './apoyo/en-vivo.mjs'

let servicio

before(async () => {
  servicio = await iniciarServicio()
})

after(async () => {
  await servicio.cerrar()
})

/** Un cliente con reloj manual: `pendientes` guarda lo programado y `correr()` ejecuta lo próximo. */
function clienteDePrueba () {
  const pendientes = []
  const cliente = crearClienteEnVivo({
    crearSocket: (url) => new WebSocketConOrigen(url),
    programar: (accion, ms) => { const tarea = { accion, ms }; pendientes.push(tarea); return tarea },
    cancelar: (tarea) => { const i = pendientes.indexOf(tarea); if (i >= 0) pendientes.splice(i, 1) },
    aleatorio: () => 0.5
  })

  return { cliente, pendientes, correr: () => pendientes.shift()?.accion() }
}

const staff7 = () => boletoDe({ suj: 'staff', id: 7, salas: ['staff:7', 'equipo'], doc: null, esp: null })
const opciones = (pedirBoleto = async () => staff7()) => ({ url: `ws://127.0.0.1:${servicio.puerto}/en-vivo`, pedirBoleto })

test('espera de reconexión: exponencial de 1 s a 30 s con ±20 % de variación', () => {
  assert.equal(esperaDeReconexion(0, 0.5), ESPERA_INICIAL_MS)
  assert.equal(esperaDeReconexion(1, 0.5), 2000)
  assert.equal(esperaDeReconexion(3, 0.5), 8000)
  assert.equal(esperaDeReconexion(20, 0.5), ESPERA_MAXIMA_MS)
  assert.equal(esperaDeReconexion(0, 0), 800)
  assert.equal(esperaDeReconexion(0, 0.999999), 1200)
  assert.equal(esperaDeReconexion(20, 0), 24_000)
})

test('agrupador: los cambios iguales dentro de la ventana cuentan una vez', () => {
  const lotes = []
  const tareas = []
  const agrupador = crearAgrupadorDeCambios((lote) => lotes.push(lote), 1000, (accion, ms) => { tareas.push({ accion, ms }); return tareas.length }, () => undefined)

  agrupador.agregar({ tipo: 'tarea', id: 5, espacio_id: 1 })
  agrupador.agregar({ tipo: 'tarea', id: 5, espacio_id: 1 })
  agrupador.agregar({ tipo: 'tarea', id: 6, espacio_id: 1 })
  agrupador.agregar({ tipo: 'aviso', id: null, espacio_id: null })

  assert.equal(tareas.length, 1, 'una sola ventana abierta')
  assert.equal(tareas[0].ms, 1000)

  tareas[0].accion()
  assert.deepEqual(lotes[0].map((c) => `${c.tipo}:${c.id}`), ['tarea:5', 'tarea:6', 'aviso:null'])

  agrupador.agregar({ tipo: 'tarea', id: 5, espacio_id: 1 })
  assert.equal(tareas.length, 2, 'después de vaciar se abre otra ventana')
})

test('agrupador: cancelar descarta lo pendiente', () => {
  const lotes = []
  const tareas = []
  const agrupador = crearAgrupadorDeCambios((lote) => lotes.push(lote), 1000, (accion) => { tareas.push(accion); return 1 }, () => undefined)

  agrupador.agregar({ tipo: 'tarea', id: 5, espacio_id: null })
  agrupador.cancelar()
  tareas[0]()
  assert.deepEqual(lotes, [])
})

test('conecta con el boleto, avisa el estado y entrega los cambios de su sala', async () => {
  const { cliente } = clienteDePrueba()
  const cambios = []
  const estados = []

  cliente.escuchar((c) => cambios.push(c))
  cliente.escucharEstado((c) => estados.push(c))

  const desconectar = cliente.conectar(opciones())

  await esperarHasta(() => cliente.estaConectado(), 3000, 'no conectó')
  assert.deepEqual(estados, [true])

  await enviarEventos(servicio.urlBase, [evento('aviso', 3, { staff: [7] }), evento('aviso', 4, { staff: [8] })])
  await esperarHasta(() => cambios.length === 1, 3000, 'no llegó el aviso')
  assert.deepEqual(cambios, [{ tipo: 'aviso', id: 3, espacio_id: null }])

  desconectar()
  assert.equal(cliente.estaConectado(), false)
  assert.deepEqual(estados, [true, false])
})

test('suscribirSala suma una sala y soltarla deja de recibir; dos altas cuentan una', async () => {
  const { cliente } = clienteDePrueba()
  const cambios = []
  let pedidos = 0
  const boletoDeSala = async () => {
    pedidos += 1

    return boletoDe({ suj: 'staff', id: 7, salas: ['espacio:3'], doc: null, esp: null })
  }
  const delEspacio = () => enviarEventos(servicio.urlBase, [evento('tarea', 5, { espacio: true }, 3)])

  cliente.escuchar((c) => cambios.push(c))

  // Registrada antes de conectar: se suscribe al quedar listo el socket.
  const soltar1 = cliente.suscribirSala('espacio:3', boletoDeSala)
  const soltar2 = cliente.suscribirSala('espacio:3', boletoDeSala)
  const desconectar = cliente.conectar(opciones())

  // El servidor no confirma la suscripción de una sala extra con un mensaje propio: se emite hasta que llegue.
  await esperarHasta(() => cliente.estaConectado(), 3000, 'no conectó')
  for (let i = 0; i < 30 && cambios.length === 0; i += 1) {
    await delEspacio()
    await new Promise((resolver) => setTimeout(resolver, 50))
  }
  assert.deepEqual(cambios[0], { tipo: 'tarea', id: 5, espacio_id: 3 })
  assert.equal(pedidos, 1, 'dos altas de la misma sala piden un solo boleto')

  soltar1()
  await delEspacio()
  await new Promise((resolver) => setTimeout(resolver, 150))
  assert.ok(cambios.length >= 1)

  const antes = cambios.length

  soltar2()
  await new Promise((resolver) => setTimeout(resolver, 150))
  await delEspacio()
  await new Promise((resolver) => setTimeout(resolver, 250))
  assert.equal(cambios.length, antes, 'soltada la última alta, la sala deja de llegar')

  desconectar()
})

test('si el servidor cierra, reintenta con espera y vuelve a pedir el boleto', async () => {
  const { cliente, pendientes, correr } = clienteDePrueba()
  let pedidos = 0

  const desconectar = cliente.conectar(opciones(async () => {
    pedidos += 1

    // El primero es un boleto malformado: el servicio lo rechaza y cierra con 4401.
    return pedidos === 1 ? 'no.es.un.boleto' : staff7()
  }))

  await esperarHasta(() => pendientes.length === 1, 3000, 'no programó la reconexión')
  assert.equal(pendientes[0].ms, 1000, 'tras un boleto rechazado la espera vuelve a la inicial')
  assert.equal(cliente.estaConectado(), false)

  correr()
  await esperarHasta(() => cliente.estaConectado(), 3000, 'no reconectó con el boleto nuevo')
  assert.equal(pedidos, 2)

  desconectar()
  assert.deepEqual(pendientes, [], 'al desconectar no queda nada programado')
})

/** Un cliente con sockets de mentira: `abrir()` los deja a mano para ver qué hace el cliente al cerrarse cada uno. */
function clienteConSocketsFalsos () {
  const pendientes = []
  const sockets = []
  const cliente = crearClienteEnVivo({
    crearSocket: () => {
      const socket = { send: () => undefined, close: () => undefined, onopen: null, onmessage: null, onerror: null, onclose: null }

      sockets.push(socket)

      return socket
    },
    programar: (accion, ms) => { const tarea = { accion, ms }; pendientes.push(tarea); return tarea },
    cancelar: (tarea) => { const i = pendientes.indexOf(tarea); if (i >= 0) pendientes.splice(i, 1) },
    aleatorio: () => 0.5
  })

  return { cliente, pendientes, sockets, correr: () => pendientes.shift()?.accion() }
}

test('4401 sin haber llegado a «listo» mantiene el backoff creciente; tras «listo» lo reinicia', async () => {
  const { cliente, pendientes, sockets, correr } = clienteConSocketsFalsos()
  const desconectar = cliente.conectar({ url: 'ws://falso/en-vivo', pedirBoleto: async () => 'boleto' })

  await esperarHasta(() => sockets.length === 1, 1000, 'el primer socket')
  sockets[0].onclose({ code: 4401 })
  assert.equal(pendientes.at(-1).ms, 1000, 'el primer fallo espera la base')

  correr()
  await esperarHasta(() => sockets.length === 2, 1000, 'el segundo socket')
  sockets[1].onclose({ code: 4401 })
  assert.equal(pendientes.at(-1).ms, 2000, 'rechazado de nuevo sin llegar a listo: el backoff crece')

  correr()
  await esperarHasta(() => sockets.length === 3, 1000, 'el tercer socket')
  sockets[2].onmessage({ data: JSON.stringify({ t: 'listo', salas: [] }) })
  assert.equal(cliente.estaConectado(), true)
  sockets[2].onclose({ code: 4401 })
  assert.equal(pendientes.at(-1).ms, 1000, 'el boleto venció con la conexión andando: se reintenta sin esperar de más')

  desconectar()
})

test('sin boleto reintenta con espera creciente y no abre ningún socket', async () => {
  const { cliente, pendientes, correr } = clienteDePrueba()
  let pedidos = 0

  const desconectar = cliente.conectar(opciones(async () => { pedidos += 1; return null }))

  await esperarHasta(() => pendientes.length === 1, 3000)
  assert.equal(pendientes[0].ms, 1000)
  correr()
  await esperarHasta(() => pendientes.length === 1 && pedidos === 2, 3000)
  assert.equal(pendientes[0].ms, 2000)
  assert.equal(cliente.estaConectado(), false)

  desconectar()
})
