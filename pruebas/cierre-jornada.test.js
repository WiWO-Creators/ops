/**
 * Pruebas del reparto de tiempo del modal de cierre.
 *
 * Lo que se rompe en silencio aca no lanza ningun error: deja a alguien confirmando el cierre de su
 * dia sobre un reparto que no cuadra. Una linea que se pierde al agrupar es tiempo que desaparece de
 * la pantalla pero no de la base; un total de grupo que no suma sus lineas reparte mal las horas del
 * dia entre los Proyectos; y un orden que depende del backend hace saltar de lugar los grupos justo
 * despues de agregar una Tarea, que es cuando la persona los esta leyendo.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparCierre, nombreDeItem, segundosDeItem } from '../src/dominio/cierre-jornada.ts'

/** Una linea del resumen. Por defecto cuelga del Espacio 13 y no esta corriendo. */
const item = (extra = {}) => ({
  project: { id: 13, name: '70 años - Linkedin' },
  task: { id: 2755, name: 'Guion' },
  seconds: 3600,
  corriendo: false,
  ...extra
})

test('la lista vacía no da grupos', () => {
  assert.deepEqual(agruparCierre([]), [])
})

test('las líneas del mismo Espacio caen en un solo grupo y sus segundos se suman', () => {
  const grupos = agruparCierre([
    item({ task: { id: 1, name: 'Guion' }, seconds: 5400 }),
    item({ task: { id: 2, name: 'Montaje' }, seconds: 1800 })
  ])

  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].espacioId, 13)
  assert.equal(grupos[0].items.length, 2)
  assert.equal(grupos[0].segundos, 7200)
})

test('ningún item se pierde al agrupar', () => {
  const items = [
    item({ project: { id: 1, name: 'Uno' } }),
    item({ project: { id: 2, name: 'Dos' } }),
    item({ project: { id: 1, name: 'Uno' } }),
    item({ project: null, task: { id: 9, name: 'Suelta' } })
  ]

  const total = agruparCierre(items).reduce((suma, grupo) => suma + grupo.items.length, 0)

  assert.equal(total, items.length)
})

test('los grupos van de más tiempo a menos y el que no tiene Espacio queda último', () => {
  const grupos = agruparCierre([
    item({ project: null, task: { id: 9, name: 'Suelta' }, seconds: 99999 }),
    item({ project: { id: 1, name: 'Poco' }, seconds: 600 }),
    item({ project: { id: 2, name: 'Mucho' }, seconds: 7200 })
  ])

  assert.deepEqual(grupos.map((grupo) => grupo.nombre), ['Mucho', 'Poco', 'Sin proyecto'])
})

test('a igualdad de tiempo los grupos se ordenan alfabéticamente, no por orden de llegada', () => {
  const grupos = agruparCierre([
    item({ project: { id: 1, name: 'Zeta' }, seconds: 1800 }),
    item({ project: { id: 2, name: 'Alfa' }, seconds: 1800 })
  ])

  assert.deepEqual(grupos.map((grupo) => grupo.nombre), ['Alfa', 'Zeta'])
})

test('dentro del grupo las Tareas también van de más tiempo a menos', () => {
  const [grupo] = agruparCierre([
    item({ task: { id: 1, name: 'Corta' }, seconds: 600 }),
    item({ task: { id: 2, name: 'Larga' }, seconds: 7200 }),
    item({ task: { id: 3, name: 'Media' }, seconds: 3600 })
  ])

  assert.deepEqual(grupo.items.map(nombreDeItem), ['Larga', 'Media', 'Corta'])
})

test('una línea sin Tarea se nombra con palabras, no con un hueco', () => {
  assert.equal(nombreDeItem(item({ task: null })), 'Sin tarea')
})

test('un tiempo imposible cuenta como cero en vez de contaminar la suma', () => {
  assert.equal(segundosDeItem(item({ seconds: -60 })), 0)
  assert.equal(segundosDeItem(item({ seconds: null })), 0)
  assert.equal(segundosDeItem(item({ seconds: 'dos horas' })), 0)

  const [grupo] = agruparCierre([item({ seconds: 3600 }), item({ task: null, seconds: null })])

  assert.equal(grupo.segundos, 3600)
})

test('el total del grupo es la suma de sus líneas', () => {
  const [grupo] = agruparCierre([
    item({ task: { id: 1, name: 'Una' }, seconds: 5400 }),
    item({ task: { id: 2, name: 'Otra' }, seconds: 1800 }),
    item({ task: { id: 3, name: 'Tercera' }, seconds: 900 })
  ])

  assert.equal(grupo.segundos, 8100)
})
