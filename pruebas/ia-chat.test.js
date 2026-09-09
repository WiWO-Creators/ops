/**
 * Pruebas del chat de IA del Proyecto.
 *
 * Lo que se protege aca es **a donde apunta una cita**. Que el chat conteste de mas o de menos se ve
 * leyendo; que `[2]` enlace al Hito de otro Proyecto no se ve: se ve un enlace prolijo que lleva al
 * lugar equivocado, y la persona le cree. Una cita mal enlazada es peor que no citar.
 *
 * El segundo fallo mudo es el marcador partido entre dos chunks del stream: sin la retencion del
 * `[3` incompleto, el texto literal aparece y desaparece mientras se escribe la respuesta.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conAccionResuelta,
  esBorrado,
  esResoluble,
  estadoDeAccion,
  hrefDeCita,
  leerMensajesGuardados,
  partirConCitas,
  segundosParaExpirar
} from '../src/dominio/ia-chat.ts'

const TAREA = { tipo: 'tarea', id: 512, titulo: 'Corregir el informe' }
const HITO = { tipo: 'hito', id: 7, titulo: 'Entrega final' }

test('un marcador con cita se convierte en cita y la prosa queda entera', () => {
  const tramos = partirConCitas('Falta cerrar [1] antes del viernes.', [TAREA])

  assert.deepEqual(tramos, [
    { texto: 'Falta cerrar ' },
    { cita: TAREA },
    { texto: ' antes del viernes.' }
  ])
})

test('un marcador sin cita queda como texto literal, unido a la prosa de al lado', () => {
  // Mismo criterio que `citas_descartadas` en el backend: un id que no volvio de la base no se
  // convierte en enlace. Un enlace a la nada es peor que un `[9]` suelto.
  const tramos = partirConCitas('Quedan tareas [9] sin responsable.', [TAREA])

  assert.deepEqual(tramos, [{ texto: 'Quedan tareas [9] sin responsable.' }])
})

test('un marcador incompleto al final se retiene y no parpadea como texto', () => {
  // El caso real del stream: el chunk corta en medio del marcador. Sin la retencion, el `[1` se
  // pinta como texto y desaparece al frame siguiente.
  assert.deepEqual(partirConCitas('Falta cerrar [1', [TAREA]), [{ texto: 'Falta cerrar ' }])
  assert.deepEqual(partirConCitas('Falta cerrar [', [TAREA]), [{ texto: 'Falta cerrar ' }])
  assert.deepEqual(partirConCitas('Falta cerrar [1]', [TAREA]), [{ texto: 'Falta cerrar ' }, { cita: TAREA }])
})

test('varios marcadores y citas repetidas se resuelven cada uno por su numero', () => {
  const tramos = partirConCitas('[1] depende de [2], y [1] no arranco.', [TAREA, HITO])

  assert.deepEqual(tramos, [
    { cita: TAREA },
    { texto: ' depende de ' },
    { cita: HITO },
    { texto: ', y ' },
    { cita: TAREA },
    { texto: ' no arranco.' }
  ])
})

test('un texto sin marcadores sale en un solo tramo, y el vacio no da ninguno', () => {
  assert.deepEqual(partirConCitas('Todo al dia.', []), [{ texto: 'Todo al dia.' }])
  assert.deepEqual(partirConCitas('', []), [])
})

test('la cita de tarea abre el modal encima, sin sacar de la pestaña del chat', () => {
  const params = new URLSearchParams('tab=ia&pagina=3')

  assert.equal(hrefDeCita(TAREA, params), '?tab=ia&pagina=3&tarea=512')
})

test('la cita de discusion cambia de pestaña y abre la discusion', () => {
  const cita = { tipo: 'discusion', id: 31, titulo: 'Presupuesto de la etapa 2' }

  assert.equal(hrefDeCita(cita, new URLSearchParams('tab=ia')), '?tab=discusiones&discusion=31')
})

test('la cita de hito solo cambia de pestaña: PanelHitos todavia no lee un ?hito=', () => {
  assert.equal(hrefDeCita(HITO, new URLSearchParams('tab=ia')), '?tab=hitos')
})

test('cada tipo enlaza a lo suyo y ninguno usa el parametro de otro', () => {
  // El fallo que esta prueba existe para atrapar: que un `hito` termine escribiendo `?tarea=7` y
  // abra la Tarea 7, que es de otra entidad y probablemente de otro Proyecto.
  const params = new URLSearchParams()

  assert.equal(hrefDeCita({ ...HITO, tipo: 'tarea' }, params), '?tarea=7')
  assert.equal(hrefDeCita(HITO, params), '?tab=hitos')
  assert.equal(hrefDeCita({ tipo: 'espacio', id: 44, titulo: 'Colbun' }, params), '?tab=descripcion')
})

test('el resto de la vista sobrevive al salto', () => {
  const params = new URLSearchParams('tab=ia&filtro[status]=1&orden=-duedate')

  assert.match(hrefDeCita(TAREA, params), /filtro%5Bstatus%5D=1/)
  assert.match(hrefDeCita(TAREA, params), /orden=-duedate/)
})

test('el hilo guardado se lee traduciendo el rol y descartando lo que no se entiende', () => {
  const mensajes = leerMensajesGuardados({
    modo: 'cache',
    mensajes: [
      { rol: 'usuario', texto: '¿Que quedo pendiente?' },
      { rol: 'asistente', texto: 'Falta [1].', citas: [TAREA, { tipo: 'inventado', id: 1, titulo: 'x' }] },
      { rol: 'asistente' }
    ]
  })

  assert.deepEqual(mensajes, [
    { rol: 'persona', texto: '¿Que quedo pendiente?', citas: [], paso: null, acciones: [], fase: 'listo' },
    { rol: 'ia', texto: 'Falta [1].', citas: [TAREA], paso: null, acciones: [], fase: 'listo' }
  ])
})

test('un cuerpo que no tiene la forma del contrato deja el hilo vacio, no rompe el panel', () => {
  assert.deepEqual(leerMensajesGuardados(null), [])
  assert.deepEqual(leerMensajesGuardados({ mensajes: 'ninguno' }), [])
  assert.deepEqual(leerMensajesGuardados([]), [])
})

/** Una propuesta que caduca en el instante que se le pida. */
const propuesta = (extras = {}) => ({
  id: 5,
  herramienta: 'crear_tarea',
  resumen: 'Crear la tarea "Revisar el brief"',
  detalle: [],
  estado: 'pendiente',
  resultado: null,
  expira_en: '2026-09-04T12:30:00Z',
  ...extras
})

