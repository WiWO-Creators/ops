/**
 * Pruebas de la Supervisión diaria: lo que el panel decide sin preguntarle a la API.
 *
 * Se prueba lo que se rompe en silencio: el "hoy" que en UTC ya es mañana, una fecha con forma
 * válida que no existe, el botón que al volver a pulsarse tiene que borrar, los totales después de
 * marcar, a quién se le ofrece supervisar, cómo se agrupa por persona (una Tarea con dos asignados
 * va en los dos grupos), qué dice cada estado y cómo queda la hoja al confirmarla o devolverla.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparHoja,
  alcanzaParaSupervisar,
  avisoDeFirma,
  conConfirmacion,
  conRevision,
  errorDeNotaDeDevolucion,
  estadoDeTarea,
  etiquetaDeOrigen,
  hayRevisionesDelEquipo,
  hojasPorConfirmar,
  modoDeAgrupacion,
  textoDeEstadoDelEquipo,
  textoDeRevisionDelEquipo,
  vacioSinSupervision,
  diasVecinos,
  enlaceDeHoja,
  esFechaDeHoja,
  fechaPedida,
  hoyEnSantiago,
  mensajeDeRechazo,
  puedeVerSupervision,
  siguienteEstado,
  sinRevisar,
  supervisorPedido,
  textoDeAtraso
} from '../src/dominio/supervision.ts'
import { rutaDeConfirmacion, rutaDeHoja, rutaDeHojasDelEquipo, rutaDeRevisiones } from '../src/datos/supervision.ts'

/** Una Tarea abierta de un día de atraso, sin asignados ni revisiones; `extra` la ajusta. */
function tarea (id, extra = {}) {
  return {
    id, patente: null, name: `T${id}`, status: 1, duedate: '2026-09-24', dias_atraso: 1,
    completada: false, completada_en: null, origen: ['cliente'],
    proyecto: null, asignados: [], revision: null, revisiones_equipo: [], ...extra
  }
}

/** Una hoja con dos Tareas de un cliente, sin revisar. */
function hoja () {
  return {
    fecha: '2026-09-25',
    puede_editar: true,
    puede_confirmar: false,
    supervisor: { staffid: 1, nombre: 'Ana Ríos', escalon: 'gerencia' },
    firma: null,
    confirmacion: null,
    totales: { tareas: 2, atrasadas: 1, completadas: 0, revisadas: 0, ok: 0, no_ok: 0 },
    clientes: [{
      client_id: 1,
      company: 'Acme',
      tareas: [10, 11].map((id) => tarea(id))
    }]
  }
}

const revision = (estado) => ({ estado, nota: null, staffid: 1, nombre: 'Ana Ríos', marcado_en: '2026-09-25T12:00:00Z' })

test('hoy es el de Santiago, no el de UTC', () => {
  // 02:00 UTC del 26 son las 23:00 del 25 en Santiago (UTC-3 en septiembre).
  assert.equal(hoyEnSantiago(new Date('2026-09-26T02:00:00Z')), '2026-09-25')
  assert.equal(hoyEnSantiago(new Date('2026-09-26T12:00:00Z')), '2026-09-26')
})

test('la fecha de la URL: válida o cae a hoy', () => {
  assert.equal(esFechaDeHoja('2026-02-28'), true)
  assert.equal(esFechaDeHoja('2026-02-31'), false)
  assert.equal(esFechaDeHoja('25/09/2026'), false)
  assert.equal(esFechaDeHoja(undefined), false)
  assert.equal(fechaPedida('2026-09-01', '2026-09-25'), '2026-09-01')
  assert.equal(fechaPedida(['2026-09-01'], '2026-09-25'), '2026-09-25')
  assert.equal(fechaPedida('mañana', '2026-09-25'), '2026-09-25')
})

test('el supervisor de la URL', () => {
  assert.equal(supervisorPedido('4'), 4)
  assert.equal(supervisorPedido('0'), null)
  assert.equal(supervisorPedido('-4'), null)
  assert.equal(supervisorPedido(undefined), null)
})

