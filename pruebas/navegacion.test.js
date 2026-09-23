/**
 * Pruebas del menu agrupado, la paleta de comandos, los fijados y el filtro de vencimiento de
 * "Mis Tareas".
 *
 * Lo que se protege: que el agrupado no cambie QUIEN ve que (solo reparte lo que llego), que haya una
 * sola seccion activa, que las cuatro principales salgan en el orden del contrato con la barra de
 * movil, que la paleta no ofrezca atajos de secciones que el menu no tiene, y que los filtros "Hoy"
 * y "Vencidas" digan lo mismo que los tramos del Inicio.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparSecciones, seccionActiva, HREFS_PRINCIPALES } from '../src/lib/navegacion.ts'
import { aplanar, comandosDeNavegacion, gruposDePaleta, moverActivo, normalizar } from '../src/componentes/paleta/comandos.ts'
import { estaFijado, hrefDeElemento, priorizarFijados } from '../src/componentes/fijados/fijados.ts'
import {
  conFiltroDeVencimiento, consultaDeVencimiento, diasHastaElDomingo, filtroDeVencimiento
} from '../src/dominio/mis-tareas.ts'
import { estadoVencimiento, sumarDias, hoyLocal } from '../src/lib/fechas.ts'

const s = (href, grupo, extra = {}) => ({ href, etiqueta: href.slice(1), icono: 'inicio', grupo, ...extra })

const COMPLETO = [
  s('/inicio', 'principal'), s('/live', 'principal'), s('/mis-tareas', 'principal'),
  s('/procesos', 'operacion'), s('/procesos/recurrentes', 'operacion'), s('/proyectos', 'principal'),
  s('/prospectos', 'comercial'), s('/salas', 'operacion', { plegable: 'reuniones' }),
  s('/teletrabajo', 'operacion', { plegable: 'reuniones' }), s('/clientes', 'comercial'),
  s('/equipo', 'equipo'), s('/administracion', 'administracion')
]

test('las principales salen en el orden del contrato con la barra de movil', () => {
  const { principales } = agruparSecciones(COMPLETO)
  assert.deepEqual(principales.map((p) => p.href), [...HREFS_PRINCIPALES])
})

test('los bloques salen en orden, con los plegables aparte y sin perder ni sumar secciones', () => {
  const { principales, bloques } = agruparSecciones(COMPLETO)
  assert.deepEqual(bloques.map((b) => b.id), ['operacion', 'comercial', 'equipo', 'administracion'])
  const operacion = bloques[0]
  assert.deepEqual(operacion.secciones.map((x) => x.href), ['/procesos', '/procesos/recurrentes'])
  assert.deepEqual(operacion.plegables.map((p) => [p.id, p.secciones.map((x) => x.href)]), [['reuniones', ['/salas', '/teletrabajo']]])
  const todas = [...principales, ...bloques.flatMap((b) => [...b.secciones, ...b.plegables.flatMap((p) => p.secciones)])]
  assert.equal(todas.length, COMPLETO.length, 'el agrupado no esconde ni inventa secciones')
})

test('un bloque sin secciones no aparece, y sin Proyectos no hay principal de Proyectos', () => {
  const minimo = COMPLETO.filter((x) => !['/equipo', '/administracion', '/proyectos'].includes(x.href))
  const { principales, bloques } = agruparSecciones(minimo)
  assert.deepEqual(bloques.map((b) => b.id), ['operacion', 'comercial'])
  assert.deepEqual(principales.map((p) => p.href), ['/inicio', '/mis-tareas', '/live'])
  assert.deepEqual(agruparSecciones([]), { principales: [], bloques: [] })
})

test('una sola seccion activa: gana la coincidencia mas larga, por segmento y con alias', () => {
  const hrefs = COMPLETO.map((x) => x.href)
  assert.equal(seccionActiva(hrefs, '/procesos/recurrentes'), '/procesos/recurrentes')
  assert.equal(seccionActiva(hrefs, '/procesos/tablero'), '/procesos')
  assert.equal(seccionActiva(hrefs, '/clientes-potenciales'), null)
  assert.equal(seccionActiva(hrefs, '/licitaciones/5'), '/prospectos')
  assert.equal(seccionActiva([...hrefs, '/proyectos/12'], '/proyectos/12'), '/proyectos/12', 'un fijado gana a su seccion')
  assert.equal(seccionActiva(hrefs, '/'), null)
})

const ATAJOS = [
  { etiqueta: 'Tablero de tareas', href: '/procesos/tablero', icono: 'tablero', requiere: '/procesos', sinonimos: ['kanban'] },
  { etiqueta: 'Soporte', href: 'https://x', icono: 'soporte', requiere: null, externo: true }
]

test('la paleta no ofrece atajos de secciones que el menu no tiene', () => {
  const sinTareas = COMPLETO.filter((x) => x.href !== '/procesos')
  assert.ok(!comandosDeNavegacion(sinTareas, ATAJOS, '').some((c) => c.href === '/procesos/tablero'))
  assert.ok(comandosDeNavegacion(COMPLETO, ATAJOS, '').some((c) => c.href === '/procesos/tablero'))
})

test('filtrar por texto: sin tildes, sinonimos y empieza-con primero', () => {
  assert.equal(normalizar('  Administración  '), 'administracion')
  const r = comandosDeNavegacion(COMPLETO, ATAJOS, 'kanb')
  assert.deepEqual(r.map((c) => c.href), ['/procesos/tablero'])
  const pro = comandosDeNavegacion(COMPLETO, ATAJOS, 'pro').map((c) => c.href)
  assert.ok(pro.indexOf('/procesos') < pro.indexOf('/mis-tareas') || !pro.includes('/mis-tareas'))
  assert.deepEqual(comandosDeNavegacion(COMPLETO, ATAJOS, 'zzzz'), [])
})

test('vacia muestra recientes, fijados y secciones; con texto, secciones y busqueda', () => {
  const elemento = { type: 'project', id: 3, name: 'Web', client: { id: 1, company: 'Acme' } }
  const vacia = gruposDePaleta({ consulta: '', secciones: COMPLETO, atajos: ATAJOS, recientes: [elemento], fijados: [elemento], resultados: null })
  assert.deepEqual(vacia.map((g) => g.id), ['recientes', 'fijados', 'ir'])
  const ids = aplanar(vacia).map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length, 'ids unicos para aria-activedescendant')

  const conTexto = gruposDePaleta({
    consulta: 'web',
    secciones: COMPLETO,
    atajos: ATAJOS,
    recientes: [],
    fijados: [],
    resultados: {
      tasks: { items: [{ id: 7, name: 'Web home', project: null }, { id: 8, name: 'Web 2', project: { id: 3, name: 'Web' } }] },
      projects: { items: [{ id: 3, name: 'Web', client: { company: 'Acme' } }] },
      clients: { items: [] }
    }
  })
  assert.deepEqual(conTexto.map((g) => g.id), ['tareas', 'proyectos'])
  assert.equal(conTexto[0].comandos[0].href, '/procesos?tarea=7')
  assert.equal(conTexto[0].comandos[1].href, '/proyectos/3?tab=tareas&tarea=8')
})

test('el teclado da la vuelta con las flechas y no se rompe sin opciones', () => {
  assert.equal(moverActivo(2, 3, 'ArrowDown'), 0)
  assert.equal(moverActivo(0, 3, 'ArrowUp'), 2)
  assert.equal(moverActivo(-1, 3, 'ArrowDown'), 0)
  assert.equal(moverActivo(1, 3, 'End'), 2)
  assert.equal(moverActivo(1, 3, 'Home'), 0)
  assert.equal(moverActivo(0, 0, 'ArrowDown'), -1)
})

test('fijados: enlaces, pertenencia y prioridad en "Mis proyectos"', () => {
  assert.equal(hrefDeElemento({ type: 'client', id: 4 }), '/clientes/4')
  assert.ok(estaFijado([{ type: 'project', id: 1 }], 'project', 1))
  assert.ok(!estaFijado([{ type: 'project', id: 1 }], 'client', 1))

  const propios = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const completos = [{ id: 9 }, { id: 2 }]
  const filas = priorizarFijados(propios, completos, [9, 2, 404], 4)
  assert.deepEqual(filas.map((f) => [f.espacio.id, f.fijado]), [[9, true], [2, true], [1, false], [3, false]])
  assert.deepEqual(priorizarFijados(propios, [], [], 2).map((f) => f.espacio.id), [1, 2])
  assert.deepEqual(priorizarFijados([], [], [], 5), [])
})

test('el filtro de vencimiento se lee y se escribe en la URL sin tocar lo demas', () => {
  assert.equal(filtroDeVencimiento(new URLSearchParams('vence=hoy')), 'hoy')
  assert.equal(filtroDeVencimiento(new URLSearchParams('vence=cualquiera')), 'todas')
  assert.equal(filtroDeVencimiento(new URLSearchParams('')), 'todas')
  const con = conFiltroDeVencimiento(new URLSearchParams('completadas=1'), 'vencidas')
  assert.equal(con.toString(), 'completadas=1&vence=vencidas')
  assert.equal(conFiltroDeVencimiento(con, 'todas').toString(), 'completadas=1')
})

/** Interpreta el fragmento de la API sobre una fecha, como lo haria `Consulta` del board. */
function cumple (consulta, fecha) {
  if (consulta === null) return true
  return new URLSearchParams(consulta).entries().every(([clave, valor]) => {
    if (clave === 'filter[due_date__not_empty]') return fecha !== null
    if (fecha === null) return false
    if (clave === 'filter[due_date]') return fecha === valor
    if (clave === 'filter[due_date__lt]') return fecha < valor
    if (clave === 'filter[due_date__gte]') return fecha >= valor
    if (clave === 'filter[due_date__lte]') return fecha <= valor
    throw new Error(`clave inesperada ${clave}`)
  })
}

