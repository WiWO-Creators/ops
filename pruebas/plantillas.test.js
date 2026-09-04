/**
 * Pruebas de las plantillas de Espacio.
 *
 * Lo que se prueba es la aritmetica que decide fechas y la traduccion entre la lista del editor y el
 * cuerpo que espera la API. Las dos son la clase de logica que compila perfecto y crea cuarenta
 * Procesos mal fechados: el escalado por un factor, y la jerarquia que viaja por posicion y no por
 * id, que es donde una lista reordenada rompe el guardado con un 422.
 *
 * El calculo de fechas de aca es una **vista previa**: quien decide es el backend. Se prueba contra
 * el ejemplo textual del contrato para que las dos cuentas digan lo mismo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entregaPrevista,
  erroresDeItems,
  factorDeEscalado,
  filasDeItems,
  itemsParaGuardar,
  padresPosibles,
  previsualizarPlantilla,
  textoDeMotivo,
  tiposDeProcesoUnicos
} from '../src/lib/plantillas.ts'
import { sumarDias } from '../src/lib/fechas.ts'

const ITEMS = [
  {
    id: 11,
    type: 'milestone',
    parent_id: null,
    parent_index: null,
    name: 'Kickoff',
    description: null,
    offset_days: 0,
    duration_days: 5,
    task_type_id: null,
    assignees: [],
    order: 0
  },
  {
    id: 12,
    type: 'task',
    parent_id: 11,
    parent_index: 0,
    name: 'Brief',
    description: null,
    offset_days: 0,
    duration_days: 2,
    task_type_id: 1,
    assignees: [1, 2],
    order: 1
  }
]

test('sumarDias no corre la fecha un dia en husos al oeste de Greenwich', () => {
  assert.equal(sumarDias('2026-09-10', 10), '2026-09-20')
  assert.equal(sumarDias('2026-09-10', 0), '2026-09-10')
  assert.equal(sumarDias('2026-02-28', 1), '2026-03-01')
  assert.equal(sumarDias('2026-01-05', -10), '2025-12-26')
})

test('sumarDias devuelve null ante lo que no es una fecha sin hora', () => {
  assert.equal(sumarDias(null, 3), null)
  assert.equal(sumarDias('', 3), null)
  assert.equal(sumarDias('2026-09-10T12:00:00Z', 3), null)
  assert.equal(sumarDias('2026-09-10', Number.NaN), null)
})

test('el factor es el cociente entre lo pedido y lo declarado', () => {
  assert.equal(factorDeEscalado(60, 30), 2)
  assert.equal(factorDeEscalado(15, 30), 0.5)
})

test('sin duracion pedida o sin duracion declarada, el factor es 1', () => {
  // Es la regla del contrato: `duration_days` nula o en cero deja las posiciones tal cual.
  assert.equal(factorDeEscalado(null, 30), 1)
  assert.equal(factorDeEscalado(60, null), 1)
  assert.equal(factorDeEscalado(60, 0), 1)
  assert.equal(factorDeEscalado(0, 30), 1)
  assert.equal(factorDeEscalado(undefined, undefined), 1)
})

test('la vista previa reproduce el ejemplo del contrato', () => {
  // Plantilla de 30 dias creada con 60: factor 2. Kickoff (offset 0, duracion 5) va del 10 al 20 de
  // septiembre; Brief (offset 0, duracion 2) va del 10 al 14.
  const filas = previsualizarPlantilla('2026-09-10', ITEMS, factorDeEscalado(60, 30))

  assert.deepEqual(
    filas.map((f) => [f.nombre, f.inicio, f.vence]),
    [
      ['Kickoff', '2026-09-10', '2026-09-20'],
      ['Brief', '2026-09-10', '2026-09-14']
    ]
  )
})

test('una tarea con hito se marca como hija, y un hito nunca', () => {
  const filas = previsualizarPlantilla('2026-09-10', ITEMS, 1)

  assert.equal(filas[0].esHija, false)
  assert.equal(filas[1].esHija, true)
})

test('sin fecha de inicio utilizable, la vista previa no inventa fechas', () => {
  const filas = previsualizarPlantilla('', ITEMS, 2)

  assert.deepEqual(filas.map((f) => f.inicio), [null, null])
  assert.deepEqual(filas.map((f) => f.vence), [null, null])
})

test('una plantilla sin items da una vista previa vacia, no un error', () => {
  assert.deepEqual(previsualizarPlantilla('2026-09-10', [], 1), [])
})

test('la entrega es el maximo entre la duracion pedida y el ultimo vencimiento', () => {
  const filas = previsualizarPlantilla('2026-09-10', ITEMS, 2)

  // 10 de septiembre + 60 dias = 9 de noviembre, que se pasa del ultimo item (20 de septiembre).
  assert.equal(entregaPrevista('2026-09-10', 60, filas), '2026-11-09')
})

test('sin duracion pedida, la entrega es el ultimo vencimiento de la plantilla', () => {
  const filas = previsualizarPlantilla('2026-09-10', ITEMS, 1)

  assert.equal(entregaPrevista('2026-09-10', null, filas), '2026-09-15')
})

test('sin duracion y sin items la entrega queda en null, nunca en la fecha de inicio', () => {
  assert.equal(entregaPrevista('2026-09-10', null, []), null)
})

test('los tipos de Proceso se deduplican por nombre quedandose con el id mas bajo', () => {
  // `tbltask_types` tiene una fila por Espacio: los tres globales aparecen repetidos con ids nuevos.
  const opciones = tiposDeProcesoUnicos([
    { id: 1, name: 'Bug' },
    { id: 2, name: 'Feature' },
    { id: 4, name: 'Bug' },
    { id: 7, name: 'Bug' },
    { id: 835, name: 'Revisión legal' }
  ])

  assert.deepEqual(opciones, [
    { valor: '1', etiqueta: 'Bug' },
    { valor: '2', etiqueta: 'Feature' },
    { valor: '835', etiqueta: 'Revisión legal' }
  ])
})

test('sin catalogo de tipos, la lista es vacia y no rompe', () => {
  assert.deepEqual(tiposDeProcesoUnicos(undefined), [])
  assert.deepEqual(tiposDeProcesoUnicos([]), [])
})

test('releer una plantilla y volver a guardarla conserva la jerarquia', () => {
  // Es exactamente para esto que el contrato manda `parent_index` ademas de `parent_id`: la escritura
  // reemplaza la lista entera y los ids nuevos todavia no existen.
  const items = itemsParaGuardar(filasDeItems(ITEMS))

  assert.equal(items[0].parent_index, null)
  assert.equal(items[1].parent_index, 0)
  assert.deepEqual(items[1].assignees, [1, 2])
  assert.equal(items[1].task_type_id, 1)
})

test('mover una tarea por encima de su hito suelta el vinculo en vez de romper el guardado', () => {
  // El contrato responde 422 `no_es_un_hito_anterior` a un padre que quedo despues. Soltarlo aca es
  // mas util que mostrar el error recien al guardar.
  const filas = filasDeItems(ITEMS)
  const invertidas = [filas[1], filas[0]]

  assert.equal(itemsParaGuardar(invertidas)[0].parent_index, null)
})

test('un hito no manda parent_index, task_type_id ni responsables', () => {
  const items = itemsParaGuardar([
    {
      clave: 'a',
      type: 'milestone',
      name: '  Kickoff  ',
      padre: 'b',
      offset_days: '3',
      duration_days: '5',
      task_type_id: '7',
      assignees: ['1']
    }
  ])

  assert.deepEqual(items, [{
    type: 'milestone',
    name: 'Kickoff',
    parent_index: null,
    offset_days: 3,
    duration_days: 5,
    task_type_id: null,
    assignees: []
  }])
})

test('un campo numerico vacio o negativo vale cero, que es el defecto del contrato', () => {
  const items = itemsParaGuardar([
    { clave: 'a', type: 'task', name: 'X', padre: null, offset_days: '', duration_days: '-4', task_type_id: '', assignees: [] }
  ])

  assert.equal(items[0].offset_days, 0)
  assert.equal(items[0].duration_days, 0)
  assert.equal(items[0].task_type_id, null)
})

test('solo se ofrecen como padre los hitos que estan mas arriba en la lista', () => {
  const filas = [
    { clave: 'h1', type: 'milestone', name: 'Uno', padre: null, offset_days: '0', duration_days: '0', task_type_id: '', assignees: [] },
    { clave: 't1', type: 'task', name: 'Tarea', padre: null, offset_days: '0', duration_days: '0', task_type_id: '', assignees: [] },
    { clave: 'h2', type: 'milestone', name: 'Dos', padre: null, offset_days: '0', duration_days: '0', task_type_id: '', assignees: [] }
  ]

  assert.deepEqual(padresPosibles(filas, 1), [{ valor: 'h1', etiqueta: 'Uno' }])
  assert.deepEqual(padresPosibles(filas, 0), [])
})

test('el 422 de la API se reparte por posicion de item', () => {
  const porFila = erroresDeItems({
    'items.0.parent_index': ['no_es_un_hito_anterior'],
    'items.2.task_type_id': ['no_existe'],
    'items.2.assignees': ['no_existe'],
    name: ['required']
  })

  assert.deepEqual(porFila[0], { parent_index: 'no_es_un_hito_anterior' })
  assert.deepEqual(porFila[2], { task_type_id: 'no_existe', assignees: 'no_existe' })
  // `name` no habla de un item: no puede colarse como fila 0.
  assert.equal(Object.keys(porFila).length, 2)
})

test('sin details no hay errores por fila', () => {
  assert.deepEqual(erroresDeItems(undefined), {})
})

test('los motivos del contrato se muestran en castellano', () => {
  assert.equal(textoDeMotivo('no_es_un_hito_anterior'), 'El hito tiene que estar más arriba en la lista.')
  // Lo que no este en el mapa se muestra igual: un codigo crudo dice mas que esconder el error.
  assert.equal(textoDeMotivo('otro_motivo'), 'otro motivo')
})
