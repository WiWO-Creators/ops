/**
 * Pruebas de los formularios de Upsell.
 *
 * Una `clave` mal escrita no rompe nada visible: el formulario se dibuja igual y la API contesta un
 * 422 recien al guardar. Por eso lo que se comprueba acá son las claves, las reglas y la forma de los
 * dos cuerpos de la edicion, no como se ve.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDeEdicionDeUpsell, camposDeUpsell, partirEdicionDeUpsell } from '../src/componentes/upsell/campos.ts'
import { cuerpoDelFormulario, validarFormulario, valoresIniciales } from '../src/componentes/proyecto/formulario.ts'

const MONEDAS = [{ valor: '1', etiqueta: 'CLP' }, { valor: '2', etiqueta: 'USD' }]

const REGISTRO = {
  monto_estimado: 1500000,
  moneda_id: 1,
  probabilidad: 40,
  motivo: null,
  espacio: { name: 'Rediseño web', start_date: '2026-09-01', deadline: null, estimated_hours: 20, description: 'Texto' }
}

test('la edicion junta el Espacio, la oportunidad y el seguimiento', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, true)

  assert.deepEqual(campos.map((uno) => uno.clave), [
    'espacio.name', 'espacio.start_date', 'espacio.deadline', 'espacio.estimated_hours', 'espacio.description',
    'monto_estimado', 'moneda_id', 'probabilidad',
    'motivo'
  ])
  assert.deepEqual(campos.filter((uno) => uno.seccion !== undefined).map((uno) => uno.clave),
    ['espacio.name', 'monto_estimado', 'motivo'])
  assert.equal(campos.some((uno) => uno.clave === 'espacio.clientid' || uno.clave === 'espacio.billing_type'), false,
    'El cliente y la facturacion no se editan: PATCH /projects los rechaza')
})

test('con el Espacio archivado solo se ofrece lo propio', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, false)

  assert.deepEqual(campos.map((uno) => uno.clave), ['monto_estimado', 'moneda_id', 'probabilidad', 'motivo'])
  assert.equal(campos[0].seccion, 'Oportunidad')
})

test('la edicion toma del alta las mismas reglas del nombre y las fechas', () => {
  const edicion = camposDeEdicionDeUpsell(MONEDAS, true)
  const alta = camposDeUpsell([], MONEDAS)

  for (const clave of ['espacio.name', 'espacio.start_date', 'espacio.deadline', 'monto_estimado', 'probabilidad']) {
    const { seccion: _a, ...enEdicion } = edicion.find((uno) => uno.clave === clave)
    const { seccion: _b, ...enAlta } = alta.find((uno) => uno.clave === clave)

    assert.deepEqual(enEdicion, enAlta, clave)
  }
})

test('las reglas de los numeros son las de la API', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, true)
  const base = { 'espacio.name': 'Algo', 'espacio.start_date': '2026-09-01' }
  const errores = (valores) => validarFormulario(campos, { ...base, ...valores })

  assert.match(errores({ monto_estimado: '-1' }).monto_estimado, /negativo/)
  assert.match(errores({ probabilidad: '101' }).probabilidad, /0 y 100/)
  assert.match(errores({ probabilidad: '-5' }).probabilidad, /0 y 100/)
  assert.match(errores({ probabilidad: '12.5' }).probabilidad, /entero/)
  assert.match(errores({ probabilidad: 'mucho' }).probabilidad, /número/)
  assert.match(errores({ 'espacio.estimated_hours': '-3' })['espacio.estimated_hours'], /negativas/)
  assert.match(errores({ motivo: 'x'.repeat(256) }).motivo, /255/)
  assert.deepEqual(errores({ monto_estimado: '0', probabilidad: '100', 'espacio.estimated_hours': '0' }), {})
  assert.deepEqual(errores({ monto_estimado: '', probabilidad: '', motivo: '' }), {})
})

test('el nombre y el inicio del Espacio son obligatorios', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, true)
  const errores = validarFormulario(campos, { 'espacio.name': '  ', 'espacio.start_date': '' })

  assert.equal(errores['espacio.name'], 'Este campo es obligatorio.')
  assert.equal(errores['espacio.start_date'], 'Este campo es obligatorio.')
})

test('sin cambios no viaja nada', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, true)
  const inicial = cuerpoDelFormulario(campos, valoresIniciales(campos, REGISTRO))

  assert.deepEqual(partirEdicionDeUpsell(inicial, inicial), { propios: null, espacio: null })
})

test('la edicion manda a cada ruta solo lo que cambio', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, true)
  const inicial = cuerpoDelFormulario(campos, valoresIniciales(campos, REGISTRO))
  const valores = {
    ...valoresIniciales(campos, REGISTRO),
    'espacio.name': 'Rediseño web y app',
    'espacio.estimated_hours': '35',
    moneda_id: '2',
    probabilidad: '70'
  }

  assert.deepEqual(partirEdicionDeUpsell(cuerpoDelFormulario(campos, valores), inicial), {
    propios: { moneda_id: 2, probabilidad: 70 },
    espacio: { name: 'Rediseño web y app', estimated_hours: 35 }
  })
})

test('la edicion vacia un campo con null', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, true)
  const registro = { ...REGISTRO, motivo: 'Precio' }
  const inicial = cuerpoDelFormulario(campos, valoresIniciales(campos, registro))
  const valores = { ...valoresIniciales(campos, registro), monto_estimado: '', motivo: '', 'espacio.deadline': '' }

  assert.deepEqual(partirEdicionDeUpsell(cuerpoDelFormulario(campos, valores), inicial), {
    propios: { monto_estimado: null, motivo: null },
    espacio: null
  })
})

test('con el Espacio archivado nunca viaja un parche al Espacio', () => {
  const campos = camposDeEdicionDeUpsell(MONEDAS, false)
  const inicial = cuerpoDelFormulario(campos, valoresIniciales(campos, REGISTRO))
  const valores = { ...valoresIniciales(campos, REGISTRO), probabilidad: '0' }

  assert.deepEqual(partirEdicionDeUpsell(cuerpoDelFormulario(campos, valores), inicial), {
    propios: { probabilidad: 0 },
    espacio: null
  })
})
