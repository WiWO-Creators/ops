/**
 * Pruebas del contexto del orbe flotante (`dominio/orbe-contexto.ts`) y de las derivaciones del
 * agente que usa la interfaz agéntica (`dominio/ia-ejecucion.ts`).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actaDeDetalleDeEvento,
  contextoDeOrbe,
  etiquetaDePantalla,
  guardarBorrador,
  hrefDePestanaDelOrbe,
  leerBorrador,
  pantallaParaAgente,
  proyectoDeRutaPanel
} from '../src/dominio/orbe-contexto.ts'
import {
  citasDeResultado,
  hayPasoDestructivo,
  preguntaPulsable,
  puedeNuevaPregunta,
  respuestaDePreguntas,
  riesgoDePaso,
  textoDeEjecucion
} from '../src/dominio/ia-ejecucion.ts'

const LIBRE = { enviando: false, conError: false, nuevasHabilitadas: true }

test('el proyecto de la ruta del panel sale de /proyectos/{id} y del antiguo /espacios/{id}', () => {
  assert.equal(proyectoDeRutaPanel('/proyectos/12'), 12)
  assert.equal(proyectoDeRutaPanel('/proyectos/12/'), 12)
  assert.equal(proyectoDeRutaPanel('/espacios/7'), 7)
  assert.equal(proyectoDeRutaPanel('/proyectos'), undefined)
  assert.equal(proyectoDeRutaPanel('/proyectos/abc'), undefined)
  assert.equal(proyectoDeRutaPanel('/proyectos/0'), undefined)
  assert.equal(proyectoDeRutaPanel('/tareas'), undefined)
  assert.equal(proyectoDeRutaPanel(null), undefined)
})

test('pantalla para el agente: minúsculas, /espacios normalizado y nunca con query ni más de 200 caracteres', () => {
  assert.equal(pantallaParaAgente('/Tareas'), '/tareas')
  assert.equal(pantallaParaAgente('/espacios/3'), '/proyectos/3')
  assert.equal(pantallaParaAgente('/tareas?x=1'), null)
  assert.equal(pantallaParaAgente('/ñandú'), null)
  assert.equal(pantallaParaAgente('/' + 'a'.repeat(200)), '/' + 'a'.repeat(200))
  assert.equal(pantallaParaAgente('/' + 'a'.repeat(201)), null)
})

test('la etiqueta de pantalla es legible y cae a la ruta si no se reconoce', () => {
  assert.equal(etiquetaDePantalla('/tareas'), 'Tareas')
  assert.equal(etiquetaDePantalla('/proyectos'), 'Proyectos')
  assert.equal(etiquetaDePantalla('/proyectos/9'), 'Proyecto')
  assert.equal(etiquetaDePantalla('/inicio'), 'Inicio')
  assert.equal(etiquetaDePantalla('/'), 'Inicio')
  assert.equal(etiquetaDePantalla('/raro/cosa'), '/raro/cosa')
})

test('el acta del evento solo sirve con un entero positivo', () => {
  assert.equal(actaDeDetalleDeEvento({ actaId: 12 }), 12)
  for (const malo of [null, undefined, 'x', {}, { actaId: '12' }, { actaId: 0 }, { actaId: 1.5 }, { actaId: -3 }]) {
    assert.equal(actaDeDetalleDeEvento(malo), null)
  }
})

test('el contexto prefiere el acta de la URL y solo usa la del evento en la misma ruta', () => {
  const sin = new URLSearchParams()
  const conActa = new URLSearchParams('tab=actas&acta=5')

  assert.deepEqual(contextoDeOrbe('/proyectos/3', conActa, null), { pantalla: '/proyectos/3', actaId: 5, etiqueta: 'Meeting Paper #5' })
  assert.equal(contextoDeOrbe('/proyectos/3', conActa, { id: 9, ruta: '/proyectos/3' }).actaId, 5)
  assert.equal(contextoDeOrbe('/proyectos/3', sin, { id: 9, ruta: '/proyectos/3' }).actaId, 9)
  assert.equal(contextoDeOrbe('/tareas', sin, { id: 9, ruta: '/proyectos/3' }).actaId, null)
  assert.deepEqual(contextoDeOrbe('/tareas', sin, null), { pantalla: '/tareas', actaId: null, etiqueta: 'Tareas' })
  assert.deepEqual(contextoDeOrbe('/Raro?x', sin, null), { pantalla: null, actaId: null, etiqueta: null })
})

test('ampliar lleva a la pestaña del Orbe del proyecto', () => {
  assert.equal(hrefDePestanaDelOrbe(4), '/proyectos/4?tab=wibot')
})

test('el borrador se guarda por ámbito, se borra al quedar vacío y tolera un almacén roto', () => {
  const datos = new Map()
  const almacen = { getItem: k => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v) }, removeItem: k => { datos.delete(k) } }

  guardarBorrador(almacen, 'staff:global', 'hola')
  guardarBorrador(almacen, 'staff:4', 'otro')
  assert.equal(leerBorrador(almacen, 'staff:global'), 'hola')
  assert.equal(leerBorrador(almacen, 'staff:4'), 'otro')
  guardarBorrador(almacen, 'staff:global', '   ')
  assert.equal(leerBorrador(almacen, 'staff:global'), '')
  assert.equal(leerBorrador(null, 'staff:global'), '')
  const roto = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('lleno') }, removeItem: () => { throw new Error('x') } }
  assert.equal(leerBorrador(roto, 'a'), '')
  assert.doesNotThrow(() => { guardarBorrador(roto, 'a', 'x'); guardarBorrador(roto, 'a', '') })
})

test('el riesgo de un paso tolera que falte o sea desconocido, y un plan con un paso destructivo se marca', () => {
  assert.equal(riesgoDePaso({ id: 'a', descripcion: 'x', estado: 'pendiente' }), null)
  assert.equal(riesgoDePaso({ id: 'a', descripcion: 'x', estado: 'pendiente', riesgo: 'inventado' }), null)
  assert.equal(riesgoDePaso({ id: 'a', descripcion: 'x', estado: 'pendiente', riesgo: 'escritura' }), 'escritura')
  const plan = { id: '1', version: 'v', resumen: '', pasos: [{ id: 'a', descripcion: 'x', estado: 'pendiente', riesgo: 'lectura' }] }
  assert.equal(hayPasoDestructivo(plan), false)
  plan.pasos.push({ id: 'b', descripcion: 'y', estado: 'pendiente', riesgo: 'destructiva' })
  assert.equal(hayPasoDestructivo(plan), true)
})

test('una pregunta es pulsable solo con id y opciones; si no, se degrada', () => {
  assert.deepEqual(preguntaPulsable({ id: 3, pregunta: '¿Quién?', opciones: ['A', ' ', 'B'], admite_texto: true }), { id: '3', pregunta: '¿Quién?', opciones: ['A', 'B'], admiteTexto: true })
  assert.deepEqual(preguntaPulsable({ id: 'q', pregunta: '¿?', opciones: ['Sí'] })?.admiteTexto, false)
  assert.equal(preguntaPulsable({ pregunta: '¿?', opciones: ['A'] }), null)
  assert.equal(preguntaPulsable({ id: 'q', pregunta: '¿?' }), null)
  assert.equal(preguntaPulsable({ id: 'q', pregunta: '¿?', opciones: [] }), null)
  assert.equal(preguntaPulsable({ id: 'q', pregunta: '¿?', opciones: ['', '  '] }), null)
})

test('la respuesta a varias preguntas lleva una línea por pregunta', () => {
  assert.equal(respuestaDePreguntas([{ pregunta: '¿Quién?', respuesta: 'Ana' }]), 'Ana')
  assert.equal(respuestaDePreguntas([{ pregunta: '¿Quién?', respuesta: 'Ana' }, { pregunta: '¿Cuándo?', respuesta: 'Hoy' }]), '¿Quién? Ana\n¿Cuándo? Hoy')
})

test('solo se puede reintentar o editar con el compositor libre y sin ejecución abierta que responder', () => {
  const e = estado => ({ id: '1', pregunta: 'x', estado, ...(estado === 'esperando_confirmacion' ? { plan: { id: '1', version: 'v', resumen: '', pasos: [] } } : {}) })

  assert.equal(puedeNuevaPregunta(undefined, LIBRE), true)
  assert.equal(puedeNuevaPregunta(e('completada'), LIBRE), true)
  assert.equal(puedeNuevaPregunta(e('cancelada'), LIBRE), true)
  for (const estado of ['planificando', 'ejecutando', 'esperando_datos', 'esperando_confirmacion', 'incompleta', 'error']) {
    assert.equal(puedeNuevaPregunta(e(estado), LIBRE), false, estado)
  }
  assert.equal(puedeNuevaPregunta(e('completada'), { ...LIBRE, enviando: true }), false)
  assert.equal(puedeNuevaPregunta(e('completada'), { ...LIBRE, nuevasHabilitadas: false }), false)
})

test('las citas del resultado se validan una a una y no se inventan', () => {
  assert.deepEqual(citasDeResultado(undefined), [])
  assert.deepEqual(citasDeResultado({ resumen: 'x' }), [])
  assert.deepEqual(citasDeResultado({ resumen: 'x', citas: 'raro' }), [])
  assert.deepEqual(citasDeResultado({ resumen: 'x', citas: [{ tipo: 'tarea', id: 4, titulo: 'T' }, { tipo: 'otro', id: 1, titulo: 'Z' }, null] }), [{ tipo: 'tarea', id: 4, titulo: 'T' }])
})

test('el texto copiable junta explicación, pasos, resultado y error sin repetir', () => {
  const texto = textoDeEjecucion({
    id: '1', estado: 'completada', pregunta: 'q', mensaje: 'Listo.',
    plan: { id: '1', version: 'v', resumen: 'Crear tarea', pasos: [{ id: 'a', descripcion: 'Crear', estado: 'completada' }, { id: 'b', descripcion: 'Asignar', estado: 'completada' }] },
    resultado: { resumen: 'Listo.' }
  })

  assert.equal(texto, 'Listo.\n\nCrear tarea\n\n1. Crear\n2. Asignar')
  assert.equal(textoDeEjecucion({ id: '2', estado: 'error', pregunta: 'q', error: { codigo: 'x', mensaje: 'Falló', reintentable: false } }), 'Falló')
})

test('el orbe es ligero hasta 2rem (o 32px) y solo en medidas reconocibles', async () => {
  const { esOrbeLigero } = await import('../src/dominio/orbe.ts')

  assert.equal(esOrbeLigero('chico'), true)
  assert.equal(esOrbeLigero('medio'), false)
  assert.equal(esOrbeLigero('grande'), false)
  assert.equal(esOrbeLigero('medio', '1rem'), true)
  assert.equal(esOrbeLigero('medio', '2rem'), true)
  assert.equal(esOrbeLigero('medio', '2.5rem'), false)
  assert.equal(esOrbeLigero('medio', '32px'), true)
  assert.equal(esOrbeLigero('medio', '33px'), false)
  assert.equal(esOrbeLigero('medio', '4.5rem'), false)
  assert.equal(esOrbeLigero('medio', 'clamp(14rem, 22vw, 21rem)'), false)
  assert.equal(esOrbeLigero('chico', '14rem'), false)
})
