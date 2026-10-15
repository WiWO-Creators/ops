/**
 * Pruebas del bus de avisos de «Ops en vivo», contra el servicio real en un puerto libre.
 *
 * Lo que se protege: que sin un boleto bueno no se entre, que cada evento llegue solo a su sala, que
 * el cliente nunca reciba un id, que un cliente que se desboca se corte y que la presencia en un
 * recurso solo la vean quienes están suscritos a él.
 */

import { after, afterEach, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as esperar } from 'node:timers/promises'
import { ClienteBus, boletoDe, enviarEventos, esperarHasta, evento, iniciarServicio } from './apoyo/en-vivo.mjs'

let servicio
const abiertos = []

async function abrir (opciones) {
  const cliente = await ClienteBus.abrir(servicio.urlBus, opciones)

  abiertos.push(cliente)

  return cliente
}

async function entrar (datos) {
  const cliente = await abrir()

  cliente.enviar({ t: 'hola', boleto: boletoDe(datos) })
  await cliente.esperar((m) => m.t === 'listo')

  return cliente
}

before(async () => {
  servicio = await iniciarServicio({ entorno: { EN_VIVO_ESPERA_HOLA_MS: '300' } })
})

afterEach(() => {
  for (const cliente of abiertos.splice(0)) cliente.cerrar()
})

after(async () => {
  await servicio.cerrar()
})

test('/salud responde sin credenciales y cuenta las conexiones', async () => {
  const cliente = await entrar({ suj: 'staff', id: 1, salas: ['staff:1'] })
  const respuesta = await fetch(`${servicio.urlBase}/salud`)
  const cuerpo = await respuesta.json()

  assert.equal(respuesta.status, 200)
  assert.equal(cuerpo.ok, true)
  assert.ok(cuerpo.conexiones_bus >= 1)
  assert.equal(cuerpo.documentos, 0)
  cliente.cerrar()
})

test('hola con un boleto válido suscribe a las salas del boleto', async () => {
  const cliente = await abrir()

  cliente.enviar({ t: 'hola', boleto: boletoDe({ suj: 'staff', id: 5, salas: ['staff:5', 'equipo', 'espacio:3'] }) })

  const listo = await cliente.esperar((m) => m.t === 'listo')

  assert.deepEqual(listo.salas, ['staff:5', 'equipo', 'espacio:3'])
})

test('hola con un boleto inválido da error y cierra con 4401', async () => {
  const cliente = await abrir()

  cliente.enviar({ t: 'hola', boleto: 'no.es-un-boleto' })

  assert.deepEqual(await cliente.esperar((m) => m.t === 'error'), { t: 'error', codigo: 'boleto_invalido' })
  assert.equal(await cliente.cierre, 4401)
})

test('sin hola a tiempo se cierra con 4408; un primer mensaje que no es hola también', async () => {
  const callado = await abrir()

  assert.equal(await callado.cierre, 4408)

  const impaciente = await abrir()

  impaciente.enviar({ t: 'desuscribir', sala: 'equipo' })
  assert.equal(await impaciente.cierre, 4408)
})

test('un origen distinto, o ninguno, no abre el socket', async () => {
  await assert.rejects(ClienteBus.abrir(servicio.urlBus, { origen: 'https://otro.example' }), /403/)
  await assert.rejects(ClienteBus.abrir(servicio.urlBus, { origen: null }), /403/)
})

test('suscribir exige que el boleto nombre la sala: si no, error y cierre 4403', async () => {
  const cliente = await entrar({ suj: 'staff', id: 5, salas: ['staff:5'] })

  cliente.enviar({ t: 'suscribir', sala: 'espacio:9', boleto: boletoDe({ suj: 'staff', id: 5, salas: ['espacio:3'] }) })

  assert.deepEqual(await cliente.esperar((m) => m.t === 'error'), { t: 'error', codigo: 'sala_no_permitida' })
  assert.equal(await cliente.cierre, 4403)
})

test('suscribir con un boleto de otra persona se rechaza con 4401', async () => {
  const cliente = await entrar({ suj: 'staff', id: 5, salas: ['staff:5'] })

  cliente.enviar({ t: 'suscribir', sala: 'espacio:3', boleto: boletoDe({ suj: 'staff', id: 6, salas: ['espacio:3'] }) })

  assert.deepEqual(await cliente.esperar((m) => m.t === 'error'), { t: 'error', codigo: 'boleto_invalido' })
  assert.equal(await cliente.cierre, 4401)
})

test('suscribir con un boleto que nombra la sala la agrega', async () => {
  const cliente = await entrar({ suj: 'staff', id: 5, salas: ['staff:5'] })

  cliente.enviar({ t: 'suscribir', sala: 'espacio:3', boleto: boletoDe({ suj: 'staff', id: 5, salas: ['espacio:3'] }) })
  await esperarHasta(() => cliente.mensajes.filter((m) => m.t === 'listo').length === 2)

  const [, segundo] = cliente.mensajes.filter((m) => m.t === 'listo')

  assert.deepEqual(segundo.salas, ['staff:5', 'espacio:3'])
})

test('un evento llega solo a la sala que le toca', async () => {
  const uno = await entrar({ suj: 'staff', id: 1, salas: ['staff:1'] })
  const dos = await entrar({ suj: 'staff', id: 2, salas: ['staff:2'] })

  const respuesta = await enviarEventos(servicio.urlBase, [evento('tarea', 12, { staff: [1] }, 3)])

  assert.deepEqual(respuesta, { estado: 202, datos: { aceptados: 1 } })
  assert.deepEqual(await uno.esperar((m) => m.t === 'cambio'), { t: 'cambio', tipo: 'tarea', id: 12, espacio_id: 3 })
  await esperar(150)
  assert.equal(dos.mensajes.filter((m) => m.t === 'cambio').length, 0)
})

