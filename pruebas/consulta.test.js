/**
 * Pruebas de la traduccion entre el estado de una vista y la consulta de la API.
 *
 * Es donde el frontend rompe el contrato sin darse cuenta: el backend valida `filter[]`, `sort` e
 * `include` contra whitelists y responde 422 ante cualquier nombre desconocido — no lo ignora. Un
 * error aca no se ve como un bug de datos: se ve como una tabla que no carga.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  POR_PAGINA_MAXIMO,
  alternarOrden,
  construirConsulta,
  direccionDe,
  estadoInicial,
  leerConsulta,
  paramsDeUrl
} from '../src/datos/consulta.ts'

/** Definicion recortada de Procesos, con las whitelists reales del backend. */
const PROCESOS = {
  ruta: 'tasks',
  titulo: { singular: 'Proceso', plural: 'Procesos' },
  columnas: [],
  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple' },
    { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion' },
    { clave: 'project_id', etiqueta: 'Espacio', tipo: 'seleccion' }
  ],
  ordenables: ['name', 'due_date', 'start_date', 'date_added', 'priority', 'status'],
  ordenPorDefecto: 'due_date',
  busqueda: true,
  includes: ['custom_fields', 'description']
}

test('el estado inicial toma el orden por defecto de la definicion', () => {
  assert.deepEqual(estadoInicial(PROCESOS).orden, ['due_date'])
})

test('un orden por defecto compuesto (arreglo) queda tal cual, campo por campo', () => {
  const conOrdenCompuesto = { ...PROCESOS, ordenPorDefecto: ['completed', '-date_added'] }

  assert.deepEqual(estadoInicial(conOrdenCompuesto).orden, ['completed', '-date_added'])
})

test('la consulta por defecto no manda nada redundante', () => {
  assert.equal(construirConsulta({ ...estadoInicial(PROCESOS), orden: [] }, PROCESOS), '')
})

test('varios valores de un filtro van como lista: el backend los traduce a IN', () => {
  const consulta = construirConsulta(
    { ...estadoInicial(PROCESOS), orden: [], filtros: { status: ['1', '2'] } },
    PROCESOS
  )

  assert.equal(decodeURIComponent(consulta), 'filter[status]=1,2')
})

test('un filtro que la definicion no declara NO viaja: seria un 422', () => {
  const consulta = construirConsulta(
    { ...estadoInicial(PROCESOS), orden: [], filtros: { inventado: ['1'], status: ['3'] } },
    PROCESOS
  )

  assert.equal(decodeURIComponent(consulta), 'filter[status]=3')
})

test('un campo de orden fuera de la whitelist se descarta, con signo y sin signo', () => {
  const consulta = construirConsulta(
    { ...estadoInicial(PROCESOS), orden: ['-inventado', '-due_date'] },
    PROCESOS
  )

  assert.equal(decodeURIComponent(consulta), 'sort=-due_date')
})

test('un include fuera de la whitelist se descarta', () => {
  const consulta = construirConsulta(
    { ...estadoInicial(PROCESOS), orden: [], includes: ['custom_fields', 'inventado'] },
    PROCESOS
  )

  assert.equal(decodeURIComponent(consulta), 'include=custom_fields')
})

test('per_page se acota al maximo del backend en vez de pedir de mas', () => {
  const consulta = construirConsulta(
    { ...estadoInicial(PROCESOS), orden: [], porPagina: 500 },
    PROCESOS
  )

  assert.equal(consulta, `per_page=${POR_PAGINA_MAXIMO}`)
})

test('la busqueda se ignora si el recurso no la acepta', () => {
  const sinBusqueda = { ...PROCESOS, busqueda: false }
  const estado = { ...estadoInicial(sinBusqueda), orden: [], busqueda: 'hola' }

  assert.equal(construirConsulta(estado, sinBusqueda), '')
  assert.equal(decodeURIComponent(construirConsulta({ ...estado }, PROCESOS)), 'q=hola')
})

test('la busqueda con solo espacios no viaja', () => {
  const estado = { ...estadoInicial(PROCESOS), orden: [], busqueda: '   ' }

  assert.equal(construirConsulta(estado, PROCESOS), '')
})

test('leer y construir es ida y vuelta', () => {
  const original = 'page=3&per_page=50&filter%5Bstatus%5D=1%2C4&sort=-due_date&q=kickoff&include=description'
  const estado = leerConsulta(new URLSearchParams(original), PROCESOS)

  assert.equal(estado.pagina, 3)
  assert.equal(estado.porPagina, 50)
  assert.deepEqual(estado.filtros.status, ['1', '4'])
  assert.deepEqual(estado.orden, ['-due_date'])
  assert.equal(estado.busqueda, 'kickoff')
  assert.deepEqual(estado.includes, ['description'])
  assert.equal(construirConsulta(estado, PROCESOS), original)
})

