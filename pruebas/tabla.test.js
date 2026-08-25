/**
 * Pruebas de la logica del motor de tabla.
 *
 * Son las decisiones que se rompen en silencio: una columna que no debia verse, una accion que la
 * persona no puede ejecutar, un selector que ofrece 200 filas cuando el backend corta en 100, o un
 * 422 que se muestra como "algo salio mal" sin decir que filtro lo causo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POR_PAGINA_MAXIMO } from '../src/datos/consulta.ts'
import {
  clavesVisiblesPorDefecto,
  columnasVisibles,
  esControlDeFila,
  idDeParametro,
  mensajeDeError,
  opcionesPorPagina,
  podarPorPermisos,
  rutaDeAccion,
  resolverInsignia,
  resumenDeFiltro,
  urlConParametro,
  SELECTOR_CONTROLES_DE_FILA
} from '../src/componentes/datos/tabla.ts'

const presentar = () => null

const COLUMNAS = [
  { clave: 'name', encabezado: 'Nombre', presentar },
  { clave: 'status', encabezado: 'Estado', presentar },
  { clave: 'datecreated', encabezado: 'Creado', presentar, ocultaPorDefecto: true }
]

const FILTROS = [
  { clave: 'status', etiqueta: 'Estado', tipo: 'seleccion' },
  { clave: 'project_id', etiqueta: 'Espacio', tipo: 'seleccion' }
]

test('las columnas ocultas por defecto no arrancan visibles', () => {
  assert.deepEqual(clavesVisiblesPorDefecto(COLUMNAS), ['name', 'status'])
})

test('columnasVisibles respeta el orden de la definicion, no el del selector', () => {
  const visibles = columnasVisibles(COLUMNAS, ['datecreated', 'name'])

  assert.deepEqual(visibles.map((c) => c.clave), ['name', 'datecreated'])
})

test('columnasVisibles ignora claves que la definicion no declara', () => {
  assert.deepEqual(columnasVisibles(COLUMNAS, ['inventada']), [])
})

test('podarPorPermisos deja las acciones sin requisito y las cubiertas', () => {
  const acciones = [
    { clave: 'ver', etiqueta: 'Ver', ruta: 'tasks/:id', metodo: 'POST' },
    { clave: 'editar', etiqueta: 'Editar', ruta: 'tasks/:id', metodo: 'POST', requiere: 'edit' },
    { clave: 'borrar', etiqueta: 'Borrar', ruta: 'tasks/:id', metodo: 'DELETE', requiere: 'delete' }
  ]

  const podadas = podarPorPermisos(acciones, ['view', 'edit'])

  assert.deepEqual(podadas.map((a) => a.clave), ['ver', 'editar'])
})

test('podarPorPermisos sin acciones declaradas devuelve lista vacia', () => {
  assert.deepEqual(podarPorPermisos(undefined, ['view']), [])
})

test('rutaDeAccion reemplaza el :id y lo escapa', () => {
  assert.equal(rutaDeAccion('tasks/:id/actions/mark-complete', 512), 'tasks/512/actions/mark-complete')
  assert.equal(rutaDeAccion('tasks/:id', 'a/b'), 'tasks/a%2Fb')
})

test('el selector de tamaño de pagina nunca ofrece mas que el tope del backend', () => {
  for (const cantidad of opcionesPorPagina(POR_PAGINA_MAXIMO, 25)) {
    assert.ok(cantidad <= POR_PAGINA_MAXIMO, `${cantidad} supera el tope`)
  }

  assert.ok(!opcionesPorPagina(POR_PAGINA_MAXIMO, 25).includes(200))
})

test('el tamaño vigente aparece en el selector aunque no sea uno de los estandar', () => {
  const opciones = opcionesPorPagina(POR_PAGINA_MAXIMO, 30)

  assert.ok(opciones.includes(30))
  assert.deepEqual(opciones, [...opciones].sort((a, b) => a - b))
})

test('un tamaño vigente invalido no se cuela en el selector', () => {
  assert.ok(!opcionesPorPagina(POR_PAGINA_MAXIMO, 0).includes(0))
  assert.ok(!opcionesPorPagina(POR_PAGINA_MAXIMO, 500).includes(500))
})

test('un error comun muestra su mensaje tal cual', () => {
  const mensaje = mensajeDeError({ code: 'not_found', message: 'No existe' }, FILTROS)

  assert.equal(mensaje, 'No existe')
})

test('un 422 nombra el filtro que fallo con su etiqueta visible', () => {
  const mensaje = mensajeDeError(
    {
      code: 'validation_failed',
      message: 'Los datos no son válidos',
      details: { 'filter[status]': ['El valor no está permitido.'] }
    },
    FILTROS
  )

  assert.match(mensaje, /Estado/)
  assert.match(mensaje, /El valor no está permitido\./)
})

test('un 422 en varias notaciones de clave sigue traduciendo el nombre', () => {
  const mensaje = mensajeDeError(
    {
      code: 'validation_failed',
      message: 'Los datos no son válidos',
      details: { 'filter.project_id': ['No existe.'], sort: ['Campo desconocido.'] }
    },
    FILTROS
  )

  assert.match(mensaje, /Espacio/)
  // Lo que no es un filtro declarado se muestra con su clave cruda, no se oculta.
  assert.match(mensaje, /sort/)
})

test('un 422 sin details cae al mensaje del contrato', () => {
  const mensaje = mensajeDeError({ code: 'validation_failed', message: 'Los datos no son válidos' }, FILTROS)

  assert.equal(mensaje, 'Los datos no son válidos')
})

/**
 * Pruebas de la insignia de catalogo.
 *
 * Los estados y las prioridades llegan como numeros. Sin resolverlos, la columna "Estado" muestra un
 * "2" — que es lo que hacia antes. Neo lo prohibe explicitamente: "Los estados deben poder leerse sin
 * depender del color. Incluye nombre, icono o microcopy."
 */

