/**
 * Reglas de los listados de tickets: quien espera a quien, que cuenta como no leido, el contador de la
 * pestaña, el filtro rapido y el refresco del motor de tabla con la consulta vigente.
 *
 * Son puras a proposito: el refresco que pedia con la consulta del montaje devolvia la lista sin
 * filtrar debajo de los filtros puestos, y eso no se ve en ninguna captura, se ve en una fila de mas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTO_TICKETS_CAMBIADOS as EVENTO_DEL_MODAL } from '../src/dominio/ticket-vista.ts'
import {
  EVENTO_TICKETS_CAMBIADOS,
  alternarEsperandoAlEquipo,
  esperaDelTicket,
  esperaTuRespuesta,
  etiquetaDePestana,
  filtraEsperandoAlEquipo,
  leerContadores,
  noLeidoPorElCliente,
  noLeidoPorElEquipo,
  ultimaActividad
} from '../src/dominio/tickets-listados.ts'
import { debeAdoptarInicial, debePedirPagina } from '../src/componentes/datos/tabla.ts'
import {
  SIN_PROYECTO_EN_TICKETS,
  definicionDeTickets,
  definicionDeTicketsDelProyecto,
  nombreDelSolicitante,
  opcionesDeProyectoDeTickets,
  textoDeEspera
} from '../src/definiciones/tickets.ts'
import { construirConsulta, leerConsulta } from '../src/datos/consulta.ts'
import { operadoresCampo } from '../src/definiciones/filtros.ts'

const AHORA = new Date('2026-09-23T12:00:00Z')

// --- Esperando a ------------------------------------------------------------

test('si lo ultimo es del cliente, espera al equipo desde espera_desde', () => {
  const espera = esperaDelTicket({
    status: 1,
    ultimo_de: 'cliente',
    espera_desde: '2026-09-23T09:00:00Z',
    lastreply: '2026-09-20T09:00:00Z'
  }, AHORA)

  assert.equal(espera?.lado, 'equipo')
  assert.equal(espera?.etiqueta, 'Esperando al equipo')
  assert.equal(espera?.instante, '2026-09-23T09:00:00Z')
  assert.match(espera?.desde ?? '', /3 horas/)
})

test('si lo ultimo es del equipo, espera al cliente desde la ultima respuesta', () => {
  const espera = esperaDelTicket({ status: 3, ultimo_de: 'equipo', espera_desde: null, lastreply: '2026-09-21T12:00:00Z' }, AHORA)

  assert.equal(espera?.lado, 'cliente')
  assert.equal(espera?.instante, '2026-09-21T12:00:00Z')
  assert.match(espera?.desde ?? '', /2 días|anteayer/)
})

test('un ticket cerrado o sin ultimo_de no espera a nadie', () => {
  assert.equal(esperaDelTicket({ status: 5, ultimo_de: 'cliente' }, AHORA), null)
  assert.equal(esperaDelTicket({ status: 1 }, AHORA), null)
  assert.equal(esperaDelTicket({ status: 1, ultimo_de: null }, AHORA), null)
})

test('esperando al equipo sin espera_desde cae a la apertura, y sin fechas no inventa el tiempo', () => {
  assert.equal(esperaDelTicket({ status: 1, ultimo_de: 'cliente', lastreply: null, date: '2026-09-22T12:00:00Z' }, AHORA)?.instante, '2026-09-22T12:00:00Z')
  assert.equal(esperaDelTicket({ status: 1, ultimo_de: 'cliente' }, AHORA)?.desde, null)
})

test('el texto de la columna junta etiqueta y tiempo', () => {
  const texto = textoDeEspera({ status: 1, ultimo_de: 'cliente', espera_desde: '2026-09-23T11:00:00Z' }, AHORA)

  assert.match(texto, /^Esperando al equipo · /)
  assert.equal(textoDeEspera({ status: 5, ultimo_de: 'cliente' }, AHORA), '')
})

// --- No leidos ----------------------------------------------------------------

test('no leido por el equipo acepta 0 y false, y la ausencia no marca', () => {
  assert.equal(noLeidoPorElEquipo({ adminread: 0 }), true)
  assert.equal(noLeidoPorElEquipo({ adminread: false }), true)
  assert.equal(noLeidoPorElEquipo({ adminread: 1 }), false)
  assert.equal(noLeidoPorElEquipo({ adminread: true }), false)
  assert.equal(noLeidoPorElEquipo({}), false)
})

test('en el portal, no leido espera tu respuesta salvo que este cerrado', () => {
  assert.equal(noLeidoPorElCliente({ no_leido: true }), true)
  assert.equal(noLeidoPorElCliente({}), false)
  assert.equal(esperaTuRespuesta({ status: 3, no_leido: true }), true)
  assert.equal(esperaTuRespuesta({ status: 3, no_leido: false }), false)
  assert.equal(esperaTuRespuesta({ status: 5, no_leido: true }), false)
  // Si algun dia llega `ultimo_de`, manda: leido pero con la pelota del lado del cliente.
  assert.equal(esperaTuRespuesta({ status: 3, no_leido: false, ultimo_de: 'equipo' }), true)
  assert.equal(esperaTuRespuesta({ status: 1, no_leido: true, ultimo_de: 'cliente' }), false)
})

test('la ultima actividad es la ultima respuesta, o la apertura', () => {
  assert.equal(ultimaActividad({ lastreply: 'b', date: 'a' }), 'b')
  assert.equal(ultimaActividad({ last_reply: 'c', date: 'a' }), 'c')
  assert.equal(ultimaActividad({ lastreply: null, date: 'a' }), 'a')
  assert.equal(ultimaActividad({}), null)
})

// --- Contador de la pestaña --------------------------------------------------------

test('los contadores se sanean y nunca lanzan', () => {
  assert.deepEqual(leerContadores({ abiertos: 3, esperando_equipo: 1, sin_leer: 2 }), { abiertos: 3, esperandoEquipo: 1, sinLeer: 2 })
  assert.deepEqual(leerContadores({ abiertos: 2 }), { abiertos: 2, esperandoEquipo: 0, sinLeer: 0 })
  assert.equal(leerContadores({ abiertos: -1 }), null)
  assert.equal(leerContadores({ abiertos: '3' }), null)
  assert.equal(leerContadores(null), null)
  assert.equal(leerContadores('nada'), null)
})

test('el nombre accesible de la pestaña dice abiertos y los que esperan al equipo', () => {
  assert.equal(etiquetaDePestana('Tickets', null), 'Tickets')
  assert.equal(etiquetaDePestana('Tickets', { abiertos: 1, esperandoEquipo: 0, sinLeer: 0 }), 'Tickets · 1 abierto')
  assert.equal(
    etiquetaDePestana('Tickets', { abiertos: 4, esperandoEquipo: 2, sinLeer: 1 }),
    'Tickets · 4 abiertos, 2 esperando al equipo'
  )
})

// --- Filtro rapido --------------------------------------------------------

test('el filtro rapido alterna filter[esperando]=equipo, vuelve a la pagina 1 y conserva lo demas', () => {
  const puesto = alternarEsperandoAlEquipo(new URLSearchParams('tab=tickets&page=3&filter[status]=1'))
  const params = new URLSearchParams(puesto.slice(1))

  assert.equal(params.get('filter[esperando]'), 'equipo')
  assert.equal(params.get('page'), null)
  assert.equal(params.get('tab'), 'tickets')
  assert.equal(params.get('filter[status]'), '1')
  assert.equal(filtraEsperandoAlEquipo(params), true)

  const quitado = new URLSearchParams(alternarEsperandoAlEquipo(params).slice(1))
  assert.equal(quitado.get('filter[esperando]'), null)
  assert.equal(quitado.get('tab'), 'tickets')
})

test('el filtro rapido es el mismo filtro que entiende la definicion', () => {
  const definicion = definicionDeTicketsDelProyecto(1)
  const estado = leerConsulta(new URLSearchParams('filter[esperando]=equipo'), definicion)

  assert.equal(construirConsulta(estado, definicion), 'filter%5Besperando%5D=equipo&sort=-date')
})

// --- Refresco con la consulta vigente ---------------------------------------------

const BASE = { consulta: 'a', consultaInicial: 'a', revision: 0, refresco: 0, refrescoDeMontaje: 0 }

test('no pide al montar si la URL sigue en la consulta de los datos iniciales', () => {
  assert.equal(debePedirPagina(BASE), false)
})

test('un refresco de afuera pide aunque la consulta no haya cambiado', () => {
  assert.equal(debePedirPagina({ ...BASE, refresco: 1 }), true)
})

test('un refresco con filtros puestos pide la consulta vigente, no la del montaje', () => {
  // La tabla arma la peticion con `consulta`: que se pida es lo que se prueba aca; con que, lo fija el
  // efecto, que usa siempre la vigente.
  assert.equal(debePedirPagina({ ...BASE, consulta: 'filter[status]=1', refresco: 2, refrescoDeMontaje: 1 }), true)
})

test('una tabla montada con refresco distinto de cero no pide al montar', () => {
  assert.equal(debePedirPagina({ ...BASE, refresco: 3, refrescoDeMontaje: 3 }), false)
})

test('los iniciales se adoptan solo si son de la consulta vigente', () => {
  assert.equal(debeAdoptarInicial({ ...BASE, consulta: 'b' }, true), false)
  assert.equal(debeAdoptarInicial(BASE, false), true)
})

test('despues de un refresco no se vuelve a los iniciales viejos, pero si a unos nuevos', () => {
  assert.equal(debeAdoptarInicial({ ...BASE, refresco: 1 }, false), false)
  assert.equal(debeAdoptarInicial({ ...BASE, revision: 1 }, false), false)
  assert.equal(debeAdoptarInicial({ ...BASE, refresco: 1 }, true), true)
})

// --- Definiciones ---------------------------------------------------------------

test('departamento y asignado solo se ofrecen a quien administra', () => {
  const claves = (esAdmin) => definicionDeTickets({ esAdmin }).filtros.map((f) => f.clave)

  assert.ok(claves(true).includes('department'))
  assert.ok(claves(true).includes('assigned'))
  assert.ok(!claves(false).includes('department'))
  assert.ok(!claves(false).includes('assigned'))
})

test('una URL compartida con department no llega a la API de quien no administra', () => {
  const definicion = definicionDeTickets({ esAdmin: false })
  const estado = leerConsulta(new URLSearchParams('filter[department]=2&filter[status]=1'), definicion)

  assert.equal(construirConsulta(estado, definicion).includes('department'), false)
})

test('el asunto solo se filtra por contiene, vacio o no vacio', () => {
  const asunto = definicionDeTickets({ esAdmin: true }).filtros.find((f) => f.clave === 'subject')

  assert.deepEqual(operadoresCampo(asunto), ['contains', 'empty', 'not_empty'])
})

test('la bandeja muestra el Proyecto y la pestaña no', () => {
  assert.ok(definicionDeTickets({ esAdmin: false }).columnas.some((c) => c.clave === 'project'))
  assert.ok(!definicionDeTicketsDelProyecto(1).columnas.some((c) => c.clave === 'project'))
  assert.ok(!definicionDeTicketsDelProyecto(1).filtros.some((f) => f.clave === 'project_id'))
})

test('Sin Proyecto va primero y es project_id=0', () => {
  const opciones = opcionesDeProyectoDeTickets([{ id: 7, name: 'Portal' }])

  assert.equal(opciones[0].valor, SIN_PROYECTO_EN_TICKETS)
  assert.equal(SIN_PROYECTO_EN_TICKETS, '0')
  assert.match(opciones[0].etiqueta, /^Sin /)
  assert.deepEqual(opciones[1], { valor: '7', etiqueta: 'Portal' })
})

test('el solicitante cae del contacto al nombre, al correo y a la empresa', () => {
  const base = { tipo: 'contacto', contact: null, client: null, name: null, email: null }

  assert.equal(nombreDelSolicitante({ solicitante: { ...base, contact: { id: 1, full_name: 'Laura', email: 'l@x' } } }), 'Laura')
  assert.equal(nombreDelSolicitante({ solicitante: { ...base, tipo: 'correo', email: 'x@y.cl' } }), 'x@y.cl')
  assert.equal(nombreDelSolicitante({ solicitante: { ...base, client: { id: 1, name: 'Acme' } } }), 'Acme')
  assert.equal(nombreDelSolicitante({ solicitante: base }), 'Sin solicitante')
  assert.equal(nombreDelSolicitante({}), 'Sin solicitante')
})

test('los listados escuchan el mismo evento que emite el modal', () => {
  assert.equal(EVENTO_TICKETS_CAMBIADOS, EVENTO_DEL_MODAL)
})