test('una URL con basura produce una vista util, no un error', () => {
  const estado = leerConsulta(
    new URLSearchParams('page=cero&per_page=-5&filter%5Bfalso%5D=1&sort=nada&include=nada'),
    PROCESOS
  )

  assert.equal(estado.pagina, 1)
  assert.equal(estado.porPagina, 25)
  assert.deepEqual(estado.filtros, {})
  assert.deepEqual(estado.orden, ['due_date'])
  assert.deepEqual(estado.includes, [])
})

test('los includes de incluirSiempre no se pierden al leer la URL', () => {
  const conSiempre = { ...PROCESOS, incluirSiempre: ['custom_fields'] }
  const estado = leerConsulta(new URLSearchParams('include=description'), conSiempre)

  assert.deepEqual(estado.includes.sort(), ['custom_fields', 'description'])
})

test('alternar orden va ascendente, descendente, y vuelve', () => {
  assert.deepEqual(alternarOrden(['due_date'], 'name'), ['name'])
  assert.deepEqual(alternarOrden(['name'], 'name'), ['-name'])
  assert.deepEqual(alternarOrden(['-name'], 'name'), ['name'])
})

test('direccionDe reconoce el signo', () => {
  assert.equal(direccionDe(['name'], 'name'), 'asc')
  assert.equal(direccionDe(['-name'], 'name'), 'desc')
  assert.equal(direccionDe(['-name'], 'due_date'), null)
})

test('paramsDeUrl normaliza lo que entrega Next: cadena o lista', () => {
  const params = paramsDeUrl({ page: '2', 'filter[status]': ['1', '4'], vacio: undefined })

  assert.equal(params.get('page'), '2')
  assert.equal(params.get('filter[status]'), '1,4')
  assert.equal(params.has('vacio'), false)
})

/**
 * Pruebas del filtro de rango.
 *
 * Un rango es UN control con DOS parametros. Unirlos en una lista los convertiria en `IN (desde,
 * hasta)`, que sobre una fecha no devuelve casi nada — y el bug no se ve como un error sino como una
 * tabla que aparece vacia sin motivo.
 */