test('"Hoy" y "Vencidas" son exactamente los tramos del Inicio', () => {
  for (const hoy of [new Date(2026, 8, 23), new Date(2026, 8, 27), new Date(2026, 11, 31, 23, 30)]) {
    const base = hoyLocal(hoy)
    for (let d = -40; d <= 40; d++) {
      const fecha = sumarDias(base, d)
      assert.equal(cumple(consultaDeVencimiento('vencidas', hoy), fecha), estadoVencimiento(fecha, hoy) === 'vencido', `vencidas ${fecha}`)
      assert.equal(cumple(consultaDeVencimiento('hoy', hoy), fecha), estadoVencimiento(fecha, hoy) === 'hoy', `hoy ${fecha}`)
    }
    assert.equal(cumple(consultaDeVencimiento('vencidas', hoy), null), false, 'sin fecha no es vencida')
  }
})

test('"Esta semana" va de hoy al domingo, y "Todas" no filtra', () => {
  assert.equal(diasHastaElDomingo(new Date(2026, 8, 21)), 6, 'lunes')
  assert.equal(diasHastaElDomingo(new Date(2026, 8, 27)), 0, 'domingo')
  const miercoles = new Date(2026, 8, 23)
  assert.equal(consultaDeVencimiento('semana', miercoles), 'filter[due_date__gte]=2026-09-23&filter[due_date__lte]=2026-09-27')
  assert.equal(consultaDeVencimiento('todas', miercoles), null)
})
