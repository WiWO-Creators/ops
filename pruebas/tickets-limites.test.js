/**
 * Limites de texto de los tickets, el borrador del alta del portal y la guarda de XSS.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { LARGO_MENSAJE_TICKET, contadorDeLargo, topeDeMensaje } from '../src/dominio/ticket-limites.ts'
import {
  LARGO_ASUNTO,
  SIN_PRIORIDAD,
  claveDeBorradorDeSolicitud,
  leerBorradorDeSolicitud,
  serializarBorradorDeSolicitud
} from '../src/dominio/tickets-del-portal.ts'

const ESPACIOS = [{ id: 4, name: 'Alfa' }, { id: 9, name: 'Beta' }]
const PRIORIDADES = [{ id: 1, name: 'Baja' }, { id: 2, name: 'Alta' }]

test('el contador no aparece mientras queda margen', () => {
  assert.equal(contadorDeLargo(0), null)
  assert.equal(contadorDeLargo(LARGO_MENSAJE_TICKET * 0.89), null)
})

test('el contador aparece cerca del tope, con formato es-CL', () => {
  assert.equal(contadorDeLargo(19_500), '19.500 de 20.000 caracteres')
  assert.equal(contadorDeLargo(LARGO_MENSAJE_TICKET), '20.000 de 20.000 caracteres')
})

test('el tope de mensaje aplica al portal y no al equipo', () => {
  assert.equal(topeDeMensaje('portal'), LARGO_MENSAJE_TICKET)
  assert.equal(topeDeMensaje('panel'), undefined)
})

test('la clave del borrador del alta distingue contactos', () => {
  assert.notEqual(claveDeBorradorDeSolicitud(1), claveDeBorradorDeSolicitud(2))
  assert.match(claveDeBorradorDeSolicitud(7), /:7:/)
})

test('un borrador sin texto no se guarda, aunque haya espacio o prioridad elegidos', () => {
  assert.equal(serializarBorradorDeSolicitud({ asunto: ' ', mensaje: '', espacio: '4', prioridad: '2' }), '')
})

test('el borrador sobrevive a la ida y vuelta', () => {
  const borrador = { asunto: 'No carga', mensaje: 'Desde ayer', espacio: '9', prioridad: '2' }
  const guardado = serializarBorradorDeSolicitud(borrador)

  assert.deepEqual(leerBorradorDeSolicitud(guardado, ESPACIOS, PRIORIDADES), borrador)
})

test('un borrador con espacio o prioridad que ya no existen cae a los valores por defecto', () => {
  const guardado = JSON.stringify({ asunto: 'a', mensaje: 'b', espacio: '77', prioridad: '88' })

  assert.deepEqual(
    leerBorradorDeSolicitud(guardado, ESPACIOS, PRIORIDADES, 4),
    { asunto: 'a', mensaje: 'b', espacio: '4', prioridad: SIN_PRIORIDAD }
  )
})

test('un guardado vacio, roto o de otra forma da el formulario vacio', () => {
  const vacio = { asunto: '', mensaje: '', espacio: '', prioridad: SIN_PRIORIDAD }

  assert.deepEqual(leerBorradorDeSolicitud('', ESPACIOS, PRIORIDADES), vacio)
  assert.deepEqual(leerBorradorDeSolicitud('{roto', ESPACIOS, PRIORIDADES), vacio)
  assert.deepEqual(leerBorradorDeSolicitud('{"asunto":5,"mensaje":[]}', ESPACIOS, PRIORIDADES), vacio)
})

test('un borrador mas largo que los topes se recorta', () => {
  const guardado = JSON.stringify({
    asunto: 'a'.repeat(LARGO_ASUNTO + 50),
    mensaje: 'b'.repeat(LARGO_MENSAJE_TICKET + 50),
    espacio: '4',
    prioridad: SIN_PRIORIDAD
  })
  const leido = leerBorradorDeSolicitud(guardado, ESPACIOS, PRIORIDADES)

  assert.equal(leido.asunto.length, LARGO_ASUNTO)
  assert.equal(leido.mensaje.length, LARGO_MENSAJE_TICKET)
})

test('ningun componente de tickets inyecta HTML crudo', () => {
  // El texto de los mensajes se pinta siempre como texto: un `dangerouslySetInnerHTML` aca abriria
  // el hilo a XSS desde cualquier cliente del portal.
  const carpeta = new URL('../src/componentes/tickets/', import.meta.url)
  const archivos = readdirSync(carpeta).filter((nombre) => /\.(tsx?|jsx?)$/.test(nombre))

  assert.ok(archivos.length > 0)

  for (const nombre of archivos) {
    const fuente = readFileSync(new URL(nombre, carpeta), 'utf8')

    assert.ok(!fuente.includes('dangerouslySetInnerHTML'), nombre)
  }
})
