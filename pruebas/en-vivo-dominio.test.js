/**
 * Pruebas del contrato puro de «Ops en vivo» (`src/dominio/en-vivo.ts`).
 *
 * Lo que se protege: que los lectores de mensajes rechacen todo lo que no tenga la forma exacta (el
 * servicio los usa con datos de internet), que el respaldo de sondeo se espacie solo con el socket
 * conectado y que los interruptores no enciendan nada si falta el maestro o la URL.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIG_EN_VIVO_APAGADA,
  configDeEnVivo,
  debeSondear,
  esSalaValida,
  eventosDeVentanaPara,
  leerLoteDeEventos,
  leerMensajeDelCliente,
  leerMensajeDelServidor,
  leerPedidoDeBoleto,
  salaCorrespondeAlSujeto,
  salasPermitidasPorDefecto,
  validacionDeSala
} from '../src/dominio/en-vivo.ts'

const json = (valor) => JSON.stringify(valor)

test('salas: solo las formas conocidas', () => {
  for (const sala of ['equipo', 'pantallas', 'staff:1', 'espacio:30', 'cliente:7', 'recurso:tarea:5', 'recurso:ticket:5', 'recurso:proyecto:5']) {
    assert.equal(esSalaValida(sala), true, sala)
  }

  for (const sala of ['', 'staff:0', 'staff:-1', 'staff:abc', 'recurso:orden:1', 'recurso:tarea', 'espacio:1:2', 'EQUIPO', 'staff:01', null, 5]) {
    assert.equal(esSalaValida(sala), false, String(sala))
  }
})

test('mensajes del cliente: los cinco tipos válidos', () => {
  assert.deepEqual(leerMensajeDelCliente(json({ t: 'hola', boleto: 'x.y' })), { t: 'hola', boleto: 'x.y' })
  assert.deepEqual(leerMensajeDelCliente(json({ t: 'suscribir', sala: 'equipo', boleto: 'x.y' })), { t: 'suscribir', sala: 'equipo', boleto: 'x.y' })
  assert.deepEqual(leerMensajeDelCliente(json({ t: 'desuscribir', sala: 'equipo' })), { t: 'desuscribir', sala: 'equipo' })
  assert.deepEqual(leerMensajeDelCliente(json({ t: 'presencia', sala: 'recurso:tarea:3', estado: 'viendo' })), { t: 'presencia', sala: 'recurso:tarea:3', estado: 'viendo' })
  assert.deepEqual(leerMensajeDelCliente(json({ t: 'escribiendo', sala: 'recurso:ticket:3' })), { t: 'escribiendo', sala: 'recurso:ticket:3' })
})

test('mensajes del cliente: lo inválido da null', () => {
  const invalidos = [
    'no es json', '[]', '"hola"', '', null, undefined,
    json({ t: 'hola' }), json({ t: 'hola', boleto: '' }), json({ t: 'hola', boleto: 5 }),
    json({ t: 'suscribir', sala: 'otra:cosa', boleto: 'x' }),
    json({ t: 'suscribir', sala: 'equipo' }),
    json({ t: 'presencia', sala: 'equipo', estado: 'viendo' }),
    json({ t: 'presencia', sala: 'recurso:tarea:3', estado: 'dormido' }),
    json({ t: 'escribiendo', sala: 'recurso:tarea:3' }),
    json({ t: 'desconocido' })
  ]

  for (const texto of invalidos) assert.equal(leerMensajeDelCliente(texto), null, String(texto))
})

test('mensajes del cliente: más de 4 KB se rechaza', () => {
  assert.equal(leerMensajeDelCliente(json({ t: 'hola', boleto: 'x'.repeat(4100) })), null)
  assert.notEqual(leerMensajeDelCliente(json({ t: 'hola', boleto: 'x'.repeat(2000) })), null)
})

test('mensajes del servidor: los cinco tipos válidos y lo inválido', () => {
  assert.deepEqual(leerMensajeDelServidor(json({ t: 'listo', salas: ['equipo'] })), { t: 'listo', salas: ['equipo'] })
  assert.deepEqual(leerMensajeDelServidor(json({ t: 'cambio', tipo: 'tarea', id: 4, espacio_id: null })), { t: 'cambio', tipo: 'tarea', id: 4, espacio_id: null })
  assert.deepEqual(leerMensajeDelServidor(json({ t: 'cambio', tipo: 'pantalla', id: null, espacio_id: null })), { t: 'cambio', tipo: 'pantalla', id: null, espacio_id: null })
  assert.deepEqual(leerMensajeDelServidor(json({ t: 'presentes', sala: 'recurso:tarea:3', staff: [1, 2] })), { t: 'presentes', sala: 'recurso:tarea:3', staff: [1, 2] })
  assert.deepEqual(leerMensajeDelServidor(json({ t: 'escribiendo', sala: 'recurso:ticket:3', staff: 7 })), { t: 'escribiendo', sala: 'recurso:ticket:3', staff: 7 })
  assert.deepEqual(leerMensajeDelServidor(json({ t: 'error', codigo: 'limite' })), { t: 'error', codigo: 'limite' })

  for (const texto of [
    'x', json({ t: 'cambio', tipo: 'invento', id: 1, espacio_id: null }), json({ t: 'cambio', tipo: 'tarea', id: 'a', espacio_id: null }),
    json({ t: 'error', codigo: 'otro' }), json({ t: 'listo', salas: ['nada'] }), json({ t: 'presentes', sala: 'equipo', staff: ['a'] })
  ]) {
    assert.equal(leerMensajeDelServidor(texto), null, texto)
  }
})

test('lote de eventos: válido, con valores por defecto y los casos de rechazo', () => {
  const evento = { tipo: 'tarea', id: 12, espacio_id: 3, audiencia: { staff: [1], equipo: true, espacio: true, cliente: null, pantallas: false } }
  const lote = leerLoteDeEventos(json({ eventos: [evento, { tipo: 'aviso', id: null, audiencia: { staff: [4] } }], emitido_en: 1792080000 }))

  assert.equal(lote.eventos.length, 2)
  assert.deepEqual(lote.eventos[1], { tipo: 'aviso', id: null, espacio_id: null, audiencia: { staff: [4], equipo: false, espacio: false, cliente: null, pantallas: false } })

  const con = (cambios) => json({ eventos: [{ ...evento, ...cambios }], emitido_en: 1 })

  assert.equal(leerLoteDeEventos(con({ tipo: 'otro' })), null)
  assert.equal(leerLoteDeEventos(con({ id: 0 })), null)
  assert.equal(leerLoteDeEventos(con({ id: '5' })), null)
  assert.equal(leerLoteDeEventos(con({ audiencia: { staff: ['a'] } })), null)
  assert.equal(leerLoteDeEventos(con({ audiencia: { equipo: 'si' } })), null)
  assert.equal(leerLoteDeEventos(json({ eventos: [], emitido_en: 1 })), null)
  assert.equal(leerLoteDeEventos(json({ eventos: [evento] })), null)
  assert.equal(leerLoteDeEventos('no json'), null)
  assert.equal(leerLoteDeEventos(json({ eventos: Array(201).fill(evento), emitido_en: 1 })), null)
  assert.notEqual(leerLoteDeEventos(json({ eventos: Array(200).fill(evento), emitido_en: 1 })), null)
})

test('salas por defecto y salas que corresponden a cada sujeto', () => {
  assert.deepEqual(salasPermitidasPorDefecto({ suj: 'staff', id: 7 }), ['staff:7', 'equipo'])
  assert.deepEqual(salasPermitidasPorDefecto({ suj: 'pantalla', id: 0 }), ['pantallas'])
  assert.deepEqual(salasPermitidasPorDefecto({ suj: 'contacto', id: 3 }), [])

  assert.equal(salaCorrespondeAlSujeto('staff', 7, 'staff:7'), true)
  assert.equal(salaCorrespondeAlSujeto('staff', 7, 'staff:8'), false)
  assert.equal(salaCorrespondeAlSujeto('staff', 7, 'cliente:1'), false)
  assert.equal(salaCorrespondeAlSujeto('staff', 7, 'recurso:tarea:2'), true)
  assert.equal(salaCorrespondeAlSujeto('contacto', 3, 'cliente:1'), true)
  assert.equal(salaCorrespondeAlSujeto('contacto', 3, 'equipo'), false)
  assert.equal(salaCorrespondeAlSujeto('pantalla', 0, 'pantallas'), true)
  assert.equal(salaCorrespondeAlSujeto('pantalla', 0, 'equipo'), false)
})

test('validación de salas pedidas por el panel', () => {
  assert.deepEqual(validacionDeSala('staff:7', 7), { via: 'sesion' })
  assert.deepEqual(validacionDeSala('equipo', 7), { via: 'sesion' })
  assert.deepEqual(validacionDeSala('staff:8', 7), { via: 'denegada' })
  assert.deepEqual(validacionDeSala('espacio:3', 7), { via: 'api', ruta: '/projects/3' })
  assert.deepEqual(validacionDeSala('recurso:tarea:5', 7), { via: 'api', ruta: '/tasks/5' })
  assert.deepEqual(validacionDeSala('recurso:ticket:5', 7), { via: 'api', ruta: '/tickets/5' })
  assert.deepEqual(validacionDeSala('recurso:proyecto:5', 7), { via: 'api', ruta: '/projects/5' })
  assert.deepEqual(validacionDeSala('cliente:5', 7), { via: 'denegada' })
  assert.deepEqual(validacionDeSala('pantallas', 7), { via: 'denegada' })
  assert.deepEqual(validacionDeSala('../etc', 7), { via: 'denegada' })
})

test('pedido de boleto: formas válidas e inválidas', () => {
  assert.deepEqual(leerPedidoDeBoleto({}), { salas: undefined, documento: null, espacioId: null })
  assert.deepEqual(leerPedidoDeBoleto({ salas: ['equipo'], documento: 'acta:12', espacio_id: 3 }), { salas: ['equipo'], documento: 'acta:12', espacioId: 3 })

  for (const cuerpo of [
    null, [], 'x', { salas: 'equipo' }, { salas: ['nada'] }, { documento: 'acta:12' }, { documento: 'tarea:5', espacio_id: 3 },
    { documento: 'acta:abc', espacio_id: 3 }, { espacio_id: '3' }, { salas: Array.from({ length: 21 }, (_, i) => `espacio:${i + 1}`) }
  ]) {
    assert.equal(leerPedidoDeBoleto(cuerpo), null, JSON.stringify(cuerpo))
  }
})

test('eventos de ventana por tipo de cambio', () => {
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'tarea', id: 5 }), [
    { nombre: 'ops:tareas-cambiadas', detalle: {} },
    { nombre: 'ops:recurso-cambiado', detalle: { ruta: 'tasks/5', origen: 'en-vivo' } }
  ])
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'tarea', id: null }), [{ nombre: 'ops:tareas-cambiadas', detalle: {} }])
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'ticket', id: 9 }), [
    { nombre: 'ops:tickets-cambiados', detalle: { id: 9 } },
    { nombre: 'ops:recurso-cambiado', detalle: { ruta: 'tickets/9', origen: 'en-vivo' } }
  ])
  // Un ticket sin id (el portal no recibe ids) no tiene qué releer en concreto.
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'ticket', id: null }), [])
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'jornada', id: 3 }), [
    { nombre: 'ops:en-vivo', detalle: { tipo: 'jornada', id: 3, espacio_id: null } }
  ])
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'pantalla', id: null }), [
    { nombre: 'ops:en-vivo', detalle: { tipo: 'pantalla', id: null, espacio_id: null } }
  ])
  assert.deepEqual(eventosDeVentanaPara({ tipo: 'aviso', id: 2, espacio_id: 4 }), [
    { nombre: 'ops:en-vivo', detalle: { tipo: 'aviso', id: 2, espacio_id: 4 } }
  ])
})

test('debeSondear: conectado se espacia a 5 minutos como mínimo', () => {
  assert.equal(debeSondear(0, 30_000, false, 29_999), false)
  assert.equal(debeSondear(0, 30_000, false, 30_000), true)
  assert.equal(debeSondear(0, 30_000, true, 299_999), false)
  assert.equal(debeSondear(0, 30_000, true, 300_000), true)
  // Un intervalo base más largo que el respaldo manda.
  assert.equal(debeSondear(0, 600_000, true, 599_999), false)
  assert.equal(debeSondear(0, 600_000, true, 600_000), true)
})

test('interruptores: el maestro y la URL mandan sobre cada función', () => {
  const ajustes = (valores) => ({ editable: Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, { value: v }])) })
  const todo = { wiwo_en_vivo: '1', wiwo_actas_colaborativas: true, wiwo_en_vivo_orbe: 1, wiwo_en_vivo_equipo: '1', wiwo_en_vivo_presencia: '0', wiwo_acta_comentarios: '1' }

  assert.deepEqual(configDeEnVivo(ajustes(todo), 'wss://ops.wiwo.me/en-vivo/'), {
    activo: true,
    url: 'wss://ops.wiwo.me/en-vivo',
    actas: true,
    orbe: true,
    equipo: true,
    presencia: false,
    pantallas: false,
    textos: false,
    comentarios: true
  })
  // Sin URL o sin maestro, todo apagado aunque las funciones estén en 1.
  assert.deepEqual(configDeEnVivo(ajustes(todo), '  '), CONFIG_EN_VIVO_APAGADA)
  assert.deepEqual(configDeEnVivo(ajustes({ ...todo, wiwo_en_vivo: '0' }), 'wss://x'), CONFIG_EN_VIVO_APAGADA)
  assert.deepEqual(configDeEnVivo({ editable: {} }, 'wss://x'), CONFIG_EN_VIVO_APAGADA)
})
