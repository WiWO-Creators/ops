/**
 * Pruebas de la fecha de cierre de una Tarea.
 *
 * Lo que se verifica es la traduccion entre el `<input type="date">` —un dia sin hora— y el
 * `completed_at` del contrato —un instante ISO con zona—. Es la unica pieza de la feature que se
 * rompe en silencio: una hora mal inventada vuelve como `422 futura`, y un ISO sin zona como
 * `422 invalid`, sin que nada en pantalla explique por que.
 *
 * Los tres rechazos del endpoint los decide el backend y no se replican aca: repetir su regla daria
 * dos verdades sobre la misma fecha.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaDeCierre, instanteDeCierre } from '../src/dominio/cierre-tarea.ts'
import { mensajeConDetalles } from '../src/datos/errores.ts'

test('el dia de hoy cierra con el instante actual, no con una hora inventada', () => {
  const ahora = new Date(2026, 8, 7, 10, 30, 0)

  assert.equal(instanteDeCierre('2026-09-07', ahora), ahora.toISOString())
})

test('un dia anterior cierra al mediodia local, lejos de los dos bordes del dia', () => {
  const ahora = new Date(2026, 8, 7, 10, 30, 0)
  const resultado = instanteDeCierre('2026-09-04', ahora)

  assert.notEqual(resultado, null)

  const instante = new Date(resultado)

  assert.equal(instante.getFullYear(), 2026)
  assert.equal(instante.getMonth(), 8)
  assert.equal(instante.getDate(), 4)
  assert.equal(instante.getHours(), 12)
  assert.ok(instante < ahora, 'un dia pasado nunca puede quedar adelante del reloj')
  // Doce horas de margen a cada lado: un reloj corrido en el servidor no puede empujar el cierre al
  // dia de al lado, que es lo que hacia que la ficha mostrara una fecha que nadie eligio.
  assert.equal(new Date(instante.getTime() - 11 * 3600 * 1000).getDate(), 4)
  assert.equal(new Date(instante.getTime() + 11 * 3600 * 1000).getDate(), 4)
})

test('siempre lleva zona: es lo que el contrato exige y lo que un ISO pelado no trae', () => {
  const ahora = new Date(2026, 8, 7, 10, 30, 0)

  assert.match(instanteDeCierre('2026-09-04', ahora), /Z$|[+-]\d{2}:\d{2}$/)
})

test('un dia futuro se manda tal cual: quien lo rechaza es la API, no la pantalla', () => {
  const ahora = new Date(2026, 8, 7, 10, 30, 0)
  const resultado = instanteDeCierre('2026-09-20', ahora)

  assert.ok(new Date(resultado) > ahora)
})

test('lo que no es una fecha del contrato no se manda', () => {
  const ahora = new Date(2026, 8, 7, 10, 30, 0)

  assert.equal(instanteDeCierre('', ahora), null)
  assert.equal(instanteDeCierre('07/09/2026', ahora), null)
  assert.equal(instanteDeCierre('2026-9-7', ahora), null)
  // El 31 de febrero no existe y `new Date` lo rueda al 3 de marzo sin avisar.
  assert.equal(instanteDeCierre('2026-02-31', ahora), null)
})

test('el cierre que llego de la API vuelve al control como el dia local', () => {
  const instante = new Date(2026, 8, 4, 23, 59, 59).toISOString()

  assert.equal(fechaDeCierre(instante), '2026-09-04')
  assert.equal(fechaDeCierre('2026-09-04'), '2026-09-04')
})

test('una tarea sin cerrar deja el control vacio, no en una fecha inventada', () => {
  assert.equal(fechaDeCierre(null), '')
  assert.equal(fechaDeCierre(undefined), '')
  assert.equal(fechaDeCierre(''), '')
  assert.equal(fechaDeCierre('lo que sea'), '')
})

test('los tres rechazos del contrato se leen en castellano', () => {
  const legible = (motivo) => mensajeConDetalles({
    message: 'Hay campos que no se pueden guardar.',
    details: { completed_at: [motivo] }
  })

  assert.match(legible('no_completado'), /Fecha de cierre solo se puede corregir/)
  assert.match(legible('futura'), /Fecha de cierre no puede ser posterior a ahora/)
  assert.match(legible('anterior_al_inicio'), /Fecha de cierre es anterior a la fecha de inicio/)
})
