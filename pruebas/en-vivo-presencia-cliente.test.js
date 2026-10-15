/**
 * Pruebas de la presencia en recursos (fase 6) en el cliente del bus del navegador.
 *
 * Servicio real en un puerto libre, `ws` en lugar del `WebSocket` del navegador y reloj manual. Lo que
 * se protege: que quien mira se anuncie solo cuando el servicio confirmó la sala, que lo vean los
 * demás, que al reconectar se vuelva a anunciar (la presencia vive en la conexión), que soltar el
 * último alta diga «fuera» y que «escribiendo» llegue a los demás y no a quien escribe.
 */

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { crearClienteEnVivo } from '../src/datos/en-vivo.ts'
import { WebSocketConOrigen, boletoDe, esperarHasta, iniciarServicio } from './apoyo/en-vivo.mjs'

let servicio

before(async () => {
  servicio = await iniciarServicio()
})

after(async () => {
  await servicio.cerrar()
})

const SALA = 'recurso:ticket:9'

/** Un cliente con reloj manual; guarda los sockets que abrió para poder cortarlos. */
function clienteDe (staffId) {
  const pendientes = []
  const sockets = []
  const cliente = crearClienteEnVivo({
    crearSocket: (url) => { const socket = new WebSocketConOrigen(url); sockets.push(socket); return socket },
    programar: (accion, ms) => { const tarea = { accion, ms }; pendientes.push(tarea); return tarea },
    cancelar: (tarea) => { const i = pendientes.indexOf(tarea); if (i >= 0) pendientes.splice(i, 1) },
    aleatorio: () => 0.5
  })
  const boletoBase = async () => boletoDe({ suj: 'staff', id: staffId, salas: [`staff:${staffId}`, 'equipo'], doc: null, esp: null })
  const boletoDeSala = async () => boletoDe({ suj: 'staff', id: staffId, salas: [SALA], doc: null, esp: null })
  const avisos = []

  cliente.escucharPresencia((aviso) => avisos.push(aviso))

  const desconectar = cliente.conectar({ url: `ws://127.0.0.1:${servicio.puerto}/en-vivo`, pedirBoleto: boletoBase })

  return { cliente, boletoDeSala, avisos, sockets, pendientes, desconectar, correr: () => pendientes.shift()?.accion() }
}

const ultimosPresentes = (avisos) => avisos.filter((a) => a.t === 'presentes' && a.sala === SALA).at(-1)?.staff

test('quien mira se anuncia y los demás lo ven; soltar el alta dice «fuera»', async () => {
  const a = clienteDe(7)
  const b = clienteDe(8)

  await esperarHasta(() => a.cliente.estaConectado() && b.cliente.estaConectado(), 3000, 'no conectaron')

  a.cliente.suscribirSala(SALA, a.boletoDeSala)
  b.cliente.suscribirSala(SALA, b.boletoDeSala)
  const soltarA = a.cliente.anunciarPresencia(SALA)

  b.cliente.anunciarPresencia(SALA)
  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[7,8]', 3000, 'B no vio a los dos')
  assert.deepEqual(b.cliente.presentesDe(SALA), [7, 8])

  soltarA()
  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[8]', 3000, 'B siguió viendo a A')

  a.desconectar()
  b.desconectar()
})

test('dos altas de la misma sala cuentan una: «fuera» solo al soltar la última', async () => {
  const a = clienteDe(7)
  const b = clienteDe(8)

  await esperarHasta(() => a.cliente.estaConectado() && b.cliente.estaConectado(), 3000, 'no conectaron')
  a.cliente.suscribirSala(SALA, a.boletoDeSala)
  b.cliente.suscribirSala(SALA, b.boletoDeSala)

  const soltar1 = a.cliente.anunciarPresencia(SALA)
  const soltar2 = a.cliente.anunciarPresencia(SALA)

  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[7]', 3000, 'B no vio a A')

  soltar1()
  await new Promise((resolver) => setTimeout(resolver, 800))
  assert.deepEqual(ultimosPresentes(b.avisos), [7], 'con un alta viva A sigue presente')

  soltar2()
  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[]', 3000, 'A no salió')

  a.desconectar()
  b.desconectar()
})

test('al reconectar el cliente vuelve a anunciarse sin que nadie lo pida', async () => {
  const a = clienteDe(7)
  const b = clienteDe(8)

  await esperarHasta(() => a.cliente.estaConectado() && b.cliente.estaConectado(), 3000, 'no conectaron')
  a.cliente.suscribirSala(SALA, a.boletoDeSala)
  b.cliente.suscribirSala(SALA, b.boletoDeSala)
  a.cliente.anunciarPresencia(SALA)
  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[7]', 3000, 'B no vio a A')

  // A pierde el socket: el servicio la da por salida, el cliente reconecta con boleto nuevo.
  a.sockets[0].close()
  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[]', 3000, 'B no vio salir a A')
  assert.deepEqual(a.cliente.presentesDe(SALA), [], 'sin socket no se conserva lo último que se supo')

  await esperarHasta(() => a.pendientes.length === 1, 3000, 'A no programó la reconexión')
  a.correr()
  await esperarHasta(() => JSON.stringify(ultimosPresentes(b.avisos)) === '[7]', 4000, 'A no volvió a anunciarse')

  a.desconectar()
  b.desconectar()
})

test('«escribiendo» llega a los demás de la sala y no a quien escribe; se limita a uno cada 2 s', async () => {
  const a = clienteDe(7)
  const b = clienteDe(8)

  await esperarHasta(() => a.cliente.estaConectado() && b.cliente.estaConectado(), 3000, 'no conectaron')
  a.cliente.suscribirSala(SALA, a.boletoDeSala)
  b.cliente.suscribirSala(SALA, b.boletoDeSala)

  // Hasta que el servicio confirme la sala el aviso se ignora en el cliente: se insiste.
  for (let i = 0; i < 40 && !b.avisos.some((a2) => a2.t === 'escribiendo'); i += 1) {
    a.cliente.avisarEscribiendo(SALA)
    await new Promise((resolver) => setTimeout(resolver, 50))
  }

  assert.deepEqual(b.avisos.find((aviso) => aviso.t === 'escribiendo'), { t: 'escribiendo', sala: SALA, staff: 7 })
  assert.equal(a.avisos.some((aviso) => aviso.t === 'escribiendo'), false, 'quien escribe no se oye a sí misma')

  const antes = b.avisos.filter((aviso) => aviso.t === 'escribiendo').length

  a.cliente.avisarEscribiendo(SALA)
  a.cliente.avisarEscribiendo(SALA)
  await new Promise((resolver) => setTimeout(resolver, 200))
  assert.equal(b.avisos.filter((aviso) => aviso.t === 'escribiendo').length, antes, 'repetido en menos de 2 s se descarta')

  a.desconectar()
  b.desconectar()
})

test('avisar «escribiendo» o anunciarse sin socket no rompe nada', () => {
  const cliente = crearClienteEnVivo({
    crearSocket: () => { throw new Error('no debería abrir socket') },
    programar: () => null,
    cancelar: () => undefined,
    aleatorio: () => 0.5
  })

  assert.doesNotThrow(() => cliente.avisarEscribiendo(SALA))

  const soltar = cliente.anunciarPresencia(SALA)

  assert.doesNotThrow(soltar)
  assert.deepEqual(cliente.presentesDe(SALA), [])
})
