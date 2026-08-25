/**
 * Logica de las pestañas del detalle de Proyecto.
 *
 * Lo que se prueba es lo que se rompe en silencio: el orden de las columnas del kanban de hitos, la
 * escala del grafico de horas, la geometria de las barras del Gantt y la validacion del formulario
 * generico. Todo eso vive en `.ts` justamente para poder recorrerlo desde aca.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avanceDeHito, cuerpoMoverHito, ordenarColumnasHitos } from '../src/componentes/proyecto/hitos.ts'
import { formatearImporte, segundosAHoraMinuto, textoPlano } from '../src/componentes/proyecto/formatos.ts'
import { altoDeTramo, maximoDelGrafico, textoDeDias } from '../src/componentes/proyecto/overview.ts'
import { barraDeGantt, diaDeFecha, rangoDeGantt } from '../src/componentes/proyecto/gantt.ts'
import {
  cuerpoDelFormulario,
  validarFormulario,
  valoresIniciales
} from '../src/componentes/proyecto/formulario.ts'

const paginacion = { page: 1, per_page: 20, total: 0, total_pages: 1 }

function grupo (id, order, cantidad) {
  return {
    columna: { id, name: `col-${id}`, color: null, order, total_logged_seconds: 0 },
    tarjetas: Array.from({ length: cantidad }, (_, i) => ({ id: id * 100 + i })),
    pagination: { ...paginacion, total: cantidad }
  }
}

test('ordenarColumnasHitos deja "Sin categorizar" primera aunque su order no sea el menor', () => {
  const ordenadas = ordenarColumnasHitos([grupo(3, 1, 2), grupo(0, 99, 1), grupo(5, 2, 1)])

  assert.deepEqual(ordenadas.map((g) => g.columna.id), [0, 3, 5])
})

test('ordenarColumnasHitos omite "Sin categorizar" cuando no tiene tareas', () => {
  const ordenadas = ordenarColumnasHitos([grupo(0, -1, 0), grupo(3, 1, 2)])

  assert.deepEqual(ordenadas.map((g) => g.columna.id), [3])
})

test('ordenarColumnasHitos ordena por order y no por id', () => {
  const ordenadas = ordenarColumnasHitos([grupo(9, 1, 1), grupo(2, 5, 1), grupo(7, 3, 1)])

  assert.deepEqual(ordenadas.map((g) => g.columna.id), [9, 7, 2])
})

test('ordenarColumnasHitos no muta el arreglo original', () => {
  const original = [grupo(5, 2, 1), grupo(3, 1, 1)]
  ordenarColumnasHitos(original)

  assert.deepEqual(original.map((g) => g.columna.id), [5, 3])
})

test('cuerpoMoverHito renombra columna a hito, que es lo que espera el endpoint', () => {
  const cuerpo = cuerpoMoverHito({ columna: 4, posicion: 2, columna_completa: [7, 9] })

  assert.deepEqual(cuerpo, { hito: 4, posicion: 2, columna_completa: [7, 9] })
})

test('avanceDeHito devuelve null sin tareas, para no pintar 0% donde no hay nada que medir', () => {
  assert.equal(avanceDeHito({ tasks: 0, tasks_done: 0 }), null)
  assert.equal(avanceDeHito({ tasks: 4, tasks_done: 1 }), 25)
})

test('segundosAHoraMinuto no usa dias: 30 horas son "30:05"', () => {
  assert.equal(segundosAHoraMinuto(108300), '30:05')
  assert.equal(segundosAHoraMinuto(0), '00:00')
  assert.equal(segundosAHoraMinuto(-5), '00:00')
})

test('formatearImporte devuelve el guion cuando no hay dato, nunca un cero inventado', () => {
  assert.equal(formatearImporte(null), '—')
  assert.equal(formatearImporte(Number.NaN), '—')
  assert.match(formatearImporte(1200, 'UF'), /^UF /)
})

test('maximoDelGrafico escala por el total del dia, no por la serie mas alta', () => {
  const grafico = {
    periodo: 'esta_semana',
    etiquetas: ['L', 'M'],
    series: [
      { clave: 'facturable', nombre: 'Facturable', valores: [2, 1] },
      { clave: 'no_facturado', nombre: 'No facturado', valores: [3, 0] }
    ]
  }

  assert.equal(maximoDelGrafico(grafico), 5)
})

test('maximoDelGrafico devuelve 0 cuando el periodo no tiene horas', () => {
  assert.equal(
    maximoDelGrafico({ periodo: 'este_mes', etiquetas: ['L'], series: [{ clave: 't', nombre: 'T', valores: [0] }] }),
    0
  )
})

test('altoDeTramo no divide por cero ni deja pasar valores raros', () => {
  assert.equal(altoDeTramo(2, 0), 0)
  assert.equal(altoDeTramo(undefined, 10), 0)
  assert.equal(altoDeTramo(5, 10), 50)
})

test('textoDeDias distingue sin plazo, vencido y en curso', () => {
  assert.equal(textoDeDias(null), '—')
  assert.equal(textoDeDias({ total: 27, left: -3, left_percent: 0 }), 'Vencido')
  assert.equal(textoDeDias({ total: 27, left: 12, left_percent: 44 }), '12 / 27')
})

test('diaDeFecha no corre la fecha un dia por interpretar la cadena en hora local', () => {
  assert.equal(diaDeFecha('1970-01-01'), 0)
  assert.equal(diaDeFecha('1970-01-11'), 10)
  assert.equal(diaDeFecha(null), null)
  assert.equal(diaDeFecha('no es fecha'), null)
})

const GRUPOS_GANTT = [
  {
    id: 'milestone-0',
    nombre: 'Sin categorizar',
    grupo: true,
    start: '2026-02-01',
    end: '2026-02-10',
    tareas: [
      { id: 1, name: 'A', start: '2026-02-01', end: '2026-02-05', progress: 0, status: 1, color: null },
      { id: 2, name: 'B', start: '2026-02-06', end: '2026-02-10', progress: 0, status: 1, color: null }
    ]
  }
]

test('rangoDeGantt cubre todas las fechas de grupos y tareas', () => {
  const rango = rangoDeGantt(GRUPOS_GANTT)

  assert.equal(rango.dias, 10)
  assert.equal(rango.inicio, diaDeFecha('2026-02-01'))
  assert.equal(rango.fin, diaDeFecha('2026-02-10'))
})

test('rangoDeGantt devuelve null cuando nada tiene fechas', () => {
  assert.equal(rangoDeGantt([{ id: 'g', nombre: 'g', grupo: true, start: null, end: null, tareas: [] }]), null)
})

test('barraDeGantt ubica la primera barra al inicio y la segunda a la mitad', () => {
  const rango = rangoDeGantt(GRUPOS_GANTT)

  assert.deepEqual(barraDeGantt('2026-02-01', '2026-02-05', rango), { izquierda: 0, ancho: 50 })
  assert.deepEqual(barraDeGantt('2026-02-06', '2026-02-10', rango), { izquierda: 50, ancho: 50 })
})

test('barraDeGantt dibuja un dia cuando solo hay una fecha, en vez de una barra invisible', () => {
  const rango = rangoDeGantt(GRUPOS_GANTT)
  const barra = barraDeGantt('2026-02-03', null, rango)

  assert.equal(barra.ancho, 10)
  assert.equal(barra.izquierda, 20)
})

test('barraDeGantt devuelve null sin ninguna fecha', () => {
  assert.equal(barraDeGantt(null, null, rangoDeGantt(GRUPOS_GANTT)), null)
})

const CAMPOS = [
  { clave: 'name', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 5 },
  { clave: 'due_date', etiqueta: 'Vence', tipo: 'fecha', min: '2026-01-01', max: '2026-12-31' },
  { clave: 'description', etiqueta: 'Descripción', tipo: 'area' },
  { clave: 'visible', etiqueta: 'Visible', tipo: 'booleano' },
  { clave: 'order', etiqueta: 'Orden', tipo: 'numero' }
]

test('validarFormulario reclama los requeridos vacios', () => {
  const errores = validarFormulario(CAMPOS, { name: '   ' })

  assert.ok(errores.name)
})

test('validarFormulario acota fechas y longitudes', () => {
  assert.ok(validarFormulario(CAMPOS, { name: 'ok', due_date: '2025-12-31' }).due_date)
  assert.ok(validarFormulario(CAMPOS, { name: 'ok', due_date: '2027-01-01' }).due_date)
  assert.ok(validarFormulario(CAMPOS, { name: 'ok', due_date: '01/01/2026' }).due_date)
  assert.ok(validarFormulario(CAMPOS, { name: 'demasiado' }).name)
  assert.ok(validarFormulario(CAMPOS, { name: 'ok', order: 'x' }).order)
})

test('validarFormulario no reclama nada cuando el formulario esta bien', () => {
  assert.deepEqual(validarFormulario(CAMPOS, { name: 'ok', due_date: '2026-06-01', order: '3' }), {})
})

test('cuerpoDelFormulario manda null y no cadena vacia en lo opcional', () => {
  const cuerpo = cuerpoDelFormulario(CAMPOS, { name: 'ok', description: '', visible: true, order: '3' })

  assert.equal(cuerpo.description, null)
  assert.equal(cuerpo.visible, true)
  assert.equal(cuerpo.order, 3)
  assert.equal(cuerpo.name, 'ok')
})

test('valoresIniciales siembra el formulario desde un registro existente', () => {
  const valores = valoresIniciales(CAMPOS, { name: 'Hito', due_date: '2026-06-01', description: null, visible: true })

  assert.equal(valores.name, 'Hito')
  assert.equal(valores.description, '')
  assert.equal(valores.visible, true)
  assert.equal(valores.order, '')
})

test('textoPlano traduce los <br /> del panel a saltos de linea, sin interpretarlos como HTML', () => {
  assert.equal(textoPlano('uno<br />dos<BR>tres'), 'uno\ndos\ntres')
  assert.equal(textoPlano(null), '')
})
