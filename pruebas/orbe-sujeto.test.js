/**
 * Pruebas de la configuracion del Thinking Orb por sujeto (`dominio/orbe-sujeto.ts`).
 *
 * Lo que se clava aca es la frontera entre el orbe del equipo y el del portal: que el del equipo
 * siga siendo exactamente el de antes (rutas, cuerpo, citas) y que el del cliente no pueda salirse
 * de `portal/`, no pinte tarjetas de escritura, no navegue solo y no dicte por Whisper. Si alguna de
 * esas se rompe, el cliente veria una pantalla del equipo o una ruta que el BFF no le deja pasar.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configuracionDeOrbe, hrefDeCitaPortal, proyectoDeRutaPortal } from '../src/dominio/orbe-sujeto.ts'
import { guardarHilo, leerHilo } from '../src/dominio/ia-chat.ts'

test('el orbe del equipo conserva rutas, cuerpo y capacidades de siempre', () => {
  const staff = configuracionDeOrbe('staff')

  assert.equal(staff.rutaCapacidades, 'ia/capacidades')
  assert.equal(staff.rutaHilo(), 'ia/chat')
  assert.equal(staff.rutaEnvio(), 'ia/chat')
  assert.equal(staff.rutaHilo(7), 'ia/proyectos/7/chat')
  assert.equal(staff.rutaEnvio(7), 'ia/proyectos/7/chat')
  assert.deepEqual(staff.cuerpo('hola', undefined, null), { pregunta: 'hola' })
  assert.deepEqual(staff.cuerpo('hola', undefined, 'procesos'), { pregunta: 'hola', pantalla: 'procesos' })
  assert.equal(staff.conAgente, true)
  assert.equal(staff.conPropuestas, true)
  assert.equal(staff.conNavegacion, true)
  assert.equal(staff.dictadoConRespaldo, true)
  assert.equal(staff.hrefDeCita({ tipo: 'tarea', id: 3, titulo: 't' }), '/procesos?tarea=3')
  assert.equal(staff.textos.subtitulo, 'Pregunta por lo que necesites')
})

test('sin sujeto, o con uno desconocido, es el orbe del equipo', () => {
  assert.equal(configuracionDeOrbe().sujeto, 'staff')
  assert.equal(configuracionDeOrbe(/** @type {any} */ ('otro')).sujeto, 'staff')
})

test('el orbe del portal solo usa rutas bajo portal/ y es de solo lectura', () => {
  const portal = configuracionDeOrbe('contacto')

  for (const ruta of [portal.rutaCapacidades, portal.rutaHilo(), portal.rutaHilo(4), portal.rutaEnvio(), portal.rutaEnvio(4)]) {
    assert.ok(ruta.startsWith('portal/'), ruta)
  }
  assert.equal(portal.rutaCapacidades, 'portal/ia/capacidades')
  assert.equal(portal.rutaHilo(), 'portal/ia/chat')
  assert.equal(portal.rutaHilo(4), 'portal/ia/chat?proyecto_id=4')
  assert.equal(portal.rutaEnvio(4), 'portal/ia/chat')
  assert.equal(portal.conAgente, false)
  assert.equal(portal.conPropuestas, false)
  assert.equal(portal.conNavegacion, false)
  assert.equal(portal.dictadoConRespaldo, false)
})

test('el cuerpo del portal lleva mensaje y proyecto_id, nunca pantalla', () => {
  const portal = configuracionDeOrbe('contacto')

  assert.deepEqual(portal.cuerpo('¿Cómo va?', undefined, 'procesos'), { mensaje: '¿Cómo va?', pregunta: '¿Cómo va?' })
  assert.deepEqual(portal.cuerpo('¿Cómo va?', 8, null), { mensaje: '¿Cómo va?', pregunta: '¿Cómo va?', proyecto_id: 8 })
})

test('los textos del portal hablan al cliente y dicen que solo consulta', () => {
  const { textos } = configuracionDeOrbe('contacto')

  assert.ok(textos.sugerencias.includes('¿Cómo va mi proyecto?'))
  assert.ok(textos.sugerencias.includes('¿Qué tareas esperan mi aprobación?'))
  assert.match(textos.pie(false), /solo consulta/i)
  assert.match(textos.descripcion(), /solo consulta/i)
  for (const texto of [...textos.sugerencias, textos.subtitulo, textos.pie(true), textos.descripcion('X')]) {
    assert.doesNotMatch(texto, /[—–]/, texto)
  }
})

test('las citas del portal solo llevan a pantallas del portal', () => {
  assert.equal(hrefDeCitaPortal({ tipo: 'espacio', id: 5, titulo: 'P' }), '/portal/proyectos/5')
  assert.equal(hrefDeCitaPortal({ tipo: 'tarea', id: 9, titulo: 'T', espacio_id: 5 }), '/portal/proyectos/5?tab=tasks')
  assert.equal(hrefDeCitaPortal({ tipo: 'hito', id: 2, titulo: 'H', espacio_id: 5 }), '/portal/proyectos/5?tab=milestones')
  assert.equal(hrefDeCitaPortal({ tipo: 'acta', id: 1, titulo: 'A', espacio_id: 5 }), '/portal/proyectos/5?tab=actas')
  assert.equal(hrefDeCitaPortal({ tipo: 'tarea', id: 9, titulo: 'T' }), null)
  assert.equal(hrefDeCitaPortal({ tipo: 'acta', id: 1, titulo: 'A' }), null)
})

test('el Proyecto abierto sale de la ruta del portal', () => {
  assert.equal(proyectoDeRutaPortal('/portal/proyectos/12'), 12)
  assert.equal(proyectoDeRutaPortal('/portal/proyectos/12/'), 12)
  assert.equal(proyectoDeRutaPortal('/portal/proyectos'), undefined)
  assert.equal(proyectoDeRutaPortal('/portal'), undefined)
  assert.equal(proyectoDeRutaPortal('/portal/proyectos/abc'), undefined)
  assert.equal(proyectoDeRutaPortal('/portal/proyectos/0'), undefined)
  assert.equal(proyectoDeRutaPortal('/portal/proyectos/12abc'), undefined)
  assert.equal(proyectoDeRutaPortal('/proyectos/12'), undefined)
  assert.equal(proyectoDeRutaPortal(''), undefined)
  assert.equal(proyectoDeRutaPortal(null), undefined)
})

test('el hilo del equipo y el del portal no se pisan en memoria', () => {
  guardarHilo({ mensajes: [{ rol: 'persona', texto: 'equipo', citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' }], cargado: true }, 1)
  guardarHilo({ mensajes: [{ rol: 'persona', texto: 'cliente', citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' }], cargado: true }, 1, 'contacto')

  assert.equal(leerHilo(1).mensajes[0].texto, 'equipo')
  assert.equal(leerHilo(1, 'staff').mensajes[0].texto, 'equipo')
  assert.equal(leerHilo(1, 'contacto').mensajes[0].texto, 'cliente')
  assert.equal(leerHilo(undefined, 'contacto').cargado, false)
})