test('enlaces y días vecinos, cruzando el mes', () => {
  assert.deepEqual(diasVecinos('2026-10-01'), { anterior: '2026-09-30', siguiente: '2026-10-02' })
  assert.equal(enlaceDeHoja('2026-09-25', null), '/supervision?fecha=2026-09-25')
  assert.equal(enlaceDeHoja('2026-09-25', 4), '/supervision?fecha=2026-09-25&staff_id=4')
  assert.equal(rutaDeHoja(null, null), 'supervision/hoja')
  assert.equal(rutaDeHoja('2026-09-25', 4), 'supervision/hoja?fecha=2026-09-25&staff_id=4')
  assert.equal(rutaDeRevisiones('2026-09-25'), 'supervision/hoja/2026-09-25/revisiones')
})

test('volver a pulsar el estado marcado lo borra', () => {
  assert.equal(siguienteEstado(null, 'ok'), 'ok')
  assert.equal(siguienteEstado('ok', 'ok'), null)
  assert.equal(siguienteEstado('ok', 'no_ok'), 'no_ok')
  assert.equal(siguienteEstado('no_ok', 'no_ok'), null)
})

test('los totales siguen a las marcas, y la hoja original no se toca', () => {
  const original = hoja()
  const marcada = conRevision(conRevision(original, 10, revision('ok')), 11, revision('no_ok'))

  assert.deepEqual(marcada.totales, { tareas: 2, atrasadas: 1, completadas: 0, revisadas: 2, ok: 1, no_ok: 1 })
  assert.equal(original.clientes[0].tareas[0].revision, null)

  const borrada = conRevision(marcada, 10, null)

  assert.deepEqual(borrada.totales, { tareas: 2, atrasadas: 1, completadas: 0, revisadas: 1, ok: 0, no_ok: 1 })
  assert.equal(sinRevisar(borrada.totales), 1)
})

test('el aviso de firma cuenta las pendientes', () => {
  assert.match(avisoDeFirma({ tareas: 3, atrasadas: 0, revisadas: 1, ok: 1, no_ok: 0 }), /^Quedan 2 tareas sin revisar/)
  assert.match(avisoDeFirma({ tareas: 3, atrasadas: 0, revisadas: 2, ok: 2, no_ok: 0 }), /^Queda 1 tarea sin revisar/)
  assert.match(avisoDeFirma({ tareas: 3, atrasadas: 0, revisadas: 3, ok: 3, no_ok: 0 }), /^Revisaste las 3 tareas/)
})

test('el atraso en palabras', () => {
  assert.equal(textoDeAtraso(0), 'Vence hoy')
  assert.equal(textoDeAtraso(1), '1 día de atraso')
  assert.equal(textoDeAtraso(12), '12 días de atraso')
})

test('supervisa de lead hacia arriba; la administración ve la sección igual', () => {
  assert.equal(alcanzaParaSupervisar('staff'), false)
  assert.equal(alcanzaParaSupervisar('lead'), true)
  assert.equal(alcanzaParaSupervisar('gerencia'), true)
  assert.equal(alcanzaParaSupervisar('inventado'), false)
  assert.equal(alcanzaParaSupervisar(undefined), false)
  assert.equal(puedeVerSupervision({ escalon: 'staff', is_admin: false, is_superadmin: false }), false)
  assert.equal(puedeVerSupervision({ escalon: 'staff', is_admin: true, is_superadmin: false }), true)
  assert.equal(puedeVerSupervision({ escalon: 'director', is_admin: false, is_superadmin: false }), true)
})

test('el 422 se explica en palabras; lo demás pasa tal cual', () => {
  assert.match(mensajeDeRechazo('crudo', 422, { staff_ids: ['invalid'] }), /Lead, Director o Gerencia/)
  assert.match(mensajeDeRechazo('crudo', 422, { client_ids: ['unknown'] }), /ya no existe/)
  assert.match(mensajeDeRechazo('crudo', 422, { staff_id: ['escalon'] }), /Lead o superior/)
  assert.match(mensajeDeRechazo('crudo', 403, undefined), /No tienes permiso/)
  assert.equal(mensajeDeRechazo('crudo', 500, undefined), 'crudo')
  assert.equal(mensajeDeRechazo('crudo', 422, { otro: ['x'] }), 'crudo')
})

