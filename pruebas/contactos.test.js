/**
 * Pruebas de la pestaña Contactos.
 *
 * Cubren las dos cosas que se rompen sin dar error: el orden de la lista —un contacto dado de baja
 * arriba de todo, o el principal perdido en el medio— y la forma del cuerpo que viaja a la API,
 * donde un `""` en vez de `null` se guarda como un dato en blanco que parece cargado.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisosTodos, cuantosActivos, cuerpoDeContacto, ordenarContactosCompletos, revisarContacto,
  AVISOS_DE_CONTACTO, PERMISOS_PORTAL
} from '../src/dominio/contactos.ts'

/** Contacto minimo, con lo que el orden necesita. */
const contacto = (id, full_name, { is_primary = false, active = true } = {}) => ({
  id, full_name, is_primary, active
})

test('el principal va primero, despues los activos, despues por nombre', () => {
  const lista = [
    contacto(1, 'Zoe Vera'),
    contacto(2, 'Ana Rios', { active: false }),
    contacto(3, 'Beto Lago'),
    contacto(4, 'Carla Paz', { is_primary: true, active: false })
  ]

  // El principal manda aunque este de baja: sigue siendo el contacto principal del cliente.
  assert.deepEqual(ordenarContactosCompletos(lista).map((c) => c.id), [4, 3, 1, 2])
})

test('ordenar no muta la lista original', () => {
  const original = [contacto(1, 'Zoe'), contacto(2, 'Ana', { is_primary: true })]
  ordenarContactosCompletos(original)

  assert.deepEqual(original.map((c) => c.id), [1, 2])
})

test('cuantosActivos ignora a los dados de baja', () => {
  assert.equal(cuantosActivos([contacto(1, 'A'), contacto(2, 'B', { active: false })]), 1)
  assert.equal(cuantosActivos([]), 0)
})

test('revisarContacto bloquea lo que la API tambien rechazaria', () => {
  const base = { firstname: 'Ana', lastname: 'Rios', email: 'ana@cliente.cl', phonenumber: '', title: '', password: '' }

  assert.deepEqual(revisarContacto(base), {})
  assert.ok(revisarContacto({ ...base, firstname: '  ' }).firstname)
  assert.ok(revisarContacto({ ...base, lastname: '' }).lastname)
  assert.ok(revisarContacto({ ...base, email: '' }).email)
  assert.ok(revisarContacto({ ...base, email: 'no-es-mail' }).email)
})

test('la contraseña vacia no es un error: significa "no la cambies"', () => {
  const base = { firstname: 'Ana', lastname: 'Rios', email: 'ana@cliente.cl', phonenumber: '', title: '', password: '' }

  assert.equal(revisarContacto(base).password, undefined)
  assert.ok(revisarContacto({ ...base, password: 'corta' }).password)
  assert.ok(revisarContacto({ ...base, password: 'x'.repeat(73) }).password)
  assert.equal(revisarContacto({ ...base, password: 'Prueba123!' }).password, undefined)
})

test('los campos opcionales vacios viajan como null, no como cadena vacia', () => {
  const cuerpo = cuerpoDeContacto(
    { firstname: ' Ana ', lastname: 'Rios', email: ' ANA@Cliente.CL ', phonenumber: '  ', title: '', password: '' },
    ['invoices'],
    avisosTodos(false)
  )

  assert.equal(cuerpo.firstname, 'Ana')
  assert.equal(cuerpo.email, 'ana@cliente.cl')
  assert.equal(cuerpo.phonenumber, null)
  assert.equal(cuerpo.title, null)
  // Sin contraseña escrita la clave ni siquiera viaja: mandarla vacia le pediria a la API que decida
  // algo que nadie pidio.
  assert.equal('password' in cuerpo, false)
  assert.deepEqual(cuerpo.permissions, ['invoices'])
})

test('la contraseña escrita viaja tal cual', () => {
  const cuerpo = cuerpoDeContacto(
    { firstname: 'Ana', lastname: 'Rios', email: 'ana@cliente.cl', phonenumber: '', title: '', password: 'Prueba123!' },
    [],
    avisosTodos(true)
  )

  assert.equal(cuerpo.password, 'Prueba123!')
})

test('avisosTodos cubre las siete banderas', () => {
  const puestos = avisosTodos(true)

  assert.equal(Object.keys(puestos).length, 7)
  assert.ok(Object.values(puestos).every((v) => v === true))
  assert.ok(Object.values(avisosTodos(false)).every((v) => v === false))
})

test('los catalogos tienen las claves que espera la API', () => {
  assert.deepEqual(
    PERMISOS_PORTAL.map((p) => p.clave),
    ['invoices', 'estimates', 'contracts', 'proposals', 'support', 'projects']
  )
  assert.deepEqual(AVISOS_DE_CONTACTO.map((a) => a.clave), Object.keys(avisosTodos(true)))
})