const CON_RANGO = {
  ...PROCESOS,
  filtros: [
    ...PROCESOS.filtros,
    { clave: 'vence', etiqueta: 'Vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ]
}

test('el rango viaja como dos parametros distintos, no como lista', () => {
  const estado = { ...estadoInicial(CON_RANGO), orden: [], filtros: { vence: ['2026-01-01', '2026-02-01'] } }
  const consulta = decodeURIComponent(construirConsulta(estado, CON_RANGO))

  assert.match(consulta, /filter\[date_from\]=2026-01-01/)
  assert.match(consulta, /filter\[date_to\]=2026-02-01/)
  assert.doesNotMatch(consulta, /2026-01-01,2026-02-01/)
})

test('el rango se lee de vuelta desde sus dos claves', () => {
  const estado = leerConsulta(
    new URLSearchParams('filter%5Bdate_from%5D=2026-01-01&filter%5Bdate_to%5D=2026-02-01'),
    CON_RANGO
  )

  assert.deepEqual(estado.filtros.vence, ['2026-01-01', '2026-02-01'])
})

test('un rango con un solo extremo viaja igual: la API acepta date_from suelto', () => {
  const estado = { ...estadoInicial(CON_RANGO), orden: [], filtros: { vence: ['2026-01-01', ''] } }

  assert.equal(decodeURIComponent(construirConsulta(estado, CON_RANGO)), 'filter[date_from]=2026-01-01')
})

test('campos con operadores conservan comas, vacíos y descartan operadores inválidos', () => {
  const definicion = { ...PROCESOS, filtros: [
    ...PROCESOS.filtros,
    { clave: 'name', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'hours', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'deadline', tipo: 'campo', tipoDato: 'fecha' }
  ] }
  const estado = { ...estadoInicial(definicion), filtros: {
    name: ['contains', 'Diseño, revisión'], hours: ['gte', '0'], deadline: ['empty', '']
  } }
  const params = new URLSearchParams(construirConsulta(estado, definicion))
  assert.equal(params.get('filter[name__contains]'), 'Diseño, revisión')
  assert.equal(params.get('filter[deadline__empty]'), '1')
  assert.deepEqual(leerConsulta(params, definicion).filtros, estado.filtros)
  assert.deepEqual(leerConsulta(new URLSearchParams('filter[hours__contains]=3&filter[name__drop]=x'), definicion).filtros, {})
  const invalido = construirConsulta({ ...estado, filtros: { hours: ['contains', '3'], name: ['eq', ''] } }, definicion)
  assert.equal(new URLSearchParams(invalido).has('filter[hours__contains]'), false)
  assert.equal(new URLSearchParams(invalido).has('filter[name__eq]'), false)
})

test('un rango con solo extremo final conserva el extremo al serializar', () => {
  const definicion = { ...PROCESOS, filtros: [{ clave: 'vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }] }
  const estado = { ...estadoInicial(definicion), filtros: { vence: ['', '2026-09-08'] } }
  const params = new URLSearchParams(construirConsulta(estado, definicion))
  assert.equal(params.has('filter[date_from]'), false)
  assert.equal(params.get('filter[date_to]'), '2026-09-08')
  assert.deepEqual(leerConsulta(params, definicion).filtros, estado.filtros)
})

test('campos personalizados generan filtros también cuando su columna está oculta', async () => {
  const { filtrosDeCamposPersonalizados } = await import('../src/definiciones/filtros.ts')
  const campos = [
    { id: 4, name: 'Entrega', type: 'date_picker', order: 2, show_on_table: true },
    { id: 3, name: 'Costo', type: 'number', order: 1, show_on_table: false }
  ]
  assert.deepEqual(filtrosDeCamposPersonalizados(campos), [
    { clave: 'cf_3', etiqueta: 'Costo', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'cf_4', etiqueta: 'Entrega', tipo: 'campo', tipoDato: 'fecha' }
  ])
  assert.equal(campos[0].id, 4)
  assert.deepEqual(filtrosDeCamposPersonalizados([]), [])
})

test('calendario intersecta el período sin perder filtros, búsqueda ni campos personalizados', async () => {
  const { consultaDelCalendario } = await import('../src/datos/consulta.ts')
  const definicion = { ...PROCESOS, filtros: [...PROCESOS.filtros,
    { clave: 'vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    { clave: 'cf_7', tipo: 'campo', tipoDato: 'texto' }
  ] }
  const estado = { ...estadoInicial(definicion), pagina: 4, busqueda: 'Informe', filtros: {
    status: ['2'], vence: ['2026-09-09', '2026-09-11'], cf_7: ['contains', 'Cliente, equipo']
  } }
  const rango = { desde: '2026-09-07', hasta: '2026-09-13' }
  const vence = consultaDelCalendario(estado, definicion, rango)
  assert.equal(vence.get('filter[date_from]'), '2026-09-09')
  assert.equal(vence.get('filter[date_to]'), '2026-09-11')
  assert.equal(vence.get('filter[status]'), '2')
  assert.equal(vence.get('filter[cf_7__contains]'), 'Cliente, equipo')
  assert.equal(vence.get('q'), 'Informe')
  assert.equal(vence.has('page'), false)
  const empieza = consultaDelCalendario(estado, definicion, rango, true)
  assert.equal(empieza.get('filter[date_from]'), '2026-09-09')
  assert.equal(empieza.get('filter[start_date__gte]'), rango.desde)
  assert.equal(empieza.get('filter[due_date__empty]'), '1')
  const sinFiltros = consultaDelCalendario(estadoInicial(definicion), definicion, rango)
  assert.equal(sinFiltros.get('filter[due_date__gte]'), rango.desde)
  assert.equal(sinFiltros.get('filter[due_date__lte]'), rango.hasta)
})

test('asignado del calendario antiguo migra al selector de personas sin perder precisión', () => {
  const definicion = { ...PROCESOS, filtros: [{ clave: 'assignee', tipo: 'multiple', desdeLookup: 'staff' }] }
  const estado = leerConsulta(new URLSearchParams('assignee=42'), definicion)
  assert.deepEqual(estado.filtros.assignee, ['42'])
  assert.equal(new URLSearchParams(construirConsulta(estado, definicion)).get('filter[assignee]'), '42')
  assert.deepEqual(leerConsulta(new URLSearchParams('assignee=42,7'), definicion).filtros.assignee, ['42', '7'])
  assert.deepEqual(leerConsulta(new URLSearchParams('assignee=mal'), definicion).filtros, {})
})

test('calendario conserva rango disjunto válido y combina extremos tipados sin invertir el legacy', async () => {
  const { consultaDelCalendario } = await import('../src/datos/consulta.ts')
  const definicion = { ...PROCESOS, filtros: [
    { clave: 'vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    { clave: 'due_date', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'start_date', tipo: 'campo', tipoDato: 'fecha' }
  ] }
  const rango = { desde: '2026-09-07', hasta: '2026-09-13' }
  const estado = { ...estadoInicial(definicion), filtros: { vence: ['2026-10-01', '2026-10-15'], due_date: ['gte', '2026-10-02'] } }
  const consulta = consultaDelCalendario(estado, definicion, rango)
  assert.equal(consulta.get('filter[date_from]'), '2026-10-01')
  assert.equal(consulta.get('filter[date_to]'), '2026-10-15')
  assert.equal(consulta.get('filter[due_date__gte]'), '2026-10-02')
  assert.equal(consulta.get('filter[due_date__lte]'), rango.hasta)
  const empieza = consultaDelCalendario({ ...estado, filtros: { start_date: ['lte', '2026-09-09'] } }, definicion, rango, true)
  assert.equal(empieza.get('filter[start_date__gte]'), rango.desde)
  assert.equal(empieza.get('filter[start_date__lte]'), '2026-09-09')
})
