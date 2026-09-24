/**
 * Pruebas de la fecha de vencimiento que exige el cliente.
 *
 * La regla es de la API; lo que se deja clavado aca es la cortesia del formulario, que se rompe sin
 * dar error: consultar una relacion que no lleva a ningun cliente, bloquear por una consulta que
 * fallo, olvidar que en el alta multiple basta con un destino que exija, o —en la edicion— mirar la
 * relacion vieja en vez de la nueva y dejar salir sin fecha una Tarea que se mueve a un cliente que
 * la exige.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  algunaExigeVencimiento, errorDeVencimientoRequerido, mensajeMasivoDeVencimiento,
  MENSAJE_MASIVO_VENCIMIENTO_REQUERIDO, MENSAJE_VENCIMIENTO_REQUERIDO, relacionQuePuedeExigir,
  rutaDeVencimientoRequerido
} from '../src/dominio/vencimiento-requerido.ts'
import {
  camposDeTarea, errorDeCamposEdicion, relacionFinalDeCampos, vencimientoExigidoAlGuardar
} from '../src/dominio/edicion-tarea.ts'
import { mensajeConDetalles } from '../src/datos/errores.ts'

/** Una Tarea sin fecha colgada de un Proyecto. */
const TAREA = {
  id: 7,
  name: 'Carta de oferta',
  status: 1,
  priority: 2,
  rel_type: 'project',
  rel_id: 8,
  start_date: '2026-09-07',
  due_date: null,
  milestone: null,
  assignees: [],
  followers: [],
  tags: [],
  estimated_hours: null
}

test('proyecto, licitacion, upsell y cliente se consultan; lo demas no', () => {
  assert.deepEqual(relacionQuePuedeExigir('project', '8'), { rel_type: 'project', rel_id: 8 })
  assert.deepEqual(relacionQuePuedeExigir('licitacion', 12), { rel_type: 'project', rel_id: 12 })
  assert.deepEqual(relacionQuePuedeExigir('upsell', '3'), { rel_type: 'project', rel_id: 3 })
  assert.deepEqual(relacionQuePuedeExigir('customer', '5'), { rel_type: 'customer', rel_id: 5 })
  assert.equal(relacionQuePuedeExigir('lead', '5'), null)
  assert.equal(relacionQuePuedeExigir('', ''), null)
})

test('sin id, o con uno que no es entero positivo, no hay nada que consultar', () => {
  assert.equal(relacionQuePuedeExigir('project', ''), null)
  assert.equal(relacionQuePuedeExigir('project', null), null)
  assert.equal(relacionQuePuedeExigir('project', '0'), null)
  assert.equal(relacionQuePuedeExigir('customer', 'abc'), null)
  assert.equal(relacionQuePuedeExigir('customer', '1.5'), null)
})

test('la ruta de la consulta lleva el rel_type y el rel_id', () => {
  assert.equal(
    rutaDeVencimientoRequerido({ rel_type: 'project', rel_id: 8 }),
    'tasks/vencimiento-requerido?rel_type=project&rel_id=8'
  )
})

test('en el alta multiple basta con que un destino exija; una consulta caida no cuenta', () => {
  assert.equal(algunaExigeVencimiento([false, true, false]), true)
  assert.equal(algunaExigeVencimiento([false, false]), false)
  assert.equal(algunaExigeVencimiento([null, false]), false)
  assert.equal(algunaExigeVencimiento([]), false)
})

test('requerida y vacia corta; con fecha, o sin exigir, pasa', () => {
  assert.equal(errorDeVencimientoRequerido(true, ''), MENSAJE_VENCIMIENTO_REQUERIDO)
  assert.equal(errorDeVencimientoRequerido(true, '  '), MENSAJE_VENCIMIENTO_REQUERIDO)
  assert.equal(errorDeVencimientoRequerido(true, '2026-10-01'), null)
  assert.equal(errorDeVencimientoRequerido(false, ''), null)
})

test('la edicion consulta la relacion final, no la que la Tarea traia', () => {
  const inicial = camposDeTarea(TAREA, 'algo')

  assert.deepEqual(relacionFinalDeCampos(inicial), { rel_type: 'project', rel_id: 8 })
  assert.deepEqual(relacionFinalDeCampos({ ...inicial, relacion: 'customer', relacionId: '4' }), { rel_type: 'customer', rel_id: 4 })
  // Un Espacio sin elegir es "sin relacion": no hay cliente que exija.
  assert.equal(relacionFinalDeCampos({ ...inicial, relacionId: '' }), null)
  assert.equal(relacionFinalDeCampos({ ...inicial, relacion: '', relacionId: '' }), null)
})

test('mover una Tarea sin fecha a un Proyecto que la exige no sale sin fecha', () => {
  const inicial = camposDeTarea(TAREA, 'algo')
  const movida = { ...inicial, relacionId: '9' }
  const exigida = vencimientoExigidoAlGuardar(inicial, movida, true)

  assert.equal(exigida, true)
  assert.equal(errorDeCamposEdicion(movida, exigida), MENSAJE_VENCIMIENTO_REQUERIDO)
  assert.equal(errorDeCamposEdicion({ ...movida, vencimiento: '2026-10-01' }, exigida), null)
})

test('borrarle la fecha a una Tarea de un cliente que la exige tampoco sale', () => {
  const inicial = camposDeTarea({ ...TAREA, due_date: '2026-10-01' }, 'algo')
  const sinFecha = { ...inicial, vencimiento: '' }

  assert.equal(vencimientoExigidoAlGuardar(inicial, sinFecha, true), true)
  assert.equal(errorDeCamposEdicion(sinFecha, true), MENSAJE_VENCIMIENTO_REQUERIDO)
})

test('una Tarea vieja sin fecha se puede renombrar: el parche no toca ni fecha ni relacion', () => {
  const inicial = camposDeTarea(TAREA, 'algo')

  assert.equal(vencimientoExigidoAlGuardar(inicial, { ...inicial, nombre: 'Otro nombre' }, true), false)
})

test('si la relacion final no exige, o quedo sin cliente, no se pide fecha', () => {
  const inicial = camposDeTarea(TAREA, 'algo')
  const sinRelacion = { ...inicial, relacion: '', relacionId: '' }

  assert.equal(vencimientoExigidoAlGuardar(inicial, { ...inicial, relacionId: '9' }, false), false)
  assert.equal(errorDeCamposEdicion(sinRelacion), null)
})

test('el 422 de la API se lee como la frase del cliente, no como «Fecha de vencimiento requerido por cliente»', () => {
  const mensaje = mensajeConDetalles({
    message: 'Hay campos que no se pueden guardar.',
    details: { due_date: ['requerido_por_cliente'] }
  })

  assert.equal(mensaje, 'Hay campos que no se pueden guardar. Este cliente exige fecha de vencimiento.')
})

test('el masivo dice su propia frase solo cuando la causa es la fecha exigida', () => {
  assert.equal(mensajeMasivoDeVencimiento({ due_date: ['requerido_por_cliente'] }), MENSAJE_MASIVO_VENCIMIENTO_REQUERIDO)
  assert.equal(mensajeMasivoDeVencimiento({ due_date: ['anterior_al_inicio'] }), null)
  assert.equal(mensajeMasivoDeVencimiento({ incidente: 'a1b2' }), null)
  assert.equal(mensajeMasivoDeVencimiento(undefined), null)
})
