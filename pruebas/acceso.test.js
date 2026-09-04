/**
 * Pruebas de las reglas del login con Google.
 *
 * Lo importante no es que acepte `wiwo.me`, sino que no acepte lo que abriria la puerta: un correo
 * entero, un dominio sin punto o un comodin que el backend no compara.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AJUSTES_GOOGLE, ajusteBool, ajusteTexto, dominiosATexto, dominiosDesdeTexto,
  esDominioPlausible, motivoParaRechazarDominio, tieneAjustesDeGoogle
} from '../src/dominio/acceso.ts'

test('acepta dominios plausibles', () => {
  for (const dominio of ['wiwo.me', 'agenciapalta.cl', 'mgcglobalgroup.com', 'mail.sub.wiwo.me', 'a-b.co']) {
    assert.equal(esDominioPlausible(dominio), true, dominio)
  }
})

test('rechaza lo que no es un dominio', () => {
  for (const valor of [
    'alguien@wiwo.me', // un correo entero, el error mas comun
    'wiwo', // sin punto: cualquier host interno entraria
    '*.wiwo.me', // el backend compara tal cual: un comodin no autoriza nada
    'wiwo me',
    'https://wiwo.me',
    '.wiwo.me',
    'wiwo.me.',
    '-wiwo.me',
    ''
  ]) {
    assert.equal(esDominioPlausible(valor), false, valor)
  }
})

test('lee la lista separada por coma que guarda la API, con espacios y comas de mas', () => {
  assert.deepEqual(
    dominiosDesdeTexto('agenciapalta.cl, WiWO.me,,mgcglobalgroup.com'),
    ['agenciapalta.cl', 'wiwo.me', 'mgcglobalgroup.com']
  )
  assert.deepEqual(dominiosDesdeTexto(null), [])
  assert.deepEqual(dominiosDesdeTexto(''), [])
})

test('serializa a la forma que espera la API', () => {
  assert.equal(dominiosATexto(['wiwo.me', 'agenciapalta.cl']), 'wiwo.me,agenciapalta.cl')
  assert.equal(dominiosATexto([]), '')
})

test('cada rechazo dice su motivo', () => {
  assert.equal(motivoParaRechazarDominio('wiwo.me', ['agenciapalta.cl']), null)
  assert.equal(motivoParaRechazarDominio('  WiWO.me ', ['wiwo.me']), 'Ese dominio ya está en la lista.')
  assert.equal(motivoParaRechazarDominio('', []), 'Escribe un dominio.')
  assert.match(motivoParaRechazarDominio('alguien@wiwo.me', []), /no parece un dominio/)
})

/** Un `GET /settings` con las tres opciones del grupo `acceso` ya desplegadas. */
function ajustesCompletos () {
  return {
    editable: {
      [AJUSTES_GOOGLE.habilitado]: { group: 'acceso', type: 'bool', value: true },
      [AJUSTES_GOOGLE.dominios]: { group: 'acceso', type: 'texto', value: 'wiwo.me' },
      [AJUSTES_GOOGLE.clienteId]: { group: 'acceso', type: 'texto', value: null }
    },
    readonly: {}
  }
}

test('lee los valores con el tipo que corresponde', () => {
  const ajustes = ajustesCompletos()

  assert.equal(tieneAjustesDeGoogle(ajustes), true)
  assert.equal(ajusteBool(ajustes, AJUSTES_GOOGLE.habilitado), true)
  assert.equal(ajusteTexto(ajustes, AJUSTES_GOOGLE.dominios), 'wiwo.me')
  // Opcion sin fila en `tbloptions`: viaja con `value: null`, y el campo se muestra vacio.
  assert.equal(ajusteTexto(ajustes, AJUSTES_GOOGLE.clienteId), '')
})

test('una instalacion sin las opciones nuevas no finge tenerlas', () => {
  const ajustes = { editable: {}, readonly: {} }

  assert.equal(tieneAjustesDeGoogle(ajustes), false)
  assert.equal(ajusteBool(ajustes, AJUSTES_GOOGLE.habilitado), false)
  assert.equal(ajusteTexto(ajustes, AJUSTES_GOOGLE.dominios), '')
})

test('un ajuste con otro tipo no se lee como si fuera el esperado', () => {
  // Si el backend cambiara `dominios` a `enum`, la pantalla dibujaria un selector sobre una lista
  // libre. Mejor tratarlo como ausente y avisar.
  const ajustes = {
    editable: { [AJUSTES_GOOGLE.dominios]: { group: 'acceso', type: 'enum', value: 'wiwo.me', options: [] } },
    readonly: {}
  }

  assert.equal(ajusteTexto(ajustes, AJUSTES_GOOGLE.dominios), '')
  assert.equal(tieneAjustesDeGoogle(ajustes), false)
})
