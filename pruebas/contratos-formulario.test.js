/**
 * Pruebas de los formularios de Contratos (WIW-0502).
 *
 * Una clave mal escrita no rompe nada visible: la API contesta 422 recien al guardar. Se comprueban
 * las claves contra `Escritura\Contrato::CAMPOS`, el ida y vuelta de un registro y el cuerpo del
 * dialogo de acceso.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  camposDeAcceso,
  camposDeContrato,
  errorDelValor,
  registroDeAcceso,
  registroDeContrato
} from '../src/componentes/contrato/campos.ts'
import { cuerpoDelFormulario, validarFormulario, valoresIniciales } from '../src/componentes/proyecto/formulario.ts'

const CLAVES_DE_LA_API = [
  'subject', 'client_id', 'contract_type_id', 'project_id', 'datestart', 'dateend',
  'contract_value', 'description', 'signed', 'visible_to_client'
]

const CONTRATO = {
  id: 7,
  subject: 'Fee anual',
  description: 'Cuatro piezas al mes',
  client_id: 10,
  client: { id: 10, company: 'Accor', image_url: null },
  contract_type: { id: 1, name: 'Contrato Anual' },
  project: null,
  datestart: '2027-01-01',
  dateend: null,
  contract_value: 1500000,
  signed: true,
  visible_to_client: false,
  trash: false,
  addedfrom: null,
  dateadded: null
}

test('todas las claves del formulario las acepta la API', () => {
  for (const campo of camposDeContrato([], [])) {
    assert.ok(CLAVES_DE_LA_API.includes(campo.clave), campo.clave)
  }
})

test('editar sin tocar nada manda el mismo contrato, con los opcionales vacios en null', () => {
  const campos = camposDeContrato([{ valor: '10', etiqueta: 'Accor' }], [{ valor: '1', etiqueta: 'Anual' }])
  const cuerpo = cuerpoDelFormulario(campos, valoresIniciales(campos, registroDeContrato(CONTRATO)))

  assert.deepEqual(cuerpo, {
    subject: 'Fee anual',
    client_id: 10,
    contract_type_id: 1,
    contract_value: 1500000,
    datestart: '2027-01-01',
    dateend: null,
    description: 'Cuatro piezas al mes',
    signed: true,
    visible_to_client: false
  })
})

test('el alta exige asunto, cliente e inicio', () => {
  const campos = camposDeContrato([], [])
  const errores = validarFormulario(campos, valoresIniciales(campos, null))

  assert.deepEqual(Object.keys(errores).sort(), ['client_id', 'datestart', 'subject'])
})

test('el valor no puede ser negativo', () => {
  assert.equal(errorDelValor('-1'), 'No puede ser negativo.')
  assert.equal(errorDelValor('0'), null)
})

test('el dialogo de acceso manda ids numericos y el interruptor', () => {
  const campos = camposDeAcceso([{ valor: '1', etiqueta: 'Finanzas' }, { valor: '2', etiqueta: 'Comercial' }])
  const registro = registroDeAcceso({ areas: [{ id: 2, name: 'Comercial' }], admin: false })

  assert.deepEqual(cuerpoDelFormulario(campos, valoresIniciales(campos, registro)), { area_ids: [2], admin: false })
  assert.deepEqual(
    cuerpoDelFormulario(campos, valoresIniciales(campos, registroDeAcceso({ areas: [], admin: true }))),
    { area_ids: [], admin: true }
  )
})
