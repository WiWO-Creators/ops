/**
 * Pruebas del resumen del Inicio.
 *
 * Las dos piezas que se prueban fallan en silencio, que es la unica razon por la que valen una
 * prueba. Una cola rota **muestra el resumen recortado** —no lanza, no avisa: simplemente se come el
 * final del texto—, y un motivo de bloqueo mal deducido **habilita el boton cuando no corresponde**,
 * que se paga con un 429 en la cara de la persona.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearCola, motivoDeBloqueo } from '../src/dominio/ia-resumen.ts'

/** Un bloque `regeneracion` del contrato, con lo que haga falta pisado. */
const regeneracion = (cambios) => ({
  restantes_hoy: 2,
  puede_ahora: true,
  disponible_desde: null,
  motivo: null,
  ...cambios
})

/** Vacia la cola llamando a `drenar()` hasta que no queda nada, y devuelve lo entregado y los ticks. */
function drenarTodo (cola) {
  let texto = ''
  let ticks = 0

  while (!cola.terminada) {
    texto += cola.drenar()
    ticks += 1
  }

  return { texto, ticks }
}

// ---------------------------------------------------------------------------
// motivoDeBloqueo
// ---------------------------------------------------------------------------

test('sin bloqueo cuando el backend dice que se puede', () => {
  assert.equal(motivoDeBloqueo(regeneracion()), null)
})

test('el backend siempre gana: puede_ahora manda aunque no queden generaciones', () => {
  // Un backend que se contradice no puede convertirse en un boton deshabilitado inventado aca.
  const contradictorio = regeneracion({ puede_ahora: true, restantes_hoy: 0, motivo: 'cupo' })

  assert.equal(motivoDeBloqueo(contradictorio), null)
})

test('sin cupo, la frase manda a mañana', () => {
  const sinCupo = regeneracion({ puede_ahora: false, restantes_hoy: 0, motivo: 'cupo' })

  assert.equal(motivoDeBloqueo(sinCupo), 'Ya lo regeneraste dos veces hoy. Vuelve mañana.')
})

test('en espera, la frase dice cuando vuelve a estar disponible', () => {
  const ahora = new Date('2026-09-04T10:00:00Z')
  const enEspera = regeneracion({
    puede_ahora: false,
    restantes_hoy: 1,
    motivo: 'espera',
    disponible_desde: '2026-09-04T12:00:00Z'
  })

  assert.equal(motivoDeBloqueo(enEspera, ahora), 'Vas a poder regenerarlo dentro de 2 horas.')
})

test('sin motivo declarado, el cupo restante decide cual de las dos frases va', () => {
  const ahora = new Date('2026-09-04T10:00:00Z')
  const conCupo = regeneracion({
    puede_ahora: false,
    restantes_hoy: 1,
    disponible_desde: '2026-09-04T13:00:00Z'
  })
  const agotado = regeneracion({ puede_ahora: false, restantes_hoy: 0 })

  assert.equal(motivoDeBloqueo(conCupo, ahora), 'Vas a poder regenerarlo dentro de 3 horas.')
  assert.equal(motivoDeBloqueo(agotado, ahora), 'Ya lo regeneraste dos veces hoy. Vuelve mañana.')
})

test('una espera sin instante no deja al boton mudo', () => {
  const roto = regeneracion({ puede_ahora: false, restantes_hoy: 1, motivo: 'espera' })

  assert.equal(motivoDeBloqueo(roto), 'Todavía no puedes regenerarlo.')
})

// ---------------------------------------------------------------------------
// crearCola
// ---------------------------------------------------------------------------

test('drena en orden y no pierde nada', () => {
  const cola = crearCola()

  cola.empujar('Hoy tenés tres tareas por vencer.')

  const { texto } = drenarTodo(cola)

  assert.equal(texto, 'Hoy tenés tres tareas por vencer.')
})

test('entrega de a tres caracteres', () => {
  const cola = crearCola()

  cola.empujar('abcdefg')

  assert.equal(cola.drenar(), 'abc')
  assert.equal(cola.drenar(), 'def')
  assert.equal(cola.drenar(), 'g')
  assert.equal(cola.drenar(), '')
})

test('no pierde el texto que llega despues de haber arrancado', () => {
  // Es el caso real: el stream sigue empujando deltas mientras el temporizador ya esta drenando.
  const cola = crearCola()

  cola.empujar('Hoy ')
  const primero = cola.drenar()
  cola.empujar('tenés tres tareas.')

  assert.equal(primero + cola.drenar() + drenarTodo(cola).texto, 'Hoy tenés tres tareas.')
})

test('la cola vacia se declara terminada y no se cuelga', () => {
  const cola = crearCola()

  assert.equal(cola.terminada, true)
  assert.equal(cola.pendiente, 0)
  assert.equal(cola.drenar(), '')

  cola.empujar('ab')
  assert.equal(cola.terminada, false)
  assert.equal(cola.pendiente, 2)
})

test('saltar vacia la cola de una', () => {
  const cola = crearCola()

  cola.empujar('Hoy tenés tres tareas por vencer.')
  cola.saltar()

  assert.equal(cola.drenar(), 'Hoy tenés tres tareas por vencer.')
  assert.equal(cola.terminada, true)
})

test('saltar sigue valiendo para lo que llegue despues', () => {
  // Saltar es una decision de la persona, no un vaciado puntual: lo que falta del stream tampoco
  // se escribe letra por letra.
  const cola = crearCola()

  cola.saltar()
  cola.empujar('lo que queda del stream')

  assert.equal(cola.drenar(), 'lo que queda del stream')
})

test('porTick Infinity pinta todo en un solo tick', () => {
  const cola = crearCola({ porTick: Infinity })

  cola.empujar('Sin movimiento, el texto sale completo.')

  const { texto, ticks } = drenarTodo(cola)

  assert.equal(texto, 'Sin movimiento, el texto sale completo.')
  assert.equal(ticks, 1)
})

test('no parte un caracter fuera del plano basico en dos mitades', () => {
  // 'a' + un caracter de 2 unidades UTF-16: cortar en 3 dejaria media mitad en pantalla.
  const cola = crearCola()

  cola.empujar('ab\u{1f680}cd')

  const primero = cola.drenar()

  assert.equal(primero, 'ab\u{1f680}')
  assert.equal(primero + drenarTodo(cola).texto, 'ab\u{1f680}cd')
})
