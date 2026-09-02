/**
 * Pruebas del alta rapida.
 *
 * Cubren las tres formas en que un parser asi arruina el dia de alguien: perder texto que se escribio,
 * asignarle la tarea a la persona equivocada por una coincidencia parcial, y correr un dia la fecha
 * relativa. Las tres pasan desapercibidas hasta que alguien pierde una entrega.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarAltaRapida } from '../src/dominio/alta-rapida.ts'

const CATALOGOS = {
  personas: [
    { id: 12, full_name: 'Franz Molina' },
    { id: 15, full_name: 'Ana Rivas' },
    { id: 18, full_name: 'Juan Pérez' },
    { id: 19, full_name: 'Juana Soto' }
  ],
  espacios: [
    { id: 8, name: 'Colbún' },
    { id: 9, name: 'Campaña Día del Niño' }
  ],
  prioridades: [
    { id: 1, name: 'Baja' },
    { id: 2, name: 'Media' },
    { id: 3, name: 'Alta' },
    { id: 4, name: 'Urgente' }
  ]
}

/** Un martes, para que los dias de la semana sean verificables a mano. */
const MARTES = new Date(2026, 8, 1, 10, 0, 0)

const leer = (texto) => interpretarAltaRapida(texto, CATALOGOS, MARTES)

test('el ejemplo del pedido se interpreta entero', () => {
  const r = leer('Grilla Colbún septiembre mañana @franz #Colbún !alta')

  assert.equal(r.name, 'Grilla Colbún septiembre')
  assert.equal(r.due_date, '2026-09-02')
  assert.deepEqual(r.assignees, [12])
  assert.equal(r.rel_type, 'project')
  assert.equal(r.rel_id, 8)
  assert.equal(r.priority, 3)
  assert.deepEqual(r.sinResolver, [])
})

test('sin ningun prefijo, todo el texto es el titulo', () => {
  const r = leer('Revisar el brief')

  assert.equal(r.name, 'Revisar el brief')
  assert.equal(r.due_date, null)
  assert.equal(r.rel_id, null, 'el Espacio queda vacio y se asigna despues')
  assert.deepEqual(r.assignees, [])
})

test('lo que no se resuelve NO se pierde: queda en el titulo y se declara', () => {
  const r = leer('Pedir presupuesto @nadie')

  assert.match(r.name, /@nadie/, 'el texto tiene que sobrevivir')
  assert.deepEqual(r.sinResolver, ['@nadie'])
  assert.deepEqual(r.assignees, [])
})

test('un nombre ambiguo no asigna a nadie', () => {
  // "Juan" coincide con Juan Pérez y con Juana Soto: elegir uno seria elegir mal la mitad de las veces.
  const r = leer('Llamar @juan')

  assert.deepEqual(r.assignees, [])
  assert.deepEqual(r.sinResolver, ['@juan'])
  assert.match(r.name, /@juan/)
})

test('el nombre exacto gana sobre el parcial', () => {
  const r = leer('Llamar @"Juan Pérez"')

  assert.deepEqual(r.assignees, [18])
  assert.deepEqual(r.sinResolver, [])
})

test('los acentos no importan para encontrar el Espacio', () => {
  assert.equal(leer('Post #colbun').rel_id, 8)
  assert.equal(leer('Post #Colbún').rel_id, 8)
})

test('un Espacio de varias palabras se escribe entre comillas', () => {
  const r = leer('Bajada #"Campaña Día del Niño"')

  assert.equal(r.rel_id, 9)
  assert.equal(r.name, 'Bajada')
})

test('hoy, mañana y pasado se resuelven contra la fecha dada', () => {
  assert.equal(leer('X hoy').due_date, '2026-09-01')
  assert.equal(leer('X mañana').due_date, '2026-09-02')
  assert.equal(leer('X manana').due_date, '2026-09-02', 'sin la eñe tambien')
  assert.equal(leer('X pasado').due_date, '2026-09-03')
})

test('un dia de la semana cae en su proxima ocurrencia', () => {
  // El 1/9/2026 es martes.
  assert.equal(leer('X viernes').due_date, '2026-09-04')
  assert.equal(leer('X lunes').due_date, '2026-09-07')
  assert.equal(leer('X martes').due_date, '2026-09-01', 'el mismo dia significa hoy')
})

test('la fecha corta usa el año en curso, o el siguiente si ya paso', () => {
  assert.equal(leer('X 30/9').due_date, '2026-09-30')
  assert.equal(leer('X 15/1').due_date, '2027-01-15', 'enero ya paso: es el del año que viene')
})

test('una fecha completa se toma tal cual', () => {
  assert.equal(leer('X 2027-03-08').due_date, '2027-03-08')
})

test('solo se toma la primera fecha; la segunda queda en el titulo', () => {
  const r = leer('Reunion hoy y mañana')

  assert.equal(r.due_date, '2026-09-01')
  assert.match(r.name, /mañana/)
})

test('un numero que no es fecha no se confunde con una', () => {
  const r = leer('Comprar 3 licencias')

  assert.equal(r.due_date, null)
  assert.equal(r.name, 'Comprar 3 licencias')
})

test('dos asignados y sin repetidos', () => {
  const r = leer('X @franz @"Ana Rivas" @franz')

  assert.deepEqual(r.assignees, [12, 15])
})

test('el titulo queda sin espacios dobles despues de sacar los prefijos', () => {
  const r = leer('Armar  parrilla @franz  !alta')

  assert.equal(r.name, 'Armar parrilla')
})