const CATALOGO = [
  { valor: '1', etiqueta: 'Por iniciar', color: '#8AF84F' },
  { valor: '4', etiqueta: 'En progreso', color: '#4242FF' },
  { valor: '5', etiqueta: 'Completo' }
]

test('un id del catalogo se resuelve a su nombre y su color', () => {
  assert.deepEqual(resolverInsignia(4, CATALOGO), { etiqueta: 'En progreso', color: '#4242FF' })
})

test('el numero se compara como cadena: la API devuelve numeros y el catalogo, texto', () => {
  assert.equal(resolverInsignia('4', CATALOGO)?.etiqueta, 'En progreso')
})

test('una entrada sin color se resuelve igual: el nombre es lo que no puede faltar', () => {
  assert.deepEqual(resolverInsignia(5, CATALOGO), { etiqueta: 'Completo', color: undefined })
})

test('un id que el catalogo no conoce cae al valor crudo, no a una celda vacia', () => {
  // Pasa cuando alguien agrega un estado en Perfex y la pantalla todavia no lo recargo.
  assert.equal(resolverInsignia(99, CATALOGO), null)
})

test('sin catalogo o sin valor no hay insignia', () => {
  assert.equal(resolverInsignia(1, undefined), null)
  assert.equal(resolverInsignia(null, CATALOGO), null)
  assert.equal(resolverInsignia(undefined, CATALOGO), null)
})

/**
 * El resumen del filtro de varios valores.
 *
 * Se rompe en silencio: el disparador seguiria pintandose igual mientras dice otra cosa que la que
 * viaja en la URL, que es el peor de los errores posibles en un filtro.
 */
test('resumenDeFiltro dice "todos" con la etiqueta cuando no hay nada elegido', () => {
  assert.deepEqual(resumenDeFiltro('Estado', CATALOGO, []), { texto: 'Estado: todos', extra: null })
})

test('resumenDeFiltro nombra la opcion pelada cuando hay una sola, sin conteo', () => {
  assert.deepEqual(resumenDeFiltro('Estado', CATALOGO, ['4']), { texto: 'En progreso', extra: null })
})

test('resumenDeFiltro nombra la primera y cuenta el resto aparte', () => {
  assert.deepEqual(resumenDeFiltro('Estado', CATALOGO, ['4', '1', '5']), { texto: 'En progreso', extra: '+2' })
})

test('resumenDeFiltro muestra crudo el valor que no esta en el catalogo, y lo cuenta igual', () => {
  assert.deepEqual(resumenDeFiltro('Estado', CATALOGO, ['99']), { texto: '99', extra: null })
  assert.deepEqual(resumenDeFiltro('Estado', CATALOGO, ['99', '4']), { texto: '99', extra: '+1' })
})

/**
 * Elemento falso: `esControlDeFila` solo necesita `closest`, y con eso alcanza para probar la regla
 * sin montar un DOM.
 *
 * @param {boolean} dentroDeControl si el elemento cuelga de un control de la fila
 * @returns {{ closest: (selector: string) => unknown }} el doble
 */
function elementoFalso (dentroDeControl) {
  return {
    closest (selector) {
      assert.equal(selector, SELECTOR_CONTROLES_DE_FILA)

      return dentroDeControl ? {} : null
    }
  }
}

test('un clic nacido en un control de la fila no abre el detalle', () => {
  assert.equal(esControlDeFila(elementoFalso(true)), true)
})

test('un clic en el texto de una celda si abre el detalle', () => {
  assert.equal(esControlDeFila(elementoFalso(false)), false)
})

test('sin objetivo el clic no se atribuye a ningun control', () => {
  assert.equal(esControlDeFila(null), false)
})

test('el selector cubre enlaces, botones y los roles de Radix', () => {
  for (const parte of ['a', 'button', 'input', 'select', '[role="menuitem"]', '[role="combobox"]']) {
    assert.ok(SELECTOR_CONTROLES_DE_FILA.split(', ').includes(parte), parte)
  }
})

test('abrir el detalle conserva filtros, orden y pagina', () => {
  const params = new URLSearchParams('filter[status]=1,4&sort=-due_date&page=3')

  assert.equal(
    urlConParametro(params, 'tarea', '12'),
    '?filter%5Bstatus%5D=1%2C4&sort=-due_date&page=3&tarea=12'
  )
})

test('abrir otra tarea reemplaza la abierta, no la acumula', () => {
  assert.equal(urlConParametro(new URLSearchParams('tarea=7'), 'tarea', '9'), '?tarea=9')
})

test('urlConParametro no muta los parametros que recibe', () => {
  const params = new URLSearchParams('page=2')

  urlConParametro(params, 'tarea', '5')

  assert.equal(params.get('tarea'), null)
})

test('un id de la URL solo se acepta si es entero positivo', () => {
  assert.equal(idDeParametro('12'), 12)
  assert.equal(idDeParametro(null), null)
  assert.equal(idDeParametro(''), null)
  assert.equal(idDeParametro('  '), null)
  assert.equal(idDeParametro('abc'), null)
  assert.equal(idDeParametro('-3'), null)
  assert.equal(idDeParametro('0'), null)
  assert.equal(idDeParametro('1.5'), null)
})
