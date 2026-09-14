/**
 * Pruebas de las plantillas de Hito.
 *
 * Lo que se prueba es lo que compila perfecto y crea cuatro Tareas mal fechadas: la diferencia entre
 * "a cero dias del inicio" y "la fecha del hito" —que son `0` y `null`, y NO son lo mismo—, y la
 * aritmetica que convierte esas distancias en fechas.
 *
 * El calculo de fechas de aca es una **vista previa**: quien decide es el backend
 * (`Escritura/PlantillaHito.php::fechas()`). Se prueba contra su misma formula para que las dos
 * cuentas digan lo mismo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  erroresDeTareas,
  filasDeTareas,
  nombreDePrioridad,
  previsualizarTareas,
  tareasParaGuardar,
  textoDeMotivo,
  validarFilas
} from '../src/lib/plantillas-hito.ts'

/** La plantilla del caso real: "Hito mensual" con "Reporte semanal 1..4" a 0, 7, 14 y 21 dias. */
const TAREAS = [0, 7, 14, 21].map((dias, indice) => ({
  id: 10 + indice,
  name: `Reporte semanal ${indice + 1}`,
  description: null,
  order: indice,
  start_offset_days: dias,
  due_offset_days: dias + 6,
  priority: 2,
  task_type_id: null
}))

test('el vacio de un offset viaja como null, no como cero', () => {
  const [tarea] = tareasParaGuardar([
    {
      clave: 'a',
      name: '  Reporte  ',
      description: '   ',
      start_offset_days: '',
      due_offset_days: '0',
      priority: '3',
      task_type_id: ''
    }
  ])

  // El trim no es cosmetico: el backend recorta igual, y guardar " Reporte " haria que el nombre
  // que se lee no sea el que se escribio.
  assert.equal(tarea.name, 'Reporte')
  assert.equal(tarea.description, null)
  assert.equal(tarea.start_offset_days, null, 'vacio significa "la fecha del hito"')
  assert.equal(tarea.due_offset_days, 0, 'cero es una distancia declarada y tiene que sobrevivir')
  assert.equal(tarea.priority, 3)
  assert.equal(tarea.task_type_id, null)
})

test('la prioridad vacia cae en el defecto del contrato', () => {
  const [tarea] = tareasParaGuardar([
    {
      clave: 'a',
      name: 'Reporte',
      description: '',
      start_offset_days: '0',
      due_offset_days: '6',
      priority: '',
      task_type_id: '7'
    }
  ])

  assert.equal(tarea.priority, 2)
  assert.equal(tarea.task_type_id, 7)
})

test('ir y volver por el editor no cambia la plantilla', () => {
  const filas = filasDeTareas(TAREAS)
  const guardadas = tareasParaGuardar(filas)

  assert.deepEqual(
    guardadas.map((tarea) => [tarea.name, tarea.start_offset_days, tarea.due_offset_days, tarea.priority]),
    TAREAS.map((tarea) => [tarea.name, tarea.start_offset_days, tarea.due_offset_days, tarea.priority])
  )
})

test('el null de la plantilla leida sigue siendo null tras pasar por el editor', () => {
  const filas = filasDeTareas([{ ...TAREAS[0], start_offset_days: null, due_offset_days: null }])

  assert.equal(filas[0].start_offset_days, '')
  assert.equal(filas[0].due_offset_days, '')

  const [guardada] = tareasParaGuardar(filas)

  assert.equal(guardada.start_offset_days, null)
  assert.equal(guardada.due_offset_days, null)
})

test('validarFilas señala el nombre vacio, el rango y el orden de los dos extremos', () => {
  const errores = validarFilas([
    { clave: 'a', name: '   ', description: '', start_offset_days: '', due_offset_days: '', priority: '2', task_type_id: '' },
    { clave: 'b', name: 'Ok', description: '', start_offset_days: '9999', due_offset_days: '', priority: '2', task_type_id: '' },
    { clave: 'c', name: 'Ok', description: '', start_offset_days: '10', due_offset_days: '3', priority: '2', task_type_id: '' },
    { clave: 'd', name: 'Ok', description: '', start_offset_days: '0', due_offset_days: '6', priority: '2', task_type_id: '' }
  ])

  assert.equal(errores[0].name, 'Pon un nombre.')
  assert.ok(errores[1].start_offset_days.includes('3650'))
  assert.equal(errores[2].due_offset_days, 'El vencimiento cae antes que el arranque.')
  assert.equal(errores[3], undefined, 'la fila correcta no se marca')
})

