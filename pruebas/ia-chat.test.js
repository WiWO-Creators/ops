/**
 * Pruebas del chat de WiBot.
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
  esResoluble,
  estadoDeAccion,
  guardarHilo,
  hrefDeCita,
  leerHilo,
  leerMensajesGuardados,
  partirConCitas,
  respuestaAPreguntas,
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

test('la cita es una ruta absoluta: el chat ya no esta dentro de la ficha de un Espacio', () => {
  // El fallo que esta prueba existe para atrapar: un `?tarea=512` pegado a la pantalla vigente. Con
  // el chat en todo el panel, la Tarea citada puede ser de otro Espacio y el enlace tiene que
  // llevar igual a esa, no a lo que esa pantalla entienda por `?tarea=`.
  assert.equal(hrefDeCita(TAREA), '/procesos?tarea=512')
  assert.equal(hrefDeCita({ tipo: 'espacio', id: 44, titulo: 'Colbun' }), '/espacios/44')
})

test('la cita que no se puede resolver no se enlaza a ningun lado', () => {
  // `discusion` e `hito` solo existen como pestaña de la ficha de un Espacio, y la cita no dice de
  // cual. Enlazarlas a la ficha vigente abriria la pestaña del Espacio equivocado, que es
  // exactamente lo que un enlace prolijo no puede hacer.
  assert.equal(hrefDeCita(HITO), null)
  assert.equal(hrefDeCita({ tipo: 'discusion', id: 31, titulo: 'Presupuesto de la etapa 2' }), null)
})

test('el hilo global sobrevive a que el chat se desmonte', () => {
  // Lo que se protege: navegar de pantalla desmonta el chat, y al volver a abrirlo la conversacion
  // tiene que seguir ahi. Sin esto, cada cambio de ruta empezaria de cero.
  const mensajes = [{ rol: 'persona', texto: 'hola', citas: [], paso: null, acciones: [], fase: 'listo' }]

  guardarHilo({ mensajes, cargado: true })

  assert.deepEqual(leerHilo(), { mensajes, cargado: true })

  guardarHilo({ mensajes: [], cargado: false })
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
    { rol: 'persona', texto: '¿Que quedo pendiente?', citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' },
    { rol: 'ia', texto: 'Falta [1].', citas: [TAREA], paso: null, acciones: [], preguntas: [], fase: 'listo' }
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


test('los proyectos no comparten historial ni borran el hilo global', () => {
  const hilo = (texto) => ({ mensajes: [{ rol: 'persona', texto, citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' }], cargado: true })
  guardarHilo(hilo('global'))
  guardarHilo(hilo('proyecto uno'), 1)
  guardarHilo(hilo('proyecto dos'), 2)
  assert.deepEqual(leerHilo(3), { mensajes: [], cargado: false })
  assert.equal(leerHilo(1).mensajes[0].texto, 'proyecto uno')
  guardarHilo({ mensajes: [], cargado: true }, 1)
  assert.equal(leerHilo(1).mensajes.length, 0)
  assert.equal(leerHilo(2).mensajes[0].texto, 'proyecto dos')
  assert.equal(leerHilo().mensajes[0].texto, 'global')
  guardarHilo({ mensajes: [], cargado: false })
})

/** Un mensaje del hilo, con lo minimo para que `respuestaAPreguntas()` lo lea. */
const enHilo = (rol, texto) => ({ rol, texto, citas: [], paso: null, acciones: [], preguntas: [], fase: 'listo' })

test('una pregunta sin mensaje siguiente sigue abierta', () => {
  const mensajes = [enHilo('persona', 'publica la discusión'), enHilo('ia', '¿Quién la ve?')]

  assert.equal(respuestaAPreguntas(mensajes, 1), null)
})

test('el mensaje siguiente de la persona ES la respuesta, y cierra la pregunta', () => {
  // Sin este bloqueo la misma respuesta se manda dos veces y el modelo propone dos veces lo mismo:
  // dos tarjetas de Confirmar para una sola intencion. Se deriva del hilo y no de un `useState`
  // para que sobreviva a cerrar y volver a abrir el chat, que desmonta la tarjeta pero no el hilo.
  const mensajes = [
    enHilo('persona', 'publica la discusión'),
    enHilo('ia', '¿Quién la ve?'),
    enHilo('persona', 'Solo el equipo'),
    enHilo('ia', 'Listo, te dejé la propuesta.')
  ]

  assert.equal(respuestaAPreguntas(mensajes, 1), 'Solo el equipo')
  assert.equal(respuestaAPreguntas(mensajes, 3), null, 'el ultimo mensaje todavia no tiene respuesta')
})

test('el hilo guardado devuelve las preguntas de un mensaje y descarta las rotas', () => {
  const mensajes = leerMensajesGuardados({
    mensajes: [{
      rol: 'asistente',
      texto: '¿Quién la ve?',
      preguntas: [
        {
          campo: 'visible_para_el_cliente',
          pregunta: '¿El cliente la ve?',
          opciones: [{ valor: false, etiqueta: 'Solo el equipo', descripcion: 'Puertas adentro.' }],
          admite_texto: false
        },
        { campo: 'sin_opciones', pregunta: '¿Y esta?', opciones: [] }
      ]
    }]
  })

  assert.equal(mensajes[0].preguntas.length, 1, 'la pregunta sin opciones validas no llega')
  assert.equal(mensajes[0].preguntas[0].opciones[0].valor, false)
})

test('un mensaje guardado sin `preguntas` trae [] y no rompe', () => {
  const mensajes = leerMensajesGuardados({ mensajes: [{ rol: 'asistente', texto: 'Hoy vencen dos.' }] })

  assert.deepEqual(mensajes[0].preguntas, [])
})
