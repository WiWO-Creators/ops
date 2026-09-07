/**
 * Pruebas de los campos personalizados de una entidad.
 *
 * Cubren lo que se rompe en silencio: un `required` que se vacia y se lleva un `422` con el numero
 * del campo por mensaje, un `multiselect` que viaja como cadena en vez de lista, un parche que manda
 * campos que nadie toco, y la fecha con hora que sale sin zona y la API rechaza.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alternarOpcion,
  camposOrdenados,
  cuerpoDeCamposPersonalizados,
  esEnlaceValido,
  esMultiple,
  esquemaDeCamposPersonalizados,
  fechaHoraParaApi,
  fechaHoraParaControl,
  lecturaDeCamposPersonalizados,
  valoresIniciales,
  valoresPorDefecto
} from '../src/dominio/campos-personalizados.ts'

/** "Area de la compañía": el campo real que motivo todo esto. */
const AREA = {
  id: 3,
  slug: 'tasks_area_de_la_compania',
  name: 'Area de la compañía',
  type: 'multiselect',
  options: ['PR', 'TechLab', 'Wiwo'],
  required: true,
  order: 0,
  default_value: '',
  only_admin: false,
  show_on_table: true
}

/** "Link de Drive": opcional, y el que la empresa quiere poder pegar a mano. */
const ENLACE = {
  id: 6,
  slug: 'tasks_link_de_drive',
  name: 'Link de Drive',
  type: 'link',
  options: null,
  required: false,
  order: 1,
  default_value: null,
  only_admin: false,
  show_on_table: true
}

const DEFINICIONES = [AREA, ENLACE]

test('los campos se ordenan por `order` y, a igualdad, por nombre', () => {
  const ordenados = camposOrdenados([
    { ...ENLACE, id: 9, name: 'Zeta', order: 5 },
    { ...ENLACE, id: 8, name: 'Alfa', order: 5 },
    AREA
  ])

  assert.deepEqual(ordenados.map((campo) => campo.name), ['Area de la compañía', 'Alfa', 'Zeta'])
})

test('`camposOrdenados` no muta la lista que recibe', () => {
  const original = [ENLACE, AREA]
  camposOrdenados(original)

  assert.equal(original[0].id, ENLACE.id)
})

test('multiselect y checkbox son los unicos multivalor', () => {
  assert.equal(esMultiple('multiselect'), true)
  assert.equal(esMultiple('checkbox'), true)
  assert.equal(esMultiple('select'), false)
  assert.equal(esMultiple('link'), false)
})

test('los valores iniciales completan todos los campos, tambien los que no vinieron', () => {
  const estado = valoresIniciales(DEFINICIONES, [
    { id: 3, slug: AREA.slug, name: AREA.name, type: 'multiselect', value: ['Wiwo', 'PR'] }
  ])

  // En el orden de las opciones, no en el de llegada: si no, guardar reordenaria el valor.
  assert.deepEqual(estado[3], ['PR', 'Wiwo'])
  assert.equal(estado[6], '')
})

test('una opcion que ya no existe en el catalogo se descarta al abrir', () => {
  const estado = valoresIniciales(DEFINICIONES, [
    { id: 3, slug: AREA.slug, name: AREA.name, type: 'multiselect', value: ['PR', 'Borrada'] }
  ])

  assert.deepEqual(estado[3], ['PR'])
})

test('el `default_value` de un multivalor llega separado por comas', () => {
  const estado = valoresPorDefecto([{ ...AREA, default_value: 'PR, Wiwo' }, ENLACE])

  assert.deepEqual(estado[3], ['PR', 'Wiwo'])
  assert.equal(estado[6], '')
})

test('alternar una opcion la agrega y la saca, siempre en el orden del catalogo', () => {
  assert.deepEqual(alternarOpcion(AREA, ['Wiwo'], 'PR'), ['PR', 'Wiwo'])
  assert.deepEqual(alternarOpcion(AREA, ['PR', 'Wiwo'], 'PR'), ['Wiwo'])
  assert.deepEqual(alternarOpcion(AREA, [], 'TechLab'), ['TechLab'])
})

test('vaciar un campo obligatorio da un error legible, no un 422', () => {
  const esquema = esquemaDeCamposPersonalizados(DEFINICIONES)

  assert.deepEqual(esquema.validar({ 3: [], 6: '' }), { 3: 'Falta completar este campo.' })
})

test('un campo opcional vacio no es un error', () => {
  const esquema = esquemaDeCamposPersonalizados(DEFINICIONES)

  assert.deepEqual(esquema.validar({ 3: ['PR'], 6: '' }), {})
})