test('una tarea sin offsets no se marca: el null es valido', () => {
  const errores = validarFilas([
    { clave: 'a', name: 'Reporte', description: '', start_offset_days: '', due_offset_days: '', priority: '2', task_type_id: '' }
  ])

  assert.deepEqual(errores, {})
})

test('un offset que no es un numero se marca en vez de guardarse como cero', () => {
  const fila = { clave: 'a', name: 'Reporte', description: '', start_offset_days: 'abc', due_offset_days: '', priority: '2', task_type_id: '' }

  assert.deepEqual(validarFilas([fila]), { 0: { start_offset_days: 'Escribe un número de días.' } })
  // Y si alguien se saltara la validacion, cae en el null del contrato y nunca en el dia del arranque.
  assert.equal(tareasParaGuardar([fila])[0].start_offset_days, null)
})

test('los details del 422 se reparten por posicion y salen ya traducidos', () => {
  const porFila = erroresDeTareas({
    'tasks.0.name': ['required'],
    'tasks.2.due_offset_days': ['anterior_al_inicio'],
    name: ['required']
  })

  assert.equal(porFila[0].name, 'Pon un nombre.')
  assert.equal(porFila[2].due_offset_days, 'El vencimiento cae antes que el arranque.')
  assert.equal(porFila[1], undefined)
  // La clave que no habla de una tarea queda afuera: la pinta el parrafo al pie, no una fila.
  assert.equal(Object.keys(porFila).length, 2)
})

test('un motivo desconocido se muestra legible en vez de con guiones bajos', () => {
  assert.equal(textoDeMotivo('motivo_nuevo_del_backend'), 'motivo nuevo del backend')
})

test('la vista previa cuenta SIEMPRE desde el inicio del hito, tambien el vencimiento', () => {
  const previstas = previsualizarTareas('2026-01-05', '2026-02-05', TAREAS)

  assert.deepEqual(
    previstas.map((tarea) => [tarea.inicio, tarea.vence]),
    [
      ['2026-01-05', '2026-01-11'],
      ['2026-01-12', '2026-01-18'],
      ['2026-01-19', '2026-01-25'],
      ['2026-01-26', '2026-02-01']
    ]
  )
  assert.equal(previstas[0].prioridad, 'Media')
})

test('el offset null cae en la fecha del hito que le corresponde', () => {
  const [tarea] = previsualizarTareas('2026-01-05', '2026-02-05', [
    { ...TAREAS[0], start_offset_days: null, due_offset_days: null }
  ])

  assert.equal(tarea.inicio, '2026-01-05', 'sin arranque declarado, empieza con el hito')
  assert.equal(tarea.vence, '2026-02-05', 'sin vencimiento declarado, vence con el hito')
})

test('un vencimiento anterior al arranque se aplana al arranque, como hace el backend', () => {
  const [tarea] = previsualizarTareas('2026-01-05', '2026-01-10', [
    { ...TAREAS[0], start_offset_days: 30, due_offset_days: null }
  ])

  assert.equal(tarea.inicio, '2026-02-04')
  assert.equal(tarea.vence, '2026-02-04')
})

test('sin fecha de inicio del hito no hay ancla y la vista previa lo dice con null', () => {
  const previstas = previsualizarTareas('', '2026-02-05', TAREAS)

  assert.ok(previstas.every((tarea) => tarea.inicio === null))
})

test('nombreDePrioridad no inventa: un valor fuera de escala se muestra crudo', () => {
  assert.equal(nombreDePrioridad(4), 'Urgente')
  assert.equal(nombreDePrioridad(9), '9')
})
