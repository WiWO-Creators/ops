/**
 * Pruebas del formulario de alta de una Licitacion.
 *
 * Una `clave` mal escrita no rompe nada visible: el formulario se dibuja igual y la API contesta un
 * 422 recien al guardar, cuando quien lo llenó ya perdió lo escrito. Por eso lo que se comprueba acá
 * son las claves y la forma del cuerpo, no como se ve.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDeLicitacion } from '../src/componentes/licitacion/campos.ts'
import { cuerpoDelFormulario, validarFormulario } from '../src/componentes/proyecto/formulario.ts'
import { MODELOS_DE_SERVICIO } from '../src/definiciones/licitaciones.ts'
import { EMPRESAS_DEL_HOLDING } from '../src/dominio/holding.ts'

const AREAS = [{ valor: '4', etiqueta: 'Contenidos' }]
const STAFF = [{ valor: '183', etiqueta: 'Dev Prueba' }, { valor: '12', etiqueta: 'Otra Persona' }]
const PROSPECTOS = [{ valor: '7', etiqueta: 'Colbún' }]

/** El campo con esa clave, o `undefined`. Evita repetir el `find` en cada prueba. */
function campo (campos, clave) {
  return campos.find((uno) => uno.clave === clave)
}

test('el holding tiene sus tres empresas en un solo lugar', () => {
  assert.deepEqual(EMPRESAS_DEL_HOLDING.map((una) => una.etiqueta), ['MGC', 'HL', 'Pacífico'])
  // Los codigos son claves, no texto: sin tildes y en minuscula, como los de los estados.
  for (const empresa of EMPRESAS_DEL_HOLDING) {
    assert.match(empresa.valor, /^[a-z]+$/)
  }
})

test('el selector de empresa del holding ofrece las tres, sin copiar la lista', () => {
  const empresa = campo(camposDeLicitacion(PROSPECTOS), 'empresa_holding')

  assert.equal(empresa.tipo, 'seleccion')
  assert.equal(empresa.opciones, EMPRESAS_DEL_HOLDING)
})

test('el area sale del catalogo que le pasan, como en Equipo y en Procesos', () => {
  const area = campo(camposDeLicitacion(PROSPECTOS, AREAS, STAFF), 'area_id')

  assert.equal(area.tipo, 'seleccion')
  assert.deepEqual(area.opciones, AREAS)
})

test('owner y focal son dos campos distintos, los dos sobre el staff', () => {
  const campos = camposDeLicitacion(PROSPECTOS, AREAS, STAFF)
  const owner = campo(campos, 'owner_id')
  const focal = campo(campos, 'focal_id')

  assert.notEqual(owner.clave, focal.clave)
  assert.notEqual(owner.etiqueta, focal.etiqueta)
  assert.deepEqual(owner.opciones, STAFF)
  assert.deepEqual(focal.opciones, STAFF)
})

test('la licitacion pregunta por el modelo de servicio y ya no por la facturacion', () => {
  const campos = camposDeLicitacion(PROSPECTOS)

  assert.equal(campo(campos, 'espacio.billing_type'), undefined)

  const modelo = campo(campos, 'modelo_servicio')

  assert.equal(modelo.etiqueta, 'Modelo de servicio')
  assert.equal(modelo.opciones, MODELOS_DE_SERVICIO)
})

test('el modelo de servicio cubre implementacion, mantencion y las dos juntas', () => {
  assert.deepEqual(
    MODELOS_DE_SERVICIO.map((uno) => uno.etiqueta),
    ['Implementación', 'Mantención', 'Implementación y mantención']
  )
})

test('la descripcion sigue siendo un area, que es lo que enciende el boton de IA', () => {
  const descripcion = campo(camposDeLicitacion(PROSPECTOS), 'espacio.description')

  assert.equal(descripcion.tipo, 'area')
  assert.notEqual(descripcion.sinAsistenteIa, true)
})

test('sin catalogos el formulario se arma igual, con los selectores vacios', () => {
  // Es el caso real: `FlujoLicitacion` lo monta con la lista de prospectos vacia.
  const campos = camposDeLicitacion([])

  assert.deepEqual(campo(campos, 'prospecto_id').opciones, [])
  assert.deepEqual(campo(campos, 'area_id').opciones, [])
  assert.deepEqual(campo(campos, 'owner_id').opciones, [])
  assert.deepEqual(campo(campos, 'focal_id').opciones, [])
})

test('el cuerpo separa lo propio de la licitacion de lo que va al Espacio', () => {
  const campos = camposDeLicitacion(PROSPECTOS, AREAS, STAFF)
  const cuerpo = cuerpoDelFormulario(campos, {
    prospecto_id: '7',
    empresa_holding: 'hl',
    area_id: '4',
    owner_id: '183',
    focal_id: '12',
    'espacio.name': 'Licitación Colbún 2026',
    'espacio.start_date': '2026-01-05',
    'espacio.deadline': '2026-03-31',
    modelo_servicio: 'implementacion_mantencion',
    'espacio.description': 'Propuesta de implementación y mantención.'
  })

  assert.deepEqual(cuerpo, {
    prospecto_id: 7,
    empresa_holding: 'hl',
    area_id: 4,
    owner_id: 183,
    focal_id: 12,
    modelo_servicio: 'implementacion_mantencion',
    espacio: {
      name: 'Licitación Colbún 2026',
      start_date: '2026-01-05',
      deadline: '2026-03-31',
      description: 'Propuesta de implementación y mantención.'
    }
  })
})

test('un alta vacia se detiene en los dos obligatorios, no en los campos nuevos', () => {
  const campos = camposDeLicitacion(PROSPECTOS, AREAS, STAFF)
  const errores = validarFormulario(campos, {})

  assert.deepEqual(Object.keys(errores).sort(), ['espacio.name', 'espacio.start_date', 'prospecto_id'])
})

test('una fecha a medio escribir se señala con el formato que se ve en pantalla', () => {
  const campos = camposDeLicitacion(PROSPECTOS)
  const errores = validarFormulario(campos, {
    prospecto_id: '7',
    'espacio.name': 'Algo',
    'espacio.start_date': '31/12/20'
  })

  assert.equal(errores['espacio.start_date'], 'Usa el formato DD/MM/AAAA.')
})
