/**
 * El aviso de cierre de jornada y su prórroga: lo que se le dice a la persona cuando su "sigo
 * trabajando" no llega, y que el mock responda la ruta como lo hace la API.
 *
 * Los mensajes son lo que se rompe en silencio. Los tres códigos que esta petición puede devolver
 * significan acá lo contrario que en el resto de la jornada —el 404 es "tu día ya está cerrado" y
 * no "no existe", el 409 es "se apagó el cierre automático" y no "ya tienes una abierta"— así que
 * un mensaje reciclado del otro camino manda a la persona a arreglar algo que no pasó, en el único
 * momento del día en que le queda medio minuto para decidir.
 *
 * Y lo que se rompe callado del lado del mock es el instante del corte: si la prórroga se contara
 * desde ahora en vez de desde el corte vigente, quien conteste antes de tiempo no ganaría ni un
 * minuto y el aviso volvería a salirle en el acto, que es justo el bucle que la prórroga evita.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeDeFalloDeProrroga, mensajeDeFalloDeJornada } from '../src/dominio/live.ts'

test('sin respuesta del servidor el mensaje habla de la conexión, no de un código', () => {
  assert.match(mensajeDeFalloDeProrroga(0), /conexión/i)
  assert.doesNotMatch(mensajeDeFalloDeProrroga(0), /\d/)
})

test('el 404 dice que la jornada ya está cerrada, no que no existe', () => {
  const mensaje = mensajeDeFalloDeProrroga(404)

  assert.match(mensaje, /cerrada/i)
  // Y dice qué hacer: sin esto es un cartel que sólo niega.
  assert.match(mensaje, /ábrela/i)
})

test('el 409 nombra el interruptor, que es lo único que cambió', () => {
  assert.match(mensajeDeFalloDeProrroga(409), /cierre autom/i)
  assert.match(mensajeDeFalloDeProrroga(409), /apagado/i)
})

test('los mismos códigos dicen cosas distintas en la prórroga y en la jornada', () => {
  // Es el motivo entero de que sean dos funciones: reciclar el texto de la apertura pondría "ya
  // tienes una jornada abierta" encima de un aviso que existe porque la jornada está abierta.
  assert.notEqual(mensajeDeFalloDeProrroga(409), mensajeDeFalloDeJornada(409, true))
  assert.notEqual(mensajeDeFalloDeProrroga(409), mensajeDeFalloDeJornada(409, false))
})

test('cualquier otro código deja un mensaje útil con el número', () => {
  for (const codigo of [400, 403, 422, 500, 502]) {
    const mensaje = mensajeDeFalloDeProrroga(codigo)

    assert.ok(mensaje.length > 0)
    assert.match(mensaje, new RegExp(String(codigo)))
  }
})
