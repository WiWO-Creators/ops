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
  camposLegibles,
  camposOrdenados,
  cuerpoDeCamposPersonalizados,
  enlaceSinMarcado,
  enlaceConApodo,
  esValorEnlace,
  valorVacio,
  estaVacio,
  esEnlaceValido,
  esMultiple,
  esquemaDeCamposPersonalizados,
  fechaHoraParaApi,
  fechaHoraParaControl,
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
  assert.deepEqual(estado[6], { url: '', apodo_link: '' })
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
  assert.deepEqual(estado[6], { url: '', apodo_link: '' })
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

test('un valor heredado que nadie toco no bloquea el guardado', () => {
  const esquema = esquemaDeCamposPersonalizados(DEFINICIONES)
  // 513 valores de la base son marcado del panel viejo, no una URL: validarlos sin que nadie los
  // haya tocado dejaria esas Tareas sin poder guardar ni el nombre.
  const iniciales = { 3: ['PR'], 6: '<a href="https://drive.google.com/x">Carpeta</a>' }

  assert.deepEqual(esquema.validar(iniciales, iniciales), {})
  assert.equal(6 in esquema.validar({ ...iniciales, 6: 'roto' }, iniciales), true)
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

test('un enlace guardado como marcado por el panel viejo se desenvuelve', () => {
  assert.equal(
    enlaceSinMarcado('<a href="https://drive.google.com/drive/folders/x?usp=sharing" target="_blank">Carpeta </a>'),
    'https://drive.google.com/drive/folders/x?usp=sharing'
  )
  assert.equal(enlaceSinMarcado('https://wiwo.me'), 'https://wiwo.me')
  assert.equal(enlaceSinMarcado(''), '')
})

test('el valor heredado llega al formulario como URL editable', () => {
  const estado = valoresIniciales(DEFINICIONES, [
    {
      id: 6,
      slug: ENLACE.slug,
      name: ENLACE.name,
      type: 'link',
      value: '<a href="https://drive.google.com/y" target="_blank">Presentación</a>'
    }
  ])

  assert.deepEqual(estado[6], { url: 'https://drive.google.com/y', apodo_link: 'Presentación' })
})

test('enlaces antiguos conservan parámetros escapados y aceptan marcado multilínea', () => {
  assert.equal(enlaceSinMarcado('<a href = "https://drive.google.com/x?a=1&amp;b=2&#35;archivo">\nCarpeta\n</a>'), 'https://drive.google.com/x?a=1&b=2#archivo')
  assert.equal(enlaceSinMarcado('<a href=https://wiwo.me/x>Enlace</a>'), 'https://wiwo.me/x')
  const [campo] = camposLegibles([{ id: 1, name: 'Link', slug: 'link', type: 'link', value: '<a href="javascript&#58;alert(1)">No abrir</a>' }])
  assert.equal(campo.enlace, null)
  assert.equal(enlaceSinMarcado('<a sin href>Roto</a>'), '<a sin href>Roto</a>')
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

test('la ficha lee el area como lista y el enlace heredado como URL limpia', () => {
  const leidos = camposLegibles([
    { id: 3, slug: 'tasks_area', name: 'Área de la compañía', type: 'multiselect', value: ['TechLab', 'Digital Creators'] },
    { id: 7, slug: 'tasks_drive', name: 'Link de Drive', type: 'link', value: '<a href="https://drive.google.com/d/1" target="_blank">Carpeta</a>' }
  ])

  assert.deepEqual(leidos, [
    { id: 3, nombre: 'Área de la compañía', texto: 'TechLab, Digital Creators', enlace: null },
    { id: 7, nombre: 'Link de Drive', texto: 'Carpeta', enlace: 'https://drive.google.com/d/1' }
  ])
})

test('la ficha no pinta filas vacias ni convierte en enlace lo que no se puede abrir', () => {
  const leidos = camposLegibles([
    { id: 1, slug: 'tasks_vacio', name: 'Vacío', type: 'input', value: '' },
    { id: 2, slug: 'tasks_nulo', name: 'Nulo', type: 'input', value: null },
    { id: 3, slug: 'tasks_area', name: 'Área', type: 'multiselect', value: [] },
    { id: 4, slug: 'tasks_espacios', name: 'Espacios', type: 'textarea', value: '   ' },
    { id: 5, slug: 'tasks_drive', name: 'Link de Drive', type: 'link', value: 'javascript:alert(1)' }
  ])

  assert.deepEqual(leidos, [
    { id: 5, nombre: 'Link de Drive', texto: 'Enlace no válido', enlace: null }
  ])
})

test('la ficha respeta el orden en que la API devolvio los campos', () => {
  const leidos = camposLegibles([
    { id: 9, slug: 'tasks_b', name: 'B', type: 'input', value: 'segundo por nombre' },
    { id: 1, slug: 'tasks_a', name: 'A', type: 'input', value: 'primero por nombre' }
  ])

  assert.deepEqual(leidos.map((campo) => campo.nombre), ['B', 'A'])
})


test('apodos se leen como texto, decodifican unicode y no ejecutan marcado', () => {
  assert.deepEqual(enlaceConApodo('<a href="https://wiwo.me?a=1&amp;b=2"><b>Diseño</b> &amp; &#x1F4C1;</a>'), {
    url: 'https://wiwo.me?a=1&b=2', apodo_link: 'Diseño & 📁'
  })
  assert.deepEqual(enlaceConApodo('https://wiwo.me'), { url: 'https://wiwo.me', apodo_link: '' })
  assert.deepEqual(enlaceConApodo('<a href="https://wiwo.me">&lt;script&gt;alert(1)&lt;/script&gt;</a>'), {
    url: 'https://wiwo.me', apodo_link: '<script>alert(1)</script>'
  })
  for (const value of ['javascript:alert(1)', '<a href="javascript&#58;alert(1)">Abrir</a>', '<a roto>' + 'x'.repeat(3000)]) {
    assert.deepEqual(camposLegibles([{ ...ENLACE, value }]), [{ id: 6, nombre: ENLACE.name, texto: 'Enlace no válido', enlace: null }])
  }
  assert.equal(camposLegibles([{ ...ENLACE, value: 'https://wiwo.me' }])[0].texto, 'Abrir enlace')
})

test('editar solo apodo o URL preserva la otra parte, y borrar ambas envía null', () => {
  const inicial = valoresIniciales([ENLACE], [{ ...ENLACE, value: '<a href="https://wiwo.me">Diseño</a>' }])
  const parche = (valor) => cuerpoDeCamposPersonalizados('tasks', 7, [ENLACE], inicial, { 6: valor })
  assert.equal(parche({ ...inicial[6] }), null)
  assert.equal(parche({ url: ' https://wiwo.me ', apodo_link: ' Diseño ' }), null)
  assert.deepEqual(parche({ ...inicial[6], apodo_link: 'Manual' }).values[6], { url: 'https://wiwo.me', apodo_link: 'Manual' })
  assert.deepEqual(parche({ ...inicial[6], url: 'https://wiwo.me/nueva' }).values[6], { url: 'https://wiwo.me/nueva', apodo_link: 'Diseño' })
  assert.equal(parche({ ...inicial[6], apodo_link: '' }).values[6], 'https://wiwo.me')
  assert.equal(parche(valorVacio(ENLACE)).values[6], null)
  assert.equal(esValorEnlace(inicial[6]), true)
  assert.equal(esValorEnlace([]), false)
  assert.equal(estaVacio({ url: '', apodo_link: 'Falta URL' }), false)
})

test('apodo exige URL segura y respeta límites incluyendo unicode', () => {
  const esquema = esquemaDeCamposPersonalizados([ENLACE])
  for (const valor of [
    { url: '', apodo_link: 'Manual' }, { url: 'javascript:alert(1)', apodo_link: 'Manual' },
    { url: 'https://wiwo.me', apodo_link: 'x'.repeat(256) }, { url: 'https://wiwo.me/' + 'x'.repeat(2048), apodo_link: '' }
  ]) assert.ok(esquema.validar({ 6: valor })[6])
  assert.deepEqual(esquema.validar({ 6: { url: 'https://wiwo.me', apodo_link: '📁'.repeat(255) } }), {})
  assert.deepEqual(esquema.validar({ 6: { url: 'https://wiwo.me/' + 'x'.repeat(2048 - 'https://wiwo.me/'.length), apodo_link: '' } }), {})
  assert.ok(esquemaDeCamposPersonalizados([{ ...ENLACE, required: true }]).validar({ 6: valorVacio(ENLACE) })[6])
})
