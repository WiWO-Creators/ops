/**
 * Pruebas del lector de la pantalla de estado de los Proyectos del cliente.
 *
 * Lo que se prueba no es maquetado: es el CRUCE de tres respuestas de la API que no siempre estan
 * completas. La lista de Proyectos viene paginada, `proximos_hitos` viene recortada por el servidor
 * y `bloqueados` puede no venir como clave. Cada una de esas tres ausencias tiene una forma de
 * rellenarse sola con un cero o con una lista vacia, y las tres le dirian al cliente "no te falta
 * nada" sobre algo que nadie miro.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVO_SIN_EN_CURSO,
  MOTIVO_SIN_ESPACIOS,
  TEXTO_HITO_FUERA_DE_LISTA,
  TEXTO_SIN_HITOS,
  contarEnCurso,
  filasDeAvance,
  leerLoQueNecesitaAlCliente,
  leerProcesos,
  leerTrabasPropias,
  textoDeTareasAbiertas
} from '../src/componentes/portal/estado.ts'

/** Un Proyecto del portal con lo minimo que la pantalla le mira. */
function espacio (campos) {
  return {
    id: 1,
    name: 'Sitio institucional',
    description: null,
    status: 2,
    start_date: '2026-01-05',
    deadline: null,
    date_finished: null,
    progress: 40,
    counts: { tasks: 10, tasks_open: 4, milestones: 2 },
    ...campos
  }
}

/** Un Hito de los que vienen, con el Proyecto del que cuelga. */
function hito (campos) {
  return {
    id: 1,
    name: 'Entrega inicial',
    due_date: '2026-10-30',
    project: { id: 1, name: 'Sitio institucional' },
    vencido: false,
    ...campos
  }
}

/** Una Tarea detenida, tal como la manda `bloqueados`. */
function bloqueo (campos) {
  return {
    id: 1,
    name: 'Aprobar la maqueta',
    project: { id: 1, name: 'Sitio institucional' },
    motivo: 'Falta el visto bueno del cliente',
    accion_necesaria: null,
    responsable: 'cliente',
    bloqueado_en: '2026-09-01',
    dias_bloqueada: 3,
    ...campos
  }
}

/** El resumen del portal con lo minimo, para poder pedirle una lectura completa. */
function resumen (campos) {
  return {
    espacios: { total: 1, by_status: [] },
    esperando_tu_respuesta: 0,
    hitos: { total: 0, overdue: 0 },
    proximos_hitos: [],
    ...campos
  }
}

// --- Lo que necesita al cliente -------------------------------------------

test('la clave de bloqueos que no vino no se lee como "no tenés nada"', () => {
  assert.deepEqual(leerTrabasPropias(undefined), { clase: 'no_se_sabe' })
  assert.deepEqual(leerTrabasPropias(null), { clase: 'no_se_sabe' })
})

test('una lista vacia de bloqueos si afirma que no hay nada', () => {
  assert.deepEqual(leerTrabasPropias([]), { clase: 'ninguna' })
})

test('lo trabado que depende del equipo no le pide nada al cliente', () => {
  // Sigue estando detenido y se lista mas abajo, pero este bloque solo contesta "¿tengo que hacer
  // algo yo?": meterlo aca haria que el cliente busque una accion suya que no existe.
  const lectura = leerTrabasPropias([
    bloqueo({ id: 1, responsable: 'equipo' }),
    bloqueo({ id: 2, responsable: 'tercero' })
  ])

  assert.deepEqual(lectura, { clase: 'ninguna' })
})

test('solo lo que depende del cliente entra en lo que le espera', () => {
  const lectura = leerTrabasPropias([
    bloqueo({ id: 1, responsable: 'equipo' }),
    bloqueo({ id: 2, responsable: 'cliente' }),
    bloqueo({ id: 3, responsable: 'cliente' })
  ])

  assert.equal(lectura.clase, 'tuyas')
  assert.deepEqual(lectura.filas.map((fila) => fila.id), [2, 3])
})

test('un bloqueo sin responsable no se le carga al cliente', () => {
  // Es la fila de una base sin la migracion 0699: sin saber de quien depende, adjudicarsela al
  // cliente le pediria una accion que capaz no le toca.
  assert.deepEqual(leerTrabasPropias([bloqueo({ responsable: null })]), { clase: 'ninguna' })
})

test('con las dos mitades limpias no hay nada que hacer ni nada que aclarar', () => {
  const lectura = leerLoQueNecesitaAlCliente(resumen({ esperando_tu_respuesta: 0, bloqueados: [] }))

  assert.equal(lectura.hayAlgoQueHacer, false)
  assert.equal(lectura.hayAlgoQueNoSeSabe, false)
})

