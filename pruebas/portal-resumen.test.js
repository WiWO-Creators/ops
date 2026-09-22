/**
 * Pruebas del lector del dashboard del cliente.
 *
 * Lo que se prueba no es maquetado: es la diferencia entre "cero" y "no se sabe". `GET
 * /portal/resumen` no manda la clave `proximos_dias` cuando ningun Proyecto comparte su lista de
 * Tareas, y si la pantalla tradujera eso a una lista vacia le estaria diciendo al cliente "no tenes
 * nada por vencer" sobre algo que nadie miro.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVO_SIN_PROXIMOS_DIAS,
  leerProximosDias,
  leerTickets,
  ordenarEstados
} from '../src/componentes/portal/resumen.ts'

test('el desglose se ordena por el catalogo y no por como llego', () => {
  const estados = [
    { status: 4, name: 'Terminado', color: '#22c55e', order: 100, total: 1 },
    { status: 2, name: 'En progreso', color: '#3b82f6', order: 2, total: 5 },
    { status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 0 }
  ]

  assert.deepEqual(ordenarEstados(estados).map((e) => e.status), [1, 2, 4])
})

test('ordenar no muta el arreglo de la respuesta', () => {
  // El mismo resumen lo leen varios bloques: ordenarlo en el lugar cambiaria lo que ven los demas.
  const estados = [
    { status: 4, name: 'Terminado', color: '#22c55e', order: 100, total: 1 },
    { status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 0 }
  ]

  ordenarEstados(estados)

  assert.deepEqual(estados.map((e) => e.status), [4, 1])
})

test('los estados en cero se conservan', () => {
  // La API los manda siempre para que la fila de insignias no cambie de forma segun el cliente.
  const estados = [
    { status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 0 },
    { status: 2, name: 'En progreso', color: '#3b82f6', order: 2, total: 3 }
  ]

  assert.equal(ordenarEstados(estados).length, 2)
})

/**
 * Una fila del bloque «Hoy», con lo minimo para reconocerla en las aserciones.
 *
 * @param campos lo que la prueba quiere fijar; el resto sale del molde
 * @returns la fila lista para meter en un tramo
 */
function fila (campos) {
  return {
    id: 1,
    name: 'Revisar guion',
    due_date: '2026-09-24',
    status: { id: 4, name: 'En progreso', color: '#3b82f6' },
    project: { id: 88, name: 'Campaña primavera' },
    espera_tu_respuesta: false,
    en_progreso: false,
    ...campos
  }
}

test('la clave de proximos dias que no vino no es "no tenes nada por vencer"', () => {
  // Es la misma puerta que `procesos`: sin ningun Proyecto que comparta su lista de Tareas no hay
  // de donde sacar vencimientos, y afirmar que no hay ninguno seria tranquilizar sobre lo que
  // nadie miro.
  assert.deepEqual(leerProximosDias(undefined), { clase: 'no_se_sabe' })
  assert.deepEqual(leerProximosDias(null), { clase: 'no_se_sabe' })
})

test('con la clave presente y los tramos vacios, la afirmacion si es legitima', () => {
  const lectura = leerProximosDias({ vencido: [], hoy: [], proximo: [], total: 0 })

  assert.deepEqual(lectura, { clase: 'sin_vencimientos', restantes: 0 })
})

test('sin vencimientos cercanos, lo que queda abierto se cuenta igual', () => {
  const lectura = leerProximosDias({ vencido: [], hoy: [], proximo: [], total: 7 })

  assert.deepEqual(lectura, { clase: 'sin_vencimientos', restantes: 7 })
})

test('los tramos salen en orden de urgencia y sin los vacios', () => {
  const lectura = leerProximosDias({
    vencido: [fila({ id: 1 })],
    hoy: [fila({ id: 2 }), fila({ id: 3 })],
    proximo: [],
    total: 3
  })

  assert.equal(lectura.clase, 'tramos')
  assert.deepEqual(lectura.grupos.map((grupo) => grupo.tramo), ['vencido', 'hoy'])
  assert.deepEqual(lectura.grupos.map((grupo) => grupo.etiqueta), ['Vencidas', 'Hoy'])
})

test('lo que vence despues de hoy no se lista y se cuenta como restante', () => {
  const lectura = leerProximosDias({
    vencido: [],
    hoy: [],
    proximo: [fila({ id: 2 }), fila({ id: 3 })],
    total: 2
  })

  assert.deepEqual(lectura, { clase: 'sin_vencimientos', restantes: 2 })
})

test('lo que el servidor no listo se anuncia con su numero', () => {
  // El servidor recorta cada tramo y ademas hay trabajo que vence despues de hoy. Sin este numero,
  // un cliente con cuarenta Tareas abiertas veria dos y creeria que son todas.
  const lectura = leerProximosDias({
    vencido: [fila({ id: 1 })],
    hoy: [fila({ id: 2 })],
    proximo: [fila({ id: 3 })],
    total: 40
  })

  assert.equal(lectura.restantes, 38)
})