/** Una hoja de dos clientes y el grupo "Sin cliente" en el medio, con asignados cruzados. */
function hojaDeEquipo () {
  const gina = { staffid: 7, nombre: 'Gina Ferrer' }
  const facundo = { staffid: 6, nombre: 'Facundo Lugo' }

  return {
    ...hoja(),
    clientes: [
      { client_id: 3, company: 'Beta', tareas: [tarea(1, { asignados: [gina, facundo] }), tarea(2, { asignados: [] })] },
      { client_id: null, company: 'Sin cliente', tareas: [tarea(3, { asignados: [facundo], origen: ['equipo'] })] },
      { client_id: 5, company: 'Costa', tareas: [tarea(4, { asignados: [gina] })] }
    ]
  }
}

test('una Tarea con origen vacío se agrupa igual que las demás', () => {
  const conHuerfana = hojaDeEquipo()
  conHuerfana.clientes[0].tareas[1].origen = []

  assert.deepEqual(agruparHoja(conHuerfana, 'cliente')[0].tareas.map((t) => t.id), [1, 2])
  assert.deepEqual(agruparHoja(conHuerfana, 'persona').at(-1).tareas.map((t) => t.id), [2])
})

test('agrupar por cliente deja Sin cliente al final', () => {
  const grupos = agruparHoja(hojaDeEquipo(), 'cliente')

  assert.deepEqual(grupos.map((g) => g.titulo), ['Beta', 'Costa', 'Sin cliente'])
  assert.deepEqual(grupos.map((g) => g.clave), ['cliente-3', 'cliente-5', 'cliente-sin'])
})

test('agrupar por persona: la Tarea con dos asignados va en los dos, Sin asignar al final', () => {
  const grupos = agruparHoja(hojaDeEquipo(), 'persona')

  assert.deepEqual(grupos.map((g) => [g.titulo, g.tareas.map((t) => t.id)]), [
    ['Facundo Lugo', [1, 3]],
    ['Gina Ferrer', [1, 4]],
    ['Sin asignar', [2]]
  ])
  assert.deepEqual(agruparHoja({ ...hoja(), clientes: [] }, 'persona'), [])
})

test('el modo de agrupación: solo "persona" cambia el de omisión', () => {
  assert.equal(modoDeAgrupacion('persona'), 'persona')
  assert.equal(modoDeAgrupacion('cliente'), 'cliente')
  assert.equal(modoDeAgrupacion(undefined), 'cliente')
  assert.equal(modoDeAgrupacion('<x>'), 'cliente')
})

test('el estado de una Tarea: completada con hora, otro día, sin hora, atrasada o vence hoy', () => {
  const cerrada = { completada: true, dias_atraso: 0 }

  assert.deepEqual(estadoDeTarea({ ...cerrada, completada_en: '2026-09-25 11:40:00' }, '2026-09-25'), { tipo: 'completada', texto: 'Completada 11:40' })
  assert.match(estadoDeTarea({ ...cerrada, completada_en: '2026-09-23 09:00:00' }, '2026-09-25').texto, /^Completada el /)
  assert.deepEqual(estadoDeTarea({ ...cerrada, completada_en: null }, '2026-09-25'), { tipo: 'completada', texto: 'Completada' })
  assert.deepEqual(estadoDeTarea({ completada: false, completada_en: null, dias_atraso: 3 }, '2026-09-25'), { tipo: 'atrasada', texto: '3 días de atraso' })
  assert.deepEqual(estadoDeTarea({ completada: false, completada_en: null, dias_atraso: 0 }, '2026-09-25'), { tipo: 'vence_hoy', texto: 'Vence hoy' })
})

