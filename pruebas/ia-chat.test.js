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
import { hrefDeCita, leerMensajesGuardados, partirConCitas } from '../src/dominio/ia-chat.ts'

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
    { rol: 'persona', texto: '¿Que quedo pendiente?', citas: [], fase: 'listo' },
    { rol: 'ia', texto: 'Falta [1].', citas: [TAREA], fase: 'listo' }
  ])
})

test('un cuerpo que no tiene la forma del contrato deja el hilo vacio, no rompe el panel', () => {
  assert.deepEqual(leerMensajesGuardados(null), [])
  assert.deepEqual(leerMensajesGuardados({ mensajes: 'ninguno' }), [])
  assert.deepEqual(leerMensajesGuardados([]), [])
})