test('un total ilegible no dibuja un "y NaN mas"', () => {
  const lectura = leerProximosDias({ vencido: [fila({ id: 1 })], hoy: [], proximo: [], total: null })

  assert.equal(lectura.restantes, 0)
})

test('un total menor que lo listado no da un numero negativo', () => {
  const lectura = leerProximosDias({
    vencido: [fila({ id: 1 }), fila({ id: 2 })],
    hoy: [],
    proximo: [],
    total: 1
  })

  assert.equal(lectura.restantes, 0)
})

test('el orden dentro del tramo es el del servidor y no se toca', () => {
  // El servidor pone primero lo que espera al cliente, despues lo que el equipo mueve, y recien
  // ahi por fecha. Reordenar aca un recorte del servidor mentiria sobre lo que quedo afuera.
  const filas = [
    fila({ id: 9, espera_tu_respuesta: true, due_date: '2026-09-30' }),
    fila({ id: 8, en_progreso: true, due_date: '2026-09-25' }),
    fila({ id: 7, due_date: '2026-09-22' })
  ]

  const lectura = leerProximosDias({ vencido: [], hoy: filas, proximo: [], total: 3 })

  assert.deepEqual(lectura.grupos[0].filas.map((f) => f.id), [9, 8, 7])
  assert.notEqual(lectura.grupos[0].filas, filas)
})

test('un tramo que no es lista se lee como tramo vacio y no rompe la pantalla', () => {
  const lectura = leerProximosDias({ vencido: null, hoy: [fila({ id: 1 })], proximo: undefined, total: 1 })

  assert.equal(lectura.clase, 'tramos')
  assert.deepEqual(lectura.grupos.map((grupo) => grupo.tramo), ['hoy'])
})

test('el motivo de los proximos dias explica la ausencia y no la disfraza de cero', () => {
  assert.equal(typeof MOTIVO_SIN_PROXIMOS_DIAS, 'string')
  assert.equal(MOTIVO_SIN_PROXIMOS_DIAS.trim().length > 0, true)
  assert.equal(MOTIVO_SIN_PROXIMOS_DIAS.includes('0'), false)
})

/**
 * Un ticket del resumen, con lo minimo para reconocerlo.
 *
 * @param campos lo que la prueba quiere fijar
 * @returns el ticket listo para meter en `ultimos`
 */
function ticket (campos) {
  return {
    id: 41,
    subject: 'No puedo descargar el informe',
    status: { id: 1, name: 'Abierto', color: '#0284c7' },
    last_reply: '2026-09-20 14:02:00',
    project: { id: 88, name: 'Campaña primavera' },
    ...campos
  }
}

test('sin la seccion de soporte no se dibuja nada, ni siquiera el hueco', () => {
  // Es la excepcion a la regla del hueco: un "no podemos decirte cuantos tickets tenes" sobre una
  // seccion que el contacto no ve en el menu es ruido, no informacion.
  assert.deepEqual(leerTickets(undefined), { clase: 'sin_seccion' })
  assert.deepEqual(leerTickets(null), { clase: 'sin_seccion' })
})

test('con soporte habilitado y sin tickets, tampoco hay bloque', () => {
  const lectura = leerTickets({ abiertos: 0, esperando_tu_respuesta: 0, ultimos: [] })

  assert.deepEqual(lectura, { clase: 'sin_tickets' })
})

test('los tickets llegan con los dos contadores que la pantalla acentua', () => {
  const lectura = leerTickets({
    abiertos: 3,
    esperando_tu_respuesta: 1,
    ultimos: [ticket({ id: 41 }), ticket({ id: 42 })]
  })

  assert.equal(lectura.clase, 'tickets')
  assert.equal(lectura.abiertos, 3)
  assert.equal(lectura.esperando, 1)
  assert.deepEqual(lectura.filas.map((t) => t.id), [41, 42])
})

test('leer los tickets no toca el arreglo de la respuesta', () => {
  const ultimos = [ticket({})]

  assert.notEqual(leerTickets({ abiertos: 1, esperando_tu_respuesta: 0, ultimos }).filas, ultimos)
})

test('un contador de tickets ilegible cae en cero y no en NaN', () => {
  // Aca el 0 SI es aceptable, al reves que en `leerEspera`: las filas ya estan en pantalla y el
  // contador solo las acompaña, asi que degradarlo esconde un acento, no un hecho.
  const lectura = leerTickets({ abiertos: null, esperando_tu_respuesta: -4, ultimos: [ticket({})] })

  assert.equal(lectura.abiertos, 0)
  assert.equal(lectura.esperando, 0)
})
