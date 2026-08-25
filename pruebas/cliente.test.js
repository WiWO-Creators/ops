/**
 * Logica del detalle de Cliente.
 *
 * Lo que se prueba aca es lo que la pantalla no puede mostrar mal: un sitio web sin esquema que
 * termina en un enlace roto dentro del propio panel, una direccion que se pinta con renglones vacios,
 * y el contacto primario perdido entre los demas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  direccionDeFacturacion,
  direccionPrincipal,
  enlaceDeSitio,
  lineasDeDireccion,
  nombreDeIdioma,
  ordenarContactos,
  preferencias
} from '../src/componentes/cliente/cliente.ts'

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
    billing: { street: null, city: null, state: null, zip: null, country_id: 0 },
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

test('lineasDeDireccion saltea lo que no vino', () => {
  const partes = { calle: 'Walker Martínez 2972', ciudad: 'La Florida', estado: null, codigoPostal: null, paisId: 0 }

  assert.deepEqual(lineasDeDireccion(partes), ['Walker Martínez 2972', 'La Florida'])
})

test('lineasDeDireccion no devuelve nada cuando la direccion esta vacia', () => {
  assert.deepEqual(lineasDeDireccion(direccionPrincipal(cliente())), [])
  assert.deepEqual(lineasDeDireccion(direccionDeFacturacion(cliente())), [])
})

test('lineasDeDireccion muestra el pais como codigo, sin adivinar el nombre', () => {
  const lineas = lineasDeDireccion(direccionDeFacturacion(cliente({
    billing: { street: null, city: null, state: null, zip: null, country_id: 45 }
  })))

  assert.deepEqual(lineas, ['País (código 45)'])
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

test('preferencias omite lo predeterminado del sistema', () => {
  assert.deepEqual(preferencias(cliente()), [])
  assert.deepEqual(
    preferencias(cliente({ default_currency: 4, default_language: 'spanish' })),
    [{ etiqueta: 'Moneda', valor: 'Código 4' }, { etiqueta: 'Idioma', valor: 'Español' }]
  )
})
