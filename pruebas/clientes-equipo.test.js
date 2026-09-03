/**
 * Formularios de Cliente y de Equipo: lo que se manda y lo que se siembra.
 *
 * Las tres cuentas que hace el frontend aca son las que rompen en silencio:
 *
 *  - una clave con puntos (`billing.street`) tiene que llegar anidada, o la API guarda la direccion
 *    de facturacion en ningun lado y devuelve 422 por un campo que no existe;
 *  - la contraseña vacia de una edicion NO tiene que viajar, o «no la cambies» se convierte en un
 *    intento de borrarla;
 *  - el id de un `seleccion` tiene que viajar como numero, porque el contrato pide `country_id` y no
 *    `"45"`.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuerpoDelFormulario,
  valoresIniciales
} from '../src/componentes/proyecto/formulario.ts'
import { camposDeCliente } from '../src/componentes/cliente/campos.ts'
import { camposDePersona } from '../src/componentes/equipo/campos.ts'

const PAISES = [{ valor: '45', etiqueta: 'Chile' }, { valor: '1', etiqueta: 'Argentina' }]
const MONEDAS = [{ valor: '1', etiqueta: 'CLP' }]
const ROLES = [{ valor: '2', etiqueta: 'Consultor/Director' }]
const CARGOS = [{ valor: '1', etiqueta: 'Director' }, { valor: '2', etiqueta: 'Staff' }]
const AREAS = [{ valor: '1', etiqueta: 'Operaciones' }]

const CLIENTE = {
  id: 7,
  company: 'Panadería del Sur',
  vat: '76.111.222-3',
  phonenumber: null,
  city: 'Santiago',
  state: null,
  zip: null,
  address: null,
  country_id: 45,
  website: null,
  active: true,
  default_currency: 1,
  billing: { street: 'Av. Siempreviva 742', city: 'Santiago', state: null, zip: null, country_id: 45 },
  shipping: { street: null, city: null, state: null, zip: null, country_id: 0 }
}

test('las direcciones anidadas del cliente se siembran desde el registro', () => {
  const valores = valoresIniciales(camposDeCliente(PAISES, MONEDAS), CLIENTE)

  assert.equal(valores['billing.street'], 'Av. Siempreviva 742')
  assert.equal(valores['billing.country_id'], '45', 'el id viaja como cadena: es lo que entiende un select')
  assert.equal(valores['shipping.street'], '', 'un nulo del registro se siembra vacio, no como «null»')
})

test('las claves con puntos vuelven anidadas al cuerpo', () => {
  const campos = camposDeCliente(PAISES, MONEDAS)
  const cuerpo = cuerpoDelFormulario(campos, valoresIniciales(campos, CLIENTE))

  assert.deepEqual(cuerpo.billing, {
    street: 'Av. Siempreviva 742',
    city: 'Santiago',
    state: null,
    zip: null,
    country_id: 45
  })
  assert.equal(cuerpo['billing.street'], undefined, 'la clave plana no debe quedar suelta en el cuerpo')
})

test('un id de seleccion viaja como numero y no como cadena', () => {
  const campos = camposDeCliente(PAISES, MONEDAS)
  const cuerpo = cuerpoDelFormulario(campos, valoresIniciales(campos, CLIENTE))

  assert.equal(cuerpo.country_id, 45)
  assert.equal(cuerpo.default_currency, 1)
})

test('en una edicion, la contraseña en blanco no viaja', () => {
  const campos = camposDePersona(ROLES, CARGOS, AREAS, false)
  const valores = valoresIniciales(campos, { firstname: 'Ana', lastname: 'Soto', email: 'ana@wiwo.me' })
  const cuerpo = cuerpoDelFormulario(campos, valores)

  assert.ok(!('password' in cuerpo), 'mandar null seria un intento de borrar la contraseña')
  assert.equal(cuerpo.firstname, 'Ana')
})

test('en un alta, la contraseña es un campo obligatorio y si viaja', () => {
  const campos = camposDePersona(ROLES, CARGOS, AREAS, true)
  const clave = campos.find((campo) => campo.clave === 'password')

  assert.equal(clave.requerido, true)
  assert.notEqual(clave.omitirSiVacio, true)

  const cuerpo = cuerpoDelFormulario(campos, {
    firstname: 'Ana', lastname: 'Soto', email: 'ana@wiwo.me', password: 'Prueba123!',
    phonenumber: '', role_id: '2', hourly_rate: ''
  })

  assert.equal(cuerpo.password, 'Prueba123!')
  assert.equal(cuerpo.role_id, 2)
})

test('los campos del cliente no prometen nada que la API no escriba', () => {
  const claves = camposDeCliente(PAISES, MONEDAS).map((campo) => campo.clave)

  for (const prohibida of ['tags', 'groups', 'id', 'datecreated', 'lead_id']) {
    assert.ok(!claves.includes(prohibida), `${prohibida} no es escribible en el contrato`)
  }
})

test('los campos de una persona no incluyen la condicion de administrador', () => {
  const claves = camposDePersona(ROLES, CARGOS, AREAS, true).map((campo) => campo.clave)

  // La API la rechaza salvo que quien escribe ya sea admin: ofrecerla en el formulario a cualquiera
  // con `staff.create` seria ofrecer un 422.
  assert.ok(!claves.includes('is_admin'))
})