test('esperando_tu_respuesta en null no se lee como "nada te espera"', () => {
  const lectura = leerLoQueNecesitaAlCliente(
    resumen({ esperando_tu_respuesta: null, bloqueados: [] })
  )

  assert.deepEqual(lectura.aprobaciones, { clase: 'no_se_sabe' })
  assert.equal(lectura.hayAlgoQueHacer, false)
  assert.equal(lectura.hayAlgoQueNoSeSabe, true)
})

test('una mitad al dia y la otra sin saberse son dos frases, no un cartel verde', () => {
  // Lo trabado se sabe y esta limpio; las aprobaciones no se pueden contar. Decir "todo bien"
  // tranquilizaria al cliente sobre la mitad que nadie pudo mirar.
  const lectura = leerLoQueNecesitaAlCliente(
    resumen({ esperando_tu_respuesta: null, bloqueados: [] })
  )

  assert.deepEqual(lectura.trabas, { clase: 'ninguna' })
  assert.deepEqual(lectura.aprobaciones, { clase: 'no_se_sabe' })
})

test('cualquiera de las dos mitades pendiente enciende la tarjeta', () => {
  const porAprobacion = leerLoQueNecesitaAlCliente(
    resumen({ esperando_tu_respuesta: 2, bloqueados: [] })
  )
  const porTraba = leerLoQueNecesitaAlCliente(
    resumen({ esperando_tu_respuesta: 0, bloqueados: [bloqueo({})] })
  )

  assert.equal(porAprobacion.hayAlgoQueHacer, true)
  assert.equal(porTraba.hayAlgoQueHacer, true)
})

// --- Panorama --------------------------------------------------------------

test('un Proyecto sin fecha de cierre sigue en curso', () => {
  const lectura = contarEnCurso(
    [espacio({ id: 1 }), espacio({ id: 2, date_finished: '2026-08-01' })],
    2
  )

  assert.deepEqual(lectura, { clase: 'contados', enCurso: 1, total: 2 })
})

test('la fecha de cierre vacia se trata como sin cerrar', () => {
  // Perfex guarda cadenas vacias donde deberia haber null: leerlas como una fecha daria un Proyecto
  // terminado que nadie termino.
  const lectura = contarEnCurso([espacio({ date_finished: '  ' })], 1)

  assert.deepEqual(lectura, { clase: 'contados', enCurso: 1, total: 1 })
})

test('con la lista cortada no se cuenta: se dice que no se puede', () => {
  // Es el mismo error que `/portal/resumen` vino a matar. Sobre tres filas de doce Proyectos, "3 en
  // curso" es un numero mas chico que el real y no lo parece.
  const filas = [espacio({ id: 1 }), espacio({ id: 2 }), espacio({ id: 3 })]

  assert.deepEqual(contarEnCurso(filas, 12), { clase: 'incompleto', total: 12 })
})

test('la clave procesos que no vino no se dibuja como cero abiertas', () => {
  assert.deepEqual(leerProcesos(undefined), { clase: 'no_se_sabe' })
})

test('un cero legitimo de procesos si es un cero', () => {
  const lectura = leerProcesos({ total: 4, open: 0, completed: 4, completed_percent: 100 })

  assert.deepEqual(lectura, { clase: 'sabido', abiertas: 0, avance: 100 })
})

test('sin Tareas compartidas no se dice "0 de 0 abiertas"', () => {
  // Un cero sobre cero se lee como un avance perfecto, y es lo contrario: es un Proyecto que no
  // comparte su lista.
  assert.equal(textoDeTareasAbiertas({ tasks: 0, tasks_open: 0, milestones: 0 }), 'Sin tareas compartidas')
})

test('con Tareas se dicen las abiertas sobre el total', () => {
  assert.equal(
    textoDeTareasAbiertas({ tasks: 10, tasks_open: 4, milestones: 1 }),
    '4 de 10 tareas abiertas'
  )
})

// --- Avance por Proyecto ---------------------------------------------------

test('cada Proyecto se queda con su propio Hito', () => {
  const filas = filasDeAvance(
    [espacio({ id: 1 }), espacio({ id: 2, name: 'App' })],
    [
      hito({ id: 10, project: { id: 2, name: 'App' } }),
      hito({ id: 11, project: { id: 1, name: 'Sitio institucional' } })
    ],
    []
  )

  const porId = new Map(filas.map((fila) => [fila.espacio.id, fila]))

  assert.equal(porId.get(1).hito.hito.id, 11)
  assert.equal(porId.get(2).hito.hito.id, 10)
})

test('de dos Hitos del mismo Proyecto se toma el primero que mando el servidor', () => {
  // La lista llega por fecha ascendente. Recalcular el minimo aca daria otro resultado el dia que
  // la API cambie el criterio, y el portal mostraria dos proximas entregas distintas segun la
  // pantalla.
  const filas = filasDeAvance(
    [espacio({ id: 1 })],
    [hito({ id: 10, due_date: '2026-08-01' }), hito({ id: 11, due_date: '2026-09-01' })],
    []
  )

  assert.equal(filas[0].hito.hito.id, 10)
})

