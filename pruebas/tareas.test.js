/**
 * Pestaña de Tareas: fila vencida, columnas de campos personalizados y acciones masivas.
 *
 * Las tres se rompen en silencio: una fila vencida que no se marca no avisa de nada, una columna de
 * campo personalizado de mas llena la tabla de datos que el panel viejo nunca mostro, y una accion
 * masiva ofrecida sin permiso es un 403 con veinte tareas seleccionadas.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accionesMasivasPermitidas,
  camposDeTabla,
  comentarioParaMostrar,
  estaVencida,
  valorDeAccionMasiva,
  cuerpoDeAccionMasiva,
  ACCIONES_MASIVAS,
  SIN_FECHA,
  valorDeCampo
} from '../src/componentes/proyecto/tareas.ts'

const HOY = new Date(2026, 1, 25)

test('una tarea vencida y no completa se marca', () => {
  assert.equal(estaVencida({ due_date: '2026-02-24', status: 4 }, HOY), true)
})

test('la que vence hoy todavia no esta vencida', () => {
  assert.equal(estaVencida({ due_date: '2026-02-25', status: 4 }, HOY), false)
})

test('una tarea completa nunca se marca, aunque haya vencido', () => {
  assert.equal(estaVencida({ due_date: '2020-01-01', status: 5 }, HOY), false)
})

test('sin fecha de vencimiento no hay marca', () => {
  assert.equal(estaVencida({ due_date: null, status: 4 }, HOY), false)
  assert.equal(estaVencida({ due_date: 'no es una fecha', status: 4 }, HOY), false)
})

const CAMPOS = [
  { id: 6, slug: 'tasks_link_de_drive', name: 'Link de Drive', type: 'link', options: null, required: false, order: 2, default_value: null, only_admin: false, show_on_table: false },
  { id: 3, slug: 'tasks_area_de_la_compania', name: 'Área de la compañía', type: 'multiselect', options: [], required: true, order: 1, default_value: null, only_admin: false, show_on_table: true },
  { id: 9, slug: 'tasks_tipo', name: 'Tipo', type: 'select', options: [], required: false, order: 1, default_value: null, only_admin: false, show_on_table: true }
]

test('solo los campos con show_on_table son columna, ordenados por order y nombre', () => {
  assert.deepEqual(camposDeTabla(CAMPOS).map((c) => c.slug), ['tasks_area_de_la_compania', 'tasks_tipo'])
})

test('un multiselect se muestra unido y un campo ausente no rompe la celda', () => {
  const proceso = {
    custom_fields: [
      { id: 3, slug: 'tasks_area_de_la_compania', name: 'Área', type: 'multiselect', value: ['Content Studio', 'Analytics'] },
      { id: 9, slug: 'tasks_tipo', name: 'Tipo', type: 'select', value: null }
    ]
  }

  assert.equal(valorDeCampo(proceso, 'tasks_area_de_la_compania'), 'Content Studio, Analytics')
  assert.equal(valorDeCampo(proceso, 'tasks_tipo'), '')
  assert.equal(valorDeCampo(proceso, 'no_existe'), '')
  assert.equal(valorDeCampo({}, 'tasks_tipo'), '')
})

test('eliminar en masa solo se ofrece con delete, el resto con edit', () => {
  assert.deepEqual(accionesMasivasPermitidas(['view']).map((a) => a.clave), [])
  assert.deepEqual(accionesMasivasPermitidas(['edit']).map((a) => a.clave),
    ['status', 'priority', 'assignees', 'due_date', 'project', 'milestone', 'billable', 'tags'])
  assert.deepEqual(accionesMasivasPermitidas(['delete']).map((a) => a.clave), ['delete'])
})

test('el valor de la accion masiva llega tipado como lo espera el contrato', () => {
  assert.equal(valorDeAccionMasiva('estado', '5'), 5)
  assert.equal(valorDeAccionMasiva('booleano', 'si'), true)
  assert.equal(valorDeAccionMasiva('booleano', 'no'), false)
  assert.deepEqual(valorDeAccionMasiva('personas', '12, 45'), [12, 45])
  assert.deepEqual(valorDeAccionMasiva('etiquetas', ' urgente , '), ['urgente'])
  assert.equal(valorDeAccionMasiva('ninguno', ''), null)
  assert.equal(valorDeAccionMasiva('estado', ''), null, 'sin elegir nada no hay nada que mandar')
})

test('la fecha masiva distingue entre no elegir nada y sacar la fecha', () => {
  assert.equal(valorDeAccionMasiva('fecha', '2026-11-05'), '2026-11-05')
  assert.equal(valorDeAccionMasiva('fecha', SIN_FECHA), SIN_FECHA)
  assert.equal(valorDeAccionMasiva('fecha', ''), null, 'sin elegir nada no hay nada que mandar')
  for (const invalida of ['05-11-2026', '2026/11/05', 'hoy', '2026-11']) {
    assert.equal(valorDeAccionMasiva('fecha', invalida), null, `${invalida} no es YYYY-MM-DD`)
  }
})

test('el cuerpo de la accion masiva manda valor:null solo para sacar la fecha', () => {
  const fecha = ACCIONES_MASIVAS.find((accion) => accion.clave === 'due_date')
  const borrar = ACCIONES_MASIVAS.find((accion) => accion.clave === 'delete')
  const proyecto = ACCIONES_MASIVAS.find((accion) => accion.clave === 'project')

  assert.deepEqual(cuerpoDeAccionMasiva(fecha, '2026-11-05', [], [1, 2]),
    { ids: [1, 2], accion: 'due_date', valor: '2026-11-05' })

  // `valor: null` explicito: la clave omitida significaria "no toques la fecha".
  const sinFecha = cuerpoDeAccionMasiva(fecha, SIN_FECHA, [], [1])
  assert.deepEqual(sinFecha, { ids: [1], accion: 'due_date', valor: null })
  assert.ok('valor' in sinFecha, 'la clave tiene que viajar aunque valga null')

  assert.equal(cuerpoDeAccionMasiva(fecha, '', [], [1]), null, 'sin fecha elegida no se manda nada')

  // `delete` no lleva valor, y eso no es lo mismo que faltarle uno.
  assert.deepEqual(cuerpoDeAccionMasiva(borrar, '', [], [3]), { ids: [3], accion: 'delete' })

  assert.deepEqual(cuerpoDeAccionMasiva(proyecto, '', [8, 67], [3]),
    { ids: [3], accion: 'project', valor: [8, 67] })
  assert.equal(cuerpoDeAccionMasiva(proyecto, '', [], [3]), null, 'sin destinos no se manda nada')
})


test('agregar a proyecto requiere un destino con id positivo y permiso de edición', () => {
  assert.deepEqual(accionesMasivasPermitidas(['edit']).find((accion) => accion.clave === 'project'), {
    clave: 'project', etiqueta: 'Agregar a proyecto', control: 'proyecto', requiere: 'edit'
  })
  assert.equal(valorDeAccionMasiva('proyecto', '42'), 42)
  for (const invalido of ['', ' ', '0', '-1', '1.5', 'abc']) {
    assert.equal(valorDeAccionMasiva('proyecto', invalido), null)
  }
})

/**
 * El autor de un comentario.
 *
 * La API firma con `staff` o con `contact`, nunca con los dos. Si la traduccion se equivoca, el hilo
 * del cliente se lee mal en el peor lugar posible: un comentario propio firmado como si lo hubiera
 * escrito el equipo, o al reves. Es la clase de error que nadie reporta porque no rompe nada.
 */