test('quien está en dos salas del mismo evento recibe un solo aviso', async () => {
  const cliente = await entrar({ suj: 'staff', id: 1, salas: ['staff:1', 'equipo'] })

  await enviarEventos(servicio.urlBase, [evento('jornada', 1, { staff: [1], equipo: true })])
  await cliente.esperar((m) => m.t === 'cambio')
  await esperar(150)
  assert.equal(cliente.mensajes.filter((m) => m.t === 'cambio').length, 1)
})

test('la sala de un cliente nunca recibe id ni espacio', async () => {
  const contacto = await entrar({ suj: 'contacto', id: 40, salas: ['cliente:5'] })

  await enviarEventos(servicio.urlBase, [evento('ticket', 9, { cliente: 5, equipo: true }, 3)])

  const cambio = await contacto.esperar((m) => m.t === 'cambio')

  assert.deepEqual(cambio, { t: 'cambio', tipo: 'ticket', id: null, espacio_id: null })
})

test('la sala de pantallas recibe un cambio genérico y se estrangula a un aviso cada 5 s', async () => {
  const pantalla = await entrar({ suj: 'pantalla', id: 0, salas: ['pantallas'] })

  await enviarEventos(servicio.urlBase, [evento('tarea', 1, { pantallas: true }), evento('tarea', 2, { pantallas: true }), evento('ticket', 3, { pantallas: true })])
  await pantalla.esperar((m) => m.t === 'cambio')
  await esperar(250)

  const cambios = pantalla.mensajes.filter((m) => m.t === 'cambio')

  assert.equal(cambios.length, 1)
  assert.deepEqual(cambios[0], { t: 'cambio', tipo: 'pantalla', id: null, espacio_id: null })
})

test('más de 20 mensajes por segundo corta la conexión con 4429', async () => {
  const cliente = await entrar({ suj: 'staff', id: 1, salas: ['staff:1'] })

  for (let i = 0; i < 30; i += 1) cliente.enviar({ t: 'desuscribir', sala: 'equipo' })

  assert.equal(await cliente.cierre, 4429)
  assert.ok(cliente.mensajes.some((m) => m.t === 'error' && m.codigo === 'limite'))
})

test('un mensaje que no es JSON válido da mensaje_invalido sin cerrar', async () => {
  const cliente = await entrar({ suj: 'staff', id: 1, salas: ['staff:1'] })

  cliente.enviar('esto no es json')

  assert.deepEqual(await cliente.esperar((m) => m.t === 'error'), { t: 'error', codigo: 'mensaje_invalido' })
  assert.equal(cliente.ws.readyState, 1)
})

test('una conexión no puede tener más de 50 salas', async () => {
  const inicial = Array.from({ length: 20 }, (_, i) => `espacio:${i + 1}`)
  const cliente = await entrar({ suj: 'staff', id: 1, salas: inicial })

  // Un boleto lleva hasta 20 salas y cada `suscribir` agrega una: se llega a 50 con 30 más, a un
  // ritmo que no dispare el límite de mensajes por segundo.
  for (let i = 0; i < 31; i += 1) {
    const sala = `espacio:${100 + i}`

    cliente.enviar({ t: 'suscribir', sala, boleto: boletoDe({ suj: 'staff', id: 1, salas: [sala] }) })
    await esperar(60)
  }

  await esperarHasta(() => cliente.mensajes.some((m) => m.t === 'error'))

  const listos = cliente.mensajes.filter((m) => m.t === 'listo')

  assert.equal(listos.at(-1).salas.length, 50)
  assert.deepEqual(cliente.mensajes.filter((m) => m.t === 'error'), [{ t: 'error', codigo: 'limite' }])
  assert.equal(cliente.ws.readyState, 1)
})

test('presencia: quienes ven un recurso lo saben, y solo los suscritos', async () => {
  const sala = 'recurso:tarea:7'
  const ana = await entrar({ suj: 'staff', id: 1, salas: [sala] })
  const beto = await entrar({ suj: 'staff', id: 2, salas: [sala] })
  const ajeno = await entrar({ suj: 'staff', id: 3, salas: ['recurso:tarea:8'] })

  ana.enviar({ t: 'presencia', sala, estado: 'viendo' })
  beto.enviar({ t: 'presencia', sala, estado: 'viendo' })

  const presentes = await beto.esperar((m) => m.t === 'presentes' && m.staff.length === 2)

  assert.deepEqual(presentes, { t: 'presentes', sala, staff: [1, 2] })
  assert.equal(ajeno.mensajes.some((m) => m.t === 'presentes' && m.sala === sala), false)

  ana.enviar({ t: 'presencia', sala, estado: 'fuera' })
  await beto.esperar((m) => m.t === 'presentes' && m.staff.length === 1)
})

test('«escribiendo» solo en tickets, no se devuelve al emisor y se limita a uno cada 2 s', async () => {
  const sala = 'recurso:ticket:4'
  const ana = await entrar({ suj: 'staff', id: 1, salas: [sala] })
  const beto = await entrar({ suj: 'staff', id: 2, salas: [sala] })

  ana.enviar({ t: 'escribiendo', sala })
  ana.enviar({ t: 'escribiendo', sala })

  assert.deepEqual(await beto.esperar((m) => m.t === 'escribiendo'), { t: 'escribiendo', sala, staff: 1 })
  await esperar(150)
  assert.equal(beto.mensajes.filter((m) => m.t === 'escribiendo').length, 1)
  assert.equal(ana.mensajes.some((m) => m.t === 'escribiendo'), false)
})