test('un Proyecto con Hitos pero fuera de la lista no se dibuja como si no tuviera', () => {
  // `proximos_hitos` llega recortada: decir "sin Hitos" contradiria a `counts.milestones`, que esta
  // en la misma fila.
  const filas = filasDeAvance([espacio({ counts: { tasks: 1, tasks_open: 1, milestones: 3 } })], [], [])

  assert.deepEqual(filas[0].hito, { clase: 'fuera_de_lista' })
})

test('un Proyecto sin ningun Hito si se dibuja como sin Hitos', () => {
  const filas = filasDeAvance([espacio({ counts: { tasks: 1, tasks_open: 1, milestones: 0 } })], [], [])

  assert.deepEqual(filas[0].hito, { clase: 'sin_hitos' })
})

test('la clave de bloqueos ausente deja las filas en "no se sabe", no en "nada trabado"', () => {
  const filas = filasDeAvance([espacio({})], [], undefined)

  assert.equal(filas[0].trabados, null)
  assert.equal(filas[0].esperaAlCliente, false)
})

test('la lista vacia de bloqueos si afirma que ese Proyecto no tiene nada trabado', () => {
  const filas = filasDeAvance([espacio({})], [], [])

  assert.deepEqual(filas[0].trabados, [])
})

test('lo trabado cae en el Proyecto del que salio y marca si depende del cliente', () => {
  const filas = filasDeAvance(
    [espacio({ id: 1 }), espacio({ id: 2, name: 'App' })],
    [],
    [
      bloqueo({ id: 5, project: { id: 2, name: 'App' }, responsable: 'equipo' }),
      bloqueo({ id: 6, project: { id: 2, name: 'App' }, responsable: 'cliente' })
    ]
  )

  const porId = new Map(filas.map((fila) => [fila.espacio.id, fila]))

  assert.deepEqual(porId.get(1).trabados, [])
  assert.equal(porId.get(1).esperaAlCliente, false)
  assert.equal(porId.get(2).trabados.length, 2)
  assert.equal(porId.get(2).esperaAlCliente, true)
})

test('primero lo detenido, despues lo vencido, despues el resto', () => {
  const filas = filasDeAvance(
    [
      espacio({ id: 1, name: 'Tranquilo' }),
      espacio({ id: 2, name: 'Vencido' }),
      espacio({ id: 3, name: 'Detenido' })
    ],
    [hito({ id: 20, project: { id: 2, name: 'Vencido' }, vencido: true })],
    [bloqueo({ id: 30, project: { id: 3, name: 'Detenido' }, responsable: 'equipo' })]
  )

  assert.deepEqual(filas.map((fila) => fila.espacio.name), ['Detenido', 'Vencido', 'Tranquilo'])
})

test('dentro de un mismo escalon se conserva el orden de la API', () => {
  const filas = filasDeAvance(
    [espacio({ id: 3, name: 'C' }), espacio({ id: 1, name: 'A' }), espacio({ id: 2, name: 'B' })],
    [],
    []
  )

  assert.deepEqual(filas.map((fila) => fila.espacio.name), ['C', 'A', 'B'])
})

test('cruzar no toca los arreglos de la respuesta', () => {
  // Los tres los comparte el resto de la pantalla: ordenarlos en el lugar cambiaria lo que ven los
  // bloques de abajo.
  const espacios = [espacio({ id: 2, name: 'B' }), espacio({ id: 1, name: 'A' })]
  const hitos = [hito({ project: { id: 1, name: 'A' }, vencido: true })]
  const bloqueos = [bloqueo({ project: { id: 2, name: 'B' } })]

  filasDeAvance(espacios, hitos, bloqueos)

  assert.deepEqual(espacios.map((uno) => uno.id), [2, 1])
  assert.deepEqual(hitos.length, 1)
  assert.deepEqual(bloqueos.length, 1)
})

test('sin Proyectos no hay filas que inventar', () => {
  assert.deepEqual(filasDeAvance([], [hito({})], [bloqueo({})]), [])
})

// --- Los textos de las ausencias -------------------------------------------

test('los textos de lo que falta explican la ausencia y no la disfrazan de cero', () => {
  const textos = [
    MOTIVO_SIN_EN_CURSO,
    MOTIVO_SIN_ESPACIOS,
    TEXTO_HITO_FUERA_DE_LISTA,
    TEXTO_SIN_HITOS
  ]

  for (const texto of textos) {
    assert.equal(typeof texto, 'string')
    assert.equal(texto.trim().length > 0, true)
    assert.equal(texto.includes('0'), false)
  }
})