test('un enlace tiene que ser abrible', () => {
  const esquema = esquemaDeCamposPersonalizados(DEFINICIONES)

  assert.deepEqual(esquema.validar({ 3: ['PR'], 6: 'https://drive.google.com/drive/folders/x' }), {})
  assert.equal(6 in esquema.validar({ 3: ['PR'], 6: 'drive.google.com/x' }), true)
  assert.equal(6 in esquema.validar({ 3: ['PR'], 6: 'ftp://interno/x' }), true)
})

test('`esEnlaceValido` acepta http y https y nada mas', () => {
  assert.equal(esEnlaceValido('http://wiwo.me'), true)
  assert.equal(esEnlaceValido('https://wiwo.me/a?b=1'), true)
  assert.equal(esEnlaceValido('javascript:alert(1)'), false)
  assert.equal(esEnlaceValido(''), false)
})

test('cada tipo valida con el mismo limite que la API', () => {
  const definiciones = [
    { ...ENLACE, id: 10, type: 'number', name: 'Horas' },
    { ...ENLACE, id: 11, type: 'colorpicker', name: 'Color' },
    { ...ENLACE, id: 12, type: 'date_picker', name: 'Dia' },
    { ...ENLACE, id: 13, type: 'date_picker_time', name: 'Momento' },
    { ...ENLACE, id: 14, type: 'select', name: 'Canal', options: ['A', 'B'] },
    { ...ENLACE, id: 15, type: 'input', name: 'Texto' }
  ]
  const esquema = esquemaDeCamposPersonalizados(definiciones)

  assert.deepEqual(
    esquema.validar({
      10: '3.5',
      11: '#a1b2c3',
      12: '2026-09-07',
      13: '2026-09-07T10:30',
      14: 'A',
      15: 'lo que sea'
    }),
    {}
  )

  const malos = esquema.validar({
    10: 'tres',
    11: 'rojo',
    12: '2026-02-31',
    13: 'ayer',
    14: 'C',
    15: 'x'.repeat(1001)
  })

  assert.deepEqual(Object.keys(malos).sort(), ['10', '11', '12', '13', '14', '15'])
})

test('el parche lleva solo lo que cambio', () => {
  const iniciales = { 3: ['PR'], 6: '' }
  const actuales = { 3: ['PR'], 6: 'https://drive.google.com/drive/folders/x' }

  assert.deepEqual(
    cuerpoDeCamposPersonalizados('tasks', 512, DEFINICIONES, iniciales, actuales),
    { for: 'tasks', rel_id: 512, values: { 6: 'https://drive.google.com/drive/folders/x' } }
  )
})

test('un formulario sin cambios no produce parche', () => {
  const iguales = { 3: ['PR', 'Wiwo'], 6: 'https://wiwo.me' }

  assert.equal(
    cuerpoDeCamposPersonalizados('tasks', 512, DEFINICIONES, iguales, { ...iguales, 3: ['PR', 'Wiwo'] }),
    null
  )
})

test('vaciar un campo viaja como `null`, que es como borra la API', () => {
  const parche = cuerpoDeCamposPersonalizados(
    'tasks', 512, DEFINICIONES, { 3: ['PR'], 6: 'https://wiwo.me' }, { 3: ['PR'], 6: '  ' }
  )

  assert.deepEqual(parche, { for: 'tasks', rel_id: 512, values: { 6: null } })
})

test('la fecha con hora viaja con zona: sin ella la API responde 422', () => {
  const iso = fechaHoraParaApi('2026-09-07T10:30')

  assert.equal(typeof iso, 'string')
  assert.equal(iso.endsWith('Z'), true)
  // Se interpreto como hora local, que es lo que escribio la persona.
  assert.equal(new Date(iso).getHours(), 10)
  assert.equal(new Date(iso).getMinutes(), 30)
  assert.equal(fechaHoraParaApi('cualquier cosa'), null)
})

test('la fecha con hora vuelve al control sin cambiar de zona', () => {
  assert.equal(fechaHoraParaControl('2026-09-07 10:30:00'), '2026-09-07T10:30')
  assert.equal(fechaHoraParaControl('2026-09-07T10:30:00'), '2026-09-07T10:30')
  assert.equal(fechaHoraParaControl('no es una fecha'), '')
})

test('el cuerpo de lectura no escribe nada', () => {
  assert.deepEqual(lecturaDeCamposPersonalizados('tasks', 512), {
    for: 'tasks',
    rel_id: 512,
    values: {}
  })
})