const COMENTARIO = {
  id: 9,
  task_id: 512,
  parent_id: null,
  content: 'Lo revisamos el lunes',
  date_added: '2026-09-10T14:00:00Z',
  staff: null,
  contact: null
}

test('un comentario del equipo se firma con el nombre del colaborador y sin insignia', () => {
  const mostrable = comentarioParaMostrar({
    ...COMENTARIO,
    staff: { id: 183, full_name: 'Dev Prueba' }
  })

  assert.equal(mostrable.author.full_name, 'Dev Prueba')
  assert.equal(mostrable.author.es_cliente, false)
  assert.equal(mostrable.created, '2026-09-10T14:00:00Z', 'la fecha viene en date_added, no en created')
  assert.equal(mostrable.content, 'Lo revisamos el lunes')
})

test('un comentario del cliente viene con contact y sin staff, y eso es lo que lo distingue', () => {
  const mostrable = comentarioParaMostrar({
    ...COMENTARIO,
    contact: { id: 900013, full_name: 'Paridad Prueba' }
  })

  assert.equal(mostrable.author.full_name, 'Paridad Prueba')
  assert.equal(mostrable.author.es_cliente, true)
})

test('con los dos firmantes en null el autor se perdio, y no se inventa', () => {
  assert.equal(comentarioParaMostrar(COMENTARIO).author, null)
})

test('el adjunto del comentario no viaja: ningun contrato lo emite', () => {
  assert.equal(comentarioParaMostrar({ ...COMENTARIO, staff: { id: 1, full_name: 'X' } }).file, null)
})
