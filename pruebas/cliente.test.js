/**
 * Logica del detalle de Cliente.
 *
 * Lo que se prueba aca es lo que la pantalla no puede mostrar mal: un sitio web sin esquema que
 * termina en un enlace roto dentro del propio panel, una direccion que se pinta con renglones vacios,
 * el contacto primario perdido entre los demas, y sobre todo la moneda — porque `default_currency: 0`
 * no es "sin moneda", es la moneda base de la instalacion, y confundirlas es decirle a alguien que no
 * se sabe con que se le cobra a un cliente.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  direccionPrincipal,
  direccionSecundaria,
  enlaceDeSitio,
  lineasDeDireccion,
  monedaDelCliente,
  nombreDeIdioma,
  nombreDePais,
  ordenarContactos,
  preferencias
} from '../src/componentes/cliente/cliente.ts'

const SIN_DIRECCION = { street: null, city: null, state: null, zip: null, country_id: 0 }
const PAISES = [{ id: 45, name: 'Chile' }, { id: 11, name: 'Argentina' }]
const MONEDAS = [
  { id: 1, name: 'USD', symbol: '$', is_default: true },
  { id: 3, name: 'CLP', symbol: '$', is_default: false }
]

/** Cliente minimo con los campos que las funciones tocan. */
function cliente (extra = {}) {
  return {
    id: 113,
    company: 'Anker',
    vat: null,
    phonenumber: null,
    city: null,
    state: null,
    zip: null,
    address: null,
    country_id: 0,
    website: null,
    active: true,
    default_currency: 0,
    default_language: null,
    datecreated: '2026-03-27T19:23:29Z',
    lead_id: null,
    billing: { ...SIN_DIRECCION },
    shipping: { ...SIN_DIRECCION },
    tags: [],
    ...extra
  }
}

test('enlaceDeSitio agrega el esquema que Perfex no guarda', () => {
  assert.equal(enlaceDeSitio('www.abastible.cl'), 'https://www.abastible.cl/')
  assert.equal(enlaceDeSitio('https://www.americanbritish.cl/'), 'https://www.americanbritish.cl/')
})

test('enlaceDeSitio devuelve null cuando no hay una URL', () => {
  assert.equal(enlaceDeSitio(null), null)
  assert.equal(enlaceDeSitio('   '), null)
  assert.equal(enlaceDeSitio('javascript:alert(1)'), null)
})

test('nombreDePais: el 0 es "sin pais", no un id huerfano', () => {
  assert.equal(nombreDePais(PAISES, 0), null)
  assert.equal(nombreDePais(PAISES, 45), 'Chile')
})

test('nombreDePais no inventa un nombre para un id que el catalogo no conoce', () => {
  assert.equal(nombreDePais(PAISES, 999), null)
})

test('lineasDeDireccion saltea lo que no vino', () => {
  const partes = { calle: 'Walker Martínez 2972', ciudad: 'La Florida', estado: null, codigoPostal: null, pais: null }

  assert.deepEqual(lineasDeDireccion(partes), ['Walker Martínez 2972', 'La Florida'])
})

test('lineasDeDireccion no devuelve nada cuando la direccion esta vacia', () => {
  assert.deepEqual(lineasDeDireccion(direccionPrincipal(cliente(), PAISES)), [])
  assert.deepEqual(lineasDeDireccion(direccionSecundaria(cliente().billing, PAISES)), [])
  assert.deepEqual(lineasDeDireccion(direccionSecundaria(cliente().shipping, PAISES)), [])
})

test('direccionSecundaria lee facturacion y envio con la misma forma', () => {
  const c = cliente({
    billing: { street: 'Av. Uno 1', city: 'Santiago', state: null, zip: null, country_id: 45 },
    shipping: { street: 'Bodega 7', city: null, state: null, zip: '8320000', country_id: 11 }
  })

  assert.deepEqual(lineasDeDireccion(direccionSecundaria(c.billing, PAISES)), ['Av. Uno 1', 'Santiago', 'Chile'])
  assert.deepEqual(lineasDeDireccion(direccionSecundaria(c.shipping, PAISES)), ['Bodega 7', '8320000', 'Argentina'])
})

test('monedaDelCliente: el 0 cae en la moneda base, no en null', () => {
  assert.equal(monedaDelCliente(MONEDAS, 0)?.name, 'USD')
  assert.equal(monedaDelCliente(MONEDAS, 3)?.name, 'CLP')
})

test('monedaDelCliente devuelve null si el catalogo no alcanza', () => {
  assert.equal(monedaDelCliente([], 0), null)
  assert.equal(monedaDelCliente(MONEDAS, 99), null)
})

test('preferencias marca la moneda heredada para no hacerla pasar por elegida', () => {
  assert.deepEqual(preferencias(cliente(), MONEDAS), [
    { etiqueta: 'Moneda', valor: 'USD $ (la del sistema)' }
  ])
  assert.deepEqual(preferencias(cliente({ default_currency: 3, default_language: 'spanish' }), MONEDAS), [
    { etiqueta: 'Moneda', valor: 'CLP $' },
    { etiqueta: 'Idioma', valor: 'Español' }
  ])
})

test('ordenarContactos pone el primario arriba y no muta la lista original', () => {
  const original = [
    { id: 2, full_name: 'Zoe Ruiz', email: 'z@x.cl', phonenumber: null, title: null, is_primary: false },
    { id: 3, full_name: 'Ana Paz', email: 'a@x.cl', phonenumber: null, title: null, is_primary: false },
    { id: 1, full_name: 'Beto Lima', email: 'b@x.cl', phonenumber: null, title: null, is_primary: true }
  ]

  assert.deepEqual(ordenarContactos(original).map((c) => c.id), [1, 3, 2])
  assert.deepEqual(original.map((c) => c.id), [2, 3, 1])
})

test('ordenarContactos tolera que no se haya pedido el include', () => {
  assert.deepEqual(ordenarContactos(undefined), [])
})

test('nombreDeIdioma traduce lo conocido y capitaliza lo demas', () => {
  assert.equal(nombreDeIdioma('spanish'), 'Español')
  assert.equal(nombreDeIdioma('swedish'), 'Swedish')
  assert.equal(nombreDeIdioma(null), null)
  assert.equal(nombreDeIdioma(''), null)
})