const ANTES = Date.parse('2026-09-04T12:29:00Z')
const DESPUES = Date.parse('2026-09-04T12:31:00Z')

test('una propuesta deja de ofrecer botones cuando pasa su instante de caducidad', () => {
  // El reloj del navegador no decide nada —el servidor recomprueba al confirmar— pero sin esto la
  // tarjeta ofreceria Confirmar para siempre hasta que alguien recargue la pagina.
  assert.equal(esResoluble(propuesta(), ANTES), true)
  assert.equal(esResoluble(propuesta(), DESPUES), false)
  assert.equal(estadoDeAccion(propuesta(), DESPUES), 'expirada')
  assert.equal(estadoDeAccion(propuesta(), ANTES), 'pendiente')
})

test('una accion ya resuelta no revive por el reloj', () => {
  // `ejecutada` es un estado final: pasada la media hora sigue diciendo que se hizo, no "caducada".
  assert.equal(estadoDeAccion(propuesta({ estado: 'ejecutada' }), DESPUES), 'ejecutada')
  assert.equal(esResoluble(propuesta({ estado: 'ejecutada' }), ANTES), false)
})

test('sin instante de caducidad no se ofrece confirmar', () => {
  // Un `expira_en` ausente o ilegible es un dato roto: lo seguro es no ofrecer el boton.
  assert.equal(segundosParaExpirar(propuesta({ expira_en: null }), ANTES), 0)
  assert.equal(segundosParaExpirar(propuesta({ expira_en: 'ayer' }), ANTES), 0)
  assert.equal(esResoluble(propuesta({ expira_en: null }), ANTES), false)
})

test('solo los dos borrados se pintan en tono de peligro', () => {
  assert.equal(esBorrado(propuesta({ herramienta: 'eliminar_tarea' })), true)
  assert.equal(esBorrado(propuesta({ herramienta: 'eliminar_espacio' })), true)
  assert.equal(esBorrado(propuesta({ herramienta: 'archivar_espacio' })), false)
  assert.equal(esBorrado(propuesta()), false)
})

test('resolver una accion reemplaza solo esa y deja el resto del hilo igual', () => {
  const hilo = [
    { rol: 'persona', texto: 'crea dos tareas', citas: [], paso: null, acciones: [], fase: 'listo' },
    {
      rol: 'ia',
      texto: 'Te dejé dos.',
      citas: [],
      paso: null,
      acciones: [propuesta(), propuesta({ id: 6 })],
      fase: 'listo'
    }
  ]

  const siguiente = conAccionResuelta(hilo, propuesta({ id: 6, estado: 'ejecutada', resultado: 'Tarea creada (#9).' }))

  assert.deepEqual(siguiente[1].acciones.map((a) => a.estado), ['pendiente', 'ejecutada'])
  assert.equal(siguiente[1].acciones[1].resultado, 'Tarea creada (#9).')
  assert.equal(siguiente[0], hilo[0], 'el mensaje sin acciones no se reemplaza')
})

test('el hilo guardado trae las propuestas de cada mensaje y descarta las rotas', () => {
  const mensajes = leerMensajesGuardados({
    mensajes: [{
      rol: 'asistente',
      texto: 'Te dejé preparada una tarea.',
      acciones: [propuesta(), { id: 7, herramienta: 'crear_tarea', resumen: 'x', estado: 'inventado' }]
    }]
  })

  assert.equal(mensajes[0].acciones.length, 1, 'la propuesta con un estado que no existe no llega')
  assert.equal(mensajes[0].acciones[0].id, 5)
})