test('el origen y las revisiones del equipo en palabras', () => {
  assert.equal(etiquetaDeOrigen(['cliente']), 'Por cliente')
  assert.equal(etiquetaDeOrigen(['equipo']), 'Por equipo')
  assert.equal(etiquetaDeOrigen(['cliente', 'equipo']), 'Por cliente y equipo')
  assert.equal(etiquetaDeOrigen([]), null, 'entra solo por su revisión: sin etiqueta')

  assert.equal(textoDeRevisionDelEquipo({ estado: 'ok', nombre: 'Diego Sosa' }), '✔ OK · Diego Sosa')
  assert.equal(textoDeRevisionDelEquipo({ estado: 'no_ok', nombre: 'Diego Sosa' }), '✘ No OK · Diego Sosa')

  const conEquipo = hojaDeEquipo()
  assert.equal(hayRevisionesDelEquipo(conEquipo), false)
  conEquipo.clientes[2].tareas[0].revisiones_equipo = [{ staffid: 4, nombre: 'Diego Sosa', estado: 'ok', nota: null }]
  assert.equal(hayRevisionesDelEquipo(conEquipo), true)
})

test('confirmar conserva la firma; devolver la anula; en los dos ya no hay nada que confirmar', () => {
  const firma = { staffid: 4, nombre: 'Diego Sosa', firmado_en: '2026-09-25T18:00:00-03:00' }
  const firmada = { ...hoja(), puede_editar: false, puede_confirmar: true, firma }
  const base = { staffid: 2, nombre: 'Bruno Cabral', en: '2026-09-25T19:00:00-03:00' }

  const confirmada = conConfirmacion(firmada, { ...base, estado: 'confirmada', nota: null })
  assert.equal(confirmada.firma, firma)
  assert.equal(confirmada.puede_confirmar, false)
  assert.equal(confirmada.confirmacion.estado, 'confirmada')

  const devuelta = conConfirmacion(firmada, { ...base, estado: 'devuelta', nota: 'Revisa la 900' })
  assert.equal(devuelta.firma, null)
  assert.equal(devuelta.puede_confirmar, false)
  assert.equal(firmada.firma, firma, 'la original no se toca')
})

test('la nota de devolución es obligatoria y con tope', () => {
  assert.match(errorDeNotaDeDevolucion('   '), /obligatoria/)
  assert.match(errorDeNotaDeDevolucion('x'.repeat(501)), /500/)
  assert.equal(errorDeNotaDeDevolucion('Falta el anexo'), null)
})

test('el estado de las hojas del equipo en palabras y cuántas esperan confirmación', () => {
  assert.equal(textoDeEstadoDelEquipo({ estado: 'sin_firmar', firmado_en: null }), 'Sin firmar')
  assert.equal(textoDeEstadoDelEquipo({ estado: 'firmada', firmado_en: '2026-09-25T21:05:00Z' }), 'Firmada 18:05')
  assert.equal(textoDeEstadoDelEquipo({ estado: 'confirmada', firmado_en: '2026-09-25T21:05:00Z' }), 'Confirmada')
  assert.equal(textoDeEstadoDelEquipo({ estado: 'devuelta', firmado_en: null }), 'Devuelta')

  assert.equal(hojasPorConfirmar([{ estado: 'firmada' }, { estado: 'confirmada' }, { estado: 'firmada' }, { estado: 'sin_firmar' }]), 2)
  assert.equal(hojasPorConfirmar([]), 0)
})

test('los totales conservan las completadas al marcar', () => {
  const conCompletadas = { ...hoja(), totales: { ...hoja().totales, completadas: 1 } }

  assert.equal(conRevision(conCompletadas, 10, revision('ok')).totales.completadas, 1)
})

test('el vacío sin supervisión explica de dónde sale la hoja', () => {
  const propio = vacioSinSupervision(true, 'Ana Ríos')

  assert.equal(propio.titulo, 'No tienes gente a cargo ni clientes')
  assert.match(propio.descripcion, /gente a cargo/)
  assert.match(propio.descripcion, /Focal/)
  assert.match(propio.descripcion, /pestaña Supervisión/)
  assert.equal(vacioSinSupervision(false, 'Diego Sosa').titulo, 'Diego Sosa no tiene gente a cargo ni clientes')
})

test('las rutas nuevas de la API', () => {
  assert.equal(rutaDeConfirmacion('2026-09-25'), 'supervision/hoja/2026-09-25/confirmacion')
  assert.equal(rutaDeHojasDelEquipo('2026-09-25'), 'supervision/equipo?fecha=2026-09-25')
})
