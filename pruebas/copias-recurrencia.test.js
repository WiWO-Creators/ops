/**
 * Pruebas de `src/dominio/copias-recurrencia.ts`: como se cuentan las copias de una recurrencia, el
 * aviso de sin uso y el cuerpo de la limpieza.
 *
 * Lo que se rompe sin avisar: acusar de "sin movimiento" a la copia de esta semana, borrar la vigente
 * porque arranco marcada, o esconder un motivo nuevo de la API como si la copia no se hubiera usado.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoDeSinUso, cuerpoDeLimpieza, estaSinUso, limpiezaAplicable, OPCIONES_DETENCION, reglaDeLaUrl, rutaDeCopias, rutaDeLimpieza,
  seleccionInicial, situacionDeCopia, textoDeConfirmacion, textoDeOmision, textosDeMotivos
} from '../src/dominio/copias-recurrencia.ts'

test('los motivos se dicen en castellano, y uno desconocido no se esconde', () => {
  assert.deepEqual(textosDeMotivos(['estado', 'comentario', 'tiempo', 'archivo', 'checklist', 'edicion']),
    ['Cambió de estado', 'Comentarios', 'Tiempo registrado', 'Archivos', 'Checklist', 'Editada'])
  assert.deepEqual(textosDeMotivos(['motivo_nuevo']), ['motivo nuevo'])
  assert.deepEqual(textosDeMotivos([]), [])
})

test('la situacion de una copia: papelera, en curso, con y sin movimiento', () => {
  assert.equal(situacionDeCopia({ deleted: true, evaluable: true, touched: false }).etiqueta, 'En papelera')
  assert.equal(situacionDeCopia({ deleted: false, evaluable: false, touched: false }).etiqueta, 'En curso')
  assert.equal(situacionDeCopia({ deleted: false, evaluable: false, touched: true }).etiqueta, 'En curso', 'En curso no se juzga')
  assert.equal(situacionDeCopia({ deleted: false, evaluable: true, touched: true }).etiqueta, 'Con movimiento')
  assert.equal(situacionDeCopia({ deleted: false, evaluable: true, touched: false }).etiqueta, 'Sin movimiento')
})

test('sin uso tolera el usage ausente y arma el aviso con y sin aviso a administradores', () => {
  assert.equal(estaSinUso({}), false)
  assert.equal(estaSinUso({ usage: null }), false)
  assert.equal(estaSinUso({ usage: { streak: 4, untouched_count: 4, unused: true, alerted_at: null } }), true)

  const igual = (fecha) => fecha
  assert.equal(avisoDeSinUso(undefined, igual), null)
  assert.equal(avisoDeSinUso({ streak: 1, untouched_count: 1, unused: false, alerted_at: null }, igual), null)
  assert.deepEqual(avisoDeSinUso({ streak: 4, untouched_count: 5, unused: true, alerted_at: null }, igual),
    { texto: '4 copias seguidas sin movimiento', avisado: null })
  assert.deepEqual(avisoDeSinUso({ streak: 3, untouched_count: 3, unused: true, alerted_at: '2026-09-23' }, igual),
    { texto: '3 copias seguidas sin movimiento', avisado: 'Ya se avisó a los administradores el 2026-09-23.' })
})

test('la limpieza arranca sin la vigente y manda ids sin repetir con la detencion elegida', () => {
  assert.deepEqual(seleccionInicial([{ id: 9, name: 'a', start_date: null, status: 1, vigente: true }, { id: 8, name: 'b', start_date: null, status: 1 }]), [8])
  assert.deepEqual(seleccionInicial([]), [])
  assert.deepEqual(cuerpoDeLimpieza([3, 3, 4], ''), { modo: 'aplicar', ids: [3, 4], detener: null })
  assert.deepEqual(cuerpoDeLimpieza([3], 'pausar'), { modo: 'aplicar', ids: [3], detener: 'pausar' })
  assert.deepEqual(OPCIONES_DETENCION.map((o) => o.etiqueta), ['No hacer nada', 'Pausar la recurrencia', 'Dejar de repetir'])
})

test('sin marcadas solo se aplica si se pide detener la regla', () => {
  assert.equal(limpiezaAplicable(0, ''), false)
  assert.equal(limpiezaAplicable(0, 'pausar'), true)
  assert.equal(limpiezaAplicable(2, ''), true)
  assert.deepEqual(cuerpoDeLimpieza([], 'dejar_de_repetir'), { modo: 'aplicar', ids: [], detener: 'dejar_de_repetir' })
})

test('textos de la confirmacion y de las omitidas', () => {
  assert.equal(textoDeConfirmacion(1), 'Se moverá 1 tarea a la papelera')
  assert.equal(textoDeConfirmacion(4), 'Se moverán 4 tareas a la papelera')
  assert.equal(textoDeConfirmacion(0), 'No se moverá ninguna tarea a la papelera')
  assert.equal(textoDeOmision('ya_no_disponible'), 'Ya no estaba disponible (otra persona la movió o la borró).')
  assert.equal(textoDeOmision('tocada'), 'Alguien la modificó mientras tanto.')
  assert.match(textoDeOmision('otra_cosa'), /otra cosa/)
})

test('la regla de la URL y las rutas del BFF', () => {
  assert.equal(reglaDeLaUrl('502'), 502)
  assert.equal(reglaDeLaUrl(null), null)
  assert.equal(reglaDeLaUrl('0'), null)
  assert.equal(reglaDeLaUrl('12abc'), null)
  assert.equal(reglaDeLaUrl('-3'), null)
  assert.equal(rutaDeCopias(7), 'tasks/recurrentes/7/copias')
  assert.equal(rutaDeLimpieza(7), 'tasks/recurrentes/7/limpiar')
})
