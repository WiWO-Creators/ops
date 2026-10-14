/**
 * Pruebas de las reglas del lado del cliente de una Tarea: seguidores-contacto y correo de entrega.
 *
 * Lo que se rompe en silencio aca es prometer un correo que no va a salir —interruptor apagado, Tarea
 * oculta, nadie que la siga— o dejar elegir un archivo que la API va a rechazar. Por eso el resumen
 * que lee la persona y la validacion previa se prueban y no se confian a la API.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contactosQueSiguen,
  entregaEsRelevante,
  errorDeEleccion,
  etiquetaDeCompletar,
  resumenDeEntrega,
  rutaDeSeguidoresDeContacto,
  rutaDeUnSeguidorDeContacto,
  SIN_ENTREGA
} from '../src/componentes/proyecto/entrega-final.ts'

const ANA = { id: 1, full_name: 'Ana Pérez', is_primary: true, following: true }
const BETO = { id: 2, full_name: 'Beto Soto', is_primary: false, following: true }
const DANI = { id: 3, full_name: 'Dani Rojas', is_primary: false, following: false }
const REAL = { max_bytes: 10_485_760, mail_enabled: true, mail_mode: 'real', task_visible_to_client: true }

test('las rutas del panel y del portal son distintas', () => {
  assert.equal(rutaDeSeguidoresDeContacto(42, 'panel'), 'tasks/42/contact-followers')
  assert.equal(rutaDeSeguidoresDeContacto(42, 'portal'), 'portal/tasks/42/followers')
  assert.equal(rutaDeUnSeguidorDeContacto(42, 7, 'panel'), 'tasks/42/contact-followers/7')
  assert.equal(rutaDeUnSeguidorDeContacto(42, 7, 'portal'), 'portal/tasks/42/followers/7')
})

test('solo cuentan los contactos que siguen', () => {
  assert.deepEqual(contactosQueSiguen([ANA, DANI, BETO]).map((c) => c.id), [1, 2])
  assert.deepEqual(contactosQueSiguen([]), [])
})

test('el resumen nombra a quien recibe el correo y dice que va adjunto', () => {
  const resumen = resumenDeEntrega({ contacts: [ANA, BETO, DANI], delivery: REAL })

  assert.equal(resumen.saldria, true)
  assert.match(resumen.texto, /Ana Pérez, Beto Soto/)
  assert.match(resumen.texto, /adjunto/)
  assert.doesNotMatch(resumen.texto, /Dani/)
})

test('en modo de prueba el resumen avisa que no llega al cliente', () => {
  const resumen = resumenDeEntrega({ contacts: [ANA], delivery: { ...REAL, mail_mode: 'prueba' } })

  assert.equal(resumen.saldria, true)
  assert.match(resumen.texto, /prueba/i)
})

test('el resumen no promete un correo que no va a salir', () => {
  const oculta = resumenDeEntrega({ contacts: [ANA], delivery: { ...REAL, task_visible_to_client: false } })
  const nadie = resumenDeEntrega({ contacts: [DANI], delivery: REAL })
  const vacio = resumenDeEntrega({ contacts: [], delivery: REAL })
  const apagado = resumenDeEntrega({ contacts: [ANA], delivery: { ...REAL, mail_enabled: false, mail_mode: 'apagado' } })

  for (const resumen of [oculta, nadie, vacio, apagado]) assert.equal(resumen.saldria, false)

  assert.match(oculta.texto, /no está visible/)
  assert.match(nadie.texto, /no tiene seguidores/)
  assert.match(vacio.texto, /no tiene seguidores/)
  assert.match(apagado.texto, /apagado/)
})

test('la entrega es relevante solo si el correo saldria de verdad', () => {
  assert.equal(entregaEsRelevante({ contacts: [ANA], delivery: REAL }), true)
  assert.equal(entregaEsRelevante({ contacts: [ANA] }), false, 'sin el bloque `delivery` no se asume nada')
  assert.equal(entregaEsRelevante({ contacts: [DANI], delivery: REAL }), false)
  assert.equal(entregaEsRelevante({ contacts: [ANA], delivery: { ...REAL, mail_enabled: false } }), false)
  assert.equal(entregaEsRelevante({ contacts: [ANA], delivery: { ...REAL, task_visible_to_client: false } }), false)
})

test('la eleccion se valida antes de completar', () => {
  const pesado = { size: 2_000 }
  const vacio = { size: 0 }

  assert.equal(errorDeEleccion(SIN_ENTREGA), null)
  assert.equal(errorDeEleccion({ modo: 'existente', archivoId: 5 }), null)
  assert.match(errorDeEleccion({ modo: 'existente', archivoId: null }), /Elige cuál/)
  assert.match(errorDeEleccion({ modo: 'nuevo', archivo: null }), /Elige el archivo/)
  assert.match(errorDeEleccion({ modo: 'nuevo', archivo: vacio }), /vacío/)
  assert.match(errorDeEleccion({ modo: 'nuevo', archivo: pesado }, 1_000), /más del máximo/)
  assert.equal(errorDeEleccion({ modo: 'nuevo', archivo: pesado }, 2_000), null, 'justo en el tope pasa')
  assert.equal(errorDeEleccion({ modo: 'nuevo', archivo: pesado }), null, 'sin tope conocido lo decide la API')
})

test('el boton dice si saldra un correo', () => {
  assert.equal(etiquetaDeCompletar(SIN_ENTREGA), 'Completar sin correo')
  assert.equal(etiquetaDeCompletar({ modo: 'existente', archivoId: 1 }), 'Completar y enviar')
  assert.equal(etiquetaDeCompletar({ modo: 'nuevo', archivo: null }), 'Completar y enviar')
})

test('el aviso tras completar no afirma un envio que no ocurrio', async () => {
  const { avisoDeEntrega } = await import('../src/componentes/proyecto/entrega-final.ts')

  assert.equal(avisoDeEntrega(REAL, false), null, 'sin archivo no hay nada que contar')
  assert.equal(avisoDeEntrega(undefined, true), null, 'sin saber si el correo esta encendido no se afirma nada')
  assert.equal(avisoDeEntrega({ ...REAL, mail_enabled: false }, true), null, 'apagado: el archivo no viajo')
  assert.equal(avisoDeEntrega({ ...REAL, task_visible_to_client: false }, true), null)
  assert.match(avisoDeEntrega(REAL, true), /Se envió el correo/)
  assert.match(avisoDeEntrega({ ...REAL, mail_mode: 'prueba' }, true), /prueba/i)
})
