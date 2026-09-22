/**
 * Las cuentas del tablero de un Proyecto del portal.
 *
 * Lo que se prueba es lo que se rompe en silencio, y en este tablero eso es casi siempre lo mismo:
 * un `null` aplanado a 0. La API manda `null` cuando no hay denominador, y cada vez que alguien lo
 * convierte en cero el cliente lee «no hicieron nada» donde la verdad es «no hay nada compartido
 * para medirlo». Hay una prueba por cada lugar donde eso puede pasar.
 *
 * Lo otro que se prueba son las decisiones de «no dibujar»: la serie de cierres que se niega a
 * fingir una tendencia con dos barras, el hito que no se marca atrasado porque ya se entregó, y la
 * clave de actividad que se omite antes que mostrarse cruda.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SALVEDAD_DE_FECHAS,
  SEMANAS_CON_DATO_MINIMAS,
  TICKET_CERRADO,
  TOPE_DE_PERSONAS,
  barrasDePrioridad,
  cifrasDelTablero,
  contarTickets,
  filasDePersonas,
  leerAvance,
  leerCierres,
  lineaDeHitos,
  novedades,
  resumenDeCierres,
  resumenDeHitos,
  resumenDePrioridades
} from '../src/componentes/portal/tablero-proyecto.ts'

const HOY = '2026-09-22'

/** Un bloque de prioridades con las cuatro del catálogo, como lo manda la API. */
function prioridades (bajo, medio, alto, urgente) {
  return {
    por_prioridad: [
      { priority: 1, name: 'Bajo', total: bajo },
      { priority: 2, name: 'Medio', total: medio },
      { priority: 3, name: 'Alto', total: alto },
      { priority: 4, name: 'Urgente', total: urgente }
    ],
    vencidas: 0,
    sin_fecha: 0,
    cerradas_7: 0,
    cerradas_30: 0
  }
}

/** Una semana de la serie. */
function semana (lunes, cerradas, parcial = false) {
  return { semana: lunes, cerradas, parcial }
}

/** Doce semanas consecutivas terminando en el lunes de HOY, con los cierres que se le pasen. */
function serieDe (cerradasPorSemana) {
  const lunes = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10',
    '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']

  return lunes.map((dia, i) => semana(dia, cerradasPorSemana[i] ?? 0, i === lunes.length - 1))
}

/** Un hito como lo manda la API. */
function hito (id, nombre, fecha, tareas, cerradas) {
  return {
    id,
    name: nombre,
    due_date: fecha,
    tareas,
    cerradas,
    porcentaje: tareas === 0 ? null : Math.round((cerradas * 100) / tareas)
  }
}

// =================================================================================================
// EL AVANCE
// =================================================================================================

test('un proyecto sin tareas visibles no está al 0 %: no tiene avance medido', () => {
  const lectura = leerAvance({ tareas: 0, cerradas: 0, abiertas: 0, porcentaje: null })

  assert.equal(lectura.porcentaje, null, 'el null se propaga, no se aplana a 0')
  assert.notEqual(lectura.motivo, '', 'y trae el motivo para que la pantalla escriba algo')
})

test('un 0 % medido sí es un 0 %', () => {
  const lectura = leerAvance({ tareas: 4, cerradas: 0, abiertas: 4, porcentaje: 0 })

  assert.equal(lectura.porcentaje, 0)
  assert.equal(lectura.motivo, '', 'con denominador no hace falta explicar nada')
})

test('el avance no recalcula: repite lo que dijo la API', () => {
  // Deliberadamente incoherente: 3 de 4 no es 99 %. Si esta prueba se cae es porque alguien puso a
  // la pantalla a hacer la cuenta, y entonces habría dos porcentajes distintos para el mismo
  // proyecto según quién lo mire.
  const lectura = leerAvance({ tareas: 4, cerradas: 3, abiertas: 1, porcentaje: 99 })

  assert.equal(lectura.porcentaje, 99)
})

// =================================================================================================
// LAS PRIORIDADES
// =================================================================================================

test('las prioridades se miden contra la más poblada, no contra el total', () => {
  // El caso real del Proyecto 167: 74 de 82 en «Medio». Contra el total, «Alto» con 6 quedaría en
  // 0,07 y sería un píxel: la comparación entre Alto y Urgente, que es la única que el gráfico
  // ofrece, se perdería.
  const barras = barrasDePrioridad(prioridades(0, 74, 6, 2))

  assert.equal(barras[1].fraccion, 1, 'la más poblada llena la barra')
  assert.equal(barras[2].fraccion, 6 / 74)
  assert.equal(barras[3].fraccion, 2 / 74)
})

test('las cuatro prioridades salen siempre, también las que están en cero', () => {
  const barras = barrasDePrioridad(prioridades(0, 0, 0, 1))

  assert.equal(barras.length, 4, 'una lista que cambia de largo obliga a releer los rótulos')
  assert.equal(barras[0].total, 0)
  assert.equal(barras[0].fraccion, 0)
})

test('sin ninguna tarea no se divide por cero', () => {
  const barras = barrasDePrioridad(prioridades(0, 0, 0, 0))

  assert.ok(barras.every((b) => b.fraccion === 0), 'todas en 0, ninguna NaN')
  assert.match(resumenDePrioridades(barras), /Sin tareas/)
})

test('el resumen accesible nombra solo las prioridades que tienen tareas', () => {
  const resumen = resumenDePrioridades(barrasDePrioridad(prioridades(0, 74, 6, 2)))

  assert.match(resumen, /82 tareas/, 'el total sale del dato, no del catálogo')
  assert.match(resumen, /74 en Medio/)
  assert.doesNotMatch(resumen, /Bajo/, 'la prioridad vacía no se lee en voz alta')
})

// =================================================================================================
// LA SERIE DE CIERRES
// =================================================================================================

test('con menos de tres semanas con cierres la serie no se dibuja', () => {
  const lectura = leerCierres(serieDe([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1]))

  assert.equal(lectura.semanasConDato, 2)
  assert.equal(lectura.valeDibujarla, false, 'dos barras sobre diez semanas vacías no son una tendencia')
  assert.equal(lectura.total, 3, 'pero los números siguen disponibles para escribirlos')
})

test('con tres semanas con cierres ya vale dibujarla', () => {
  const lectura = leerCierres(serieDe([1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1]))

  assert.equal(lectura.semanasConDato, SEMANAS_CON_DATO_MINIMAS)
  assert.equal(lectura.valeDibujarla, true)
})

test('la escala es la mejor semana de la propia serie', () => {
  const lectura = leerCierres(serieDe([6, 1, 3, 0, 0, 2, 0, 0, 1, 0, 0, 2]))

  assert.equal(lectura.puntos[0].fraccion, 1, 'la semana de 6 llena la barra')
  assert.equal(lectura.puntos[1].fraccion, 1 / 6)
})

test('las semanas sin cierres van en 0 y no se omiten', () => {
  const lectura = leerCierres(serieDe([2, 0, 0, 3, 0, 0, 1, 0, 0, 0, 0, 0]))

  assert.equal(lectura.puntos.length, 12, 'sin los ceros la línea sería continua sobre semanas quietas')
  assert.equal(lectura.puntos[1].cerradas, 0)
  assert.equal(lectura.puntos[1].fraccion, 0)
})

test('la semana en curso llega marcada y con su valor real, sin extrapolar', () => {
  const lectura = leerCierres(serieDe([3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1]))
  const ultima = lectura.puntos[lectura.puntos.length - 1]

  assert.equal(ultima.parcial, true)
  assert.equal(ultima.cerradas, 1, 'un 1 de tres días no se proyecta a la semana entera')
  assert.ok(lectura.puntos.slice(0, -1).every((p) => p.parcial === false))
})

test('una serie vacía no divide por cero y lo dice', () => {
  const lectura = leerCierres(serieDe([]))

  assert.equal(lectura.total, 0)
  assert.equal(lectura.valeDibujarla, false)
  assert.ok(lectura.puntos.every((p) => p.fraccion === 0))
  assert.match(resumenDeCierres(lectura), /Ninguna tarea cerrada/)
})

test('el resumen accesible de la serie nombra la mejor semana', () => {
  const resumen = resumenDeCierres(leerCierres(serieDe([1, 0, 7, 0, 1, 0, 0, 0, 0, 0, 0, 0])))

  assert.match(resumen, /9 tareas cerradas/)
  assert.match(resumen, /con 7/)
})

// =================================================================================================
// LOS HITOS
// =================================================================================================

test('un proyecto sin hitos da una línea vacía y no revienta', () => {
  const linea = lineaDeHitos({ fechas_confiables: true, lista: [] }, HOY)

  assert.deepEqual(linea.marcas, [])
  assert.equal(linea.sinFecha, 0)
  assert.match(resumenDeHitos(linea), /todavía no tiene/)
})

test('la ventana siempre incluye hoy, también con todos los hitos en el futuro', () => {
  const linea = lineaDeHitos({
    fechas_confiables: true,
    lista: [hito(1, 'Entrega', '2026-12-31', 2, 0)]
  }, HOY)

  assert.equal(linea.desde, 0, 'hoy es el extremo izquierdo cuando no hay nada vencido')
  assert.ok(linea.hasta > 0)
  assert.equal(linea.hoy, 0, 'y la marca de hoy cae en el borde, que es donde tiene que estar')
})

test('la ventana se estira hacia atrás cuando hay hitos vencidos', () => {
  const linea = lineaDeHitos({
    fechas_confiables: true,
    lista: [hito(1, 'Vieja', '2026-08-22', 2, 0), hito(2, 'Nueva', '2026-10-22', 2, 0)]
  }, HOY)

  assert.equal(linea.desde, -31)
  assert.equal(linea.hasta, 30)
  assert.ok(linea.hoy > 0 && linea.hoy < 1, 'hoy cae dentro de la ventana, no en un borde')
})

test('atrasado exige fecha pasada Y trabajo abierto', () => {
  const linea = lineaDeHitos({
    fechas_confiables: true,
    lista: [
      hito(1, 'Entregado tarde pero entregado', '2026-08-01', 3, 3),
      hito(2, 'De verdad atrasado', '2026-08-01', 3, 1)
    ]
  }, HOY)

  assert.equal(linea.marcas[0].atrasado, false, 'llamar atraso a una entrega es mentir')
  assert.equal(linea.marcas[0].cumplido, true)
  assert.equal(linea.marcas[1].atrasado, true)
  assert.equal(linea.marcas[1].cumplido, false)
})

test('un hito sin tareas visibles no está cumplido ni al 0 %', () => {
  const linea = lineaDeHitos({
    fechas_confiables: true,
    lista: [hito(1, 'Sin tareas compartidas', '2026-08-01', 0, 0)]
  }, HOY)

  assert.equal(linea.marcas[0].porcentaje, null, 'el null no se aplana')
  assert.equal(linea.marcas[0].cumplido, false, '0 de 0 no es «todo hecho»')
  assert.equal(linea.marcas[0].atrasado, false, 'y tampoco es un atraso: no hay trabajo que falte')
})

test('los hitos sin fecha se cuentan y no van al eje', () => {
  const linea = lineaDeHitos({
    fechas_confiables: true,
    lista: [hito(1, 'Con fecha', '2026-10-01', 1, 0), hito(2, 'Sin fecha', null, 1, 1)]
  }, HOY)

  assert.equal(linea.sinFecha, 1)
  assert.equal(linea.marcas.length, 2, 'esconderlo le restaría un hito al cliente')
  assert.equal(linea.marcas[1].posicion, null, 'pero no tiene dónde ir en el eje')
  assert.equal(linea.marcas[1].etiqueta, '')
})

test('la salvedad aparece cuando las fechas son de relleno, y el gráfico se dibuja igual', () => {
  // El caso real: los hitos del Proyecto 167 son «HTML», «REELS» y «Propuestas», todos al 31 de
  // diciembre. El usuario decidió dibujar el eje igual; la salvedad es lo que evita que el cliente
  // lea una promesa donde hay un placeholder.
  const linea = lineaDeHitos({
    fechas_confiables: false,
    lista: [hito(1, 'HTML', '2026-12-31', 3, 3), hito(2, 'REELS', '2026-12-31', 1, 0)]
  }, HOY)

  assert.equal(linea.salvedad, SALVEDAD_DE_FECHAS)
  assert.equal(linea.marcas.length, 2, 'la salvedad no esconde el gráfico')
  assert.ok(linea.marcas.every((m) => m.posicion !== null))
})

test('sin salvedad cuando las fechas aguantan el eje', () => {
  const linea = lineaDeHitos({
    fechas_confiables: true,
    lista: [hito(1, 'Kickoff', '2026-09-15', 1, 1)]
  }, HOY)

  assert.equal(linea.salvedad, '')
})

test('la fecha viaja tal como está guardada, sin redondeos', () => {
  const linea = lineaDeHitos({
    fechas_confiables: false,
    lista: [hito(1, 'HTML', '2026-12-31', 1, 0)]
  }, HOY)

  assert.equal(linea.marcas[0].fecha, '2026-12-31', 'ni se redondea al mes ni se vuelve «en N días»')
})

test('el resumen accesible de los hitos cuenta cumplidos, atrasados y sin fecha', () => {
  const resumen = resumenDeHitos(lineaDeHitos({
    fechas_confiables: true,
    lista: [
      hito(1, 'Hecho', '2026-08-01', 2, 2),
      hito(2, 'Atrasado', '2026-08-01', 2, 0),
      hito(3, 'Sin fecha', null, 1, 0)
    ]
  }, HOY))

  assert.match(resumen, /3 hitos/)
  assert.match(resumen, /1 cumplidos/)
  assert.match(resumen, /1 atrasados/)
  assert.match(resumen, /1 sin fecha/)
})

// =================================================================================================
// EL EQUIPO
// =================================================================================================

test('el equipo se ordena por trabajo abierto, no por total', () => {
  const filas = filasDePersonas([
    { id: 1, full_name: 'Mucha historia', abiertas: 1, cerradas: 90 },
    { id: 2, full_name: 'Mucho ahora', abiertas: 9, cerradas: 2 }
  ])

  assert.equal(filas[0].id, 2, 'la pregunta es quién está con esto hoy')
})

test('quien no tiene nada abierto aparece igual, al final', () => {
  const filas = filasDePersonas([
    { id: 1, full_name: 'Sin nada', abiertas: 0, cerradas: 7 },
    { id: 2, full_name: 'Con trabajo', abiertas: 3, cerradas: 0 }
  ])

  assert.equal(filas.length, 2, 'sacarlo dibujaría un equipo más chico que el real')
  assert.equal(filas[1].id, 1)
  assert.equal(filas[1].fraccion, 0)
})

test('un equipo sin nada abierto no divide por cero', () => {
  const filas = filasDePersonas([
    { id: 1, full_name: 'A', abiertas: 0, cerradas: 3 },
    { id: 2, full_name: 'B', abiertas: 0, cerradas: 1 }
  ])

  assert.ok(filas.every((f) => f.fraccion === 0))
})

test('el equipo se recorta al tope y el desempate es estable', () => {
  const equipo = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    full_name: `Persona ${String(i + 1).padStart(2, '0')}`,
    abiertas: 0,
    cerradas: 0
  }))

  const filas = filasDePersonas(equipo)

  assert.equal(filas.length, TOPE_DE_PERSONAS)
  // Con todo empatado manda el nombre: sin ese tercer criterio el recorte elegiría a doce personas
  // distintas en cada render y la lista bailaría sola.
  assert.equal(filas[0].nombre, 'Persona 01')
})

test('el orden no muta la lista que llegó', () => {
  const equipo = [
    { id: 1, full_name: 'A', abiertas: 1, cerradas: 0 },
    { id: 2, full_name: 'B', abiertas: 5, cerradas: 0 }
  ]

  filasDePersonas(equipo)

  assert.equal(equipo[0].id, 1, 'ordenar sobre el array del llamador rompe a quien lo comparta')
})

// =================================================================================================
// LAS NOVEDADES
// =================================================================================================

test('una clave que la pantalla no sabe decir se omite, no se muestra cruda', () => {
  const lista = novedades([
    { fecha: '2026-09-11 14:50:02', clave: 'project_activity_task_marked_complete' },
    { fecha: '2026-09-10 09:00:00', clave: 'project_activity_clave_nueva_de_perfex' }
  ], 6)

  assert.equal(lista.length, 1, 'antes que un identificador crudo, la línea no va')
  assert.match(lista[0].texto, /Se completó una tarea/)
})

test('las novedades se recortan al tope', () => {
  const feed = Array.from({ length: 15 }, (_, i) => ({
    fecha: `2026-09-${String(i + 1).padStart(2, '0')} 10:00:00`,
    clave: 'project_activity_task_marked_complete'
  }))

  assert.equal(novedades(feed, 6).length, 6)
})

test('un feed sin ninguna clave conocida da lista vacía', () => {
  const lista = novedades([{ fecha: '2026-09-11 14:50:02', clave: 'lo_que_sea' }], 6)

  assert.deepEqual(lista, [])
})

// =================================================================================================
// LOS TICKETS
// =================================================================================================

test('los tickets se parten en abiertos y cerrados', () => {
  const conteo = contarTickets([
    { status: 1 }, { status: 2 }, { status: TICKET_CERRADO }, { status: 3 }, { status: TICKET_CERRADO }
  ])

  assert.deepEqual(conteo, { abiertos: 3, cerrados: 2, total: 5 })
})

test('sin tickets los tres números son 0 y eso es un dato, no un hueco', () => {
  assert.deepEqual(contarTickets([]), { abiertos: 0, cerrados: 0, total: 0 })
})

// =================================================================================================
// LAS CIFRAS
// =================================================================================================

test('solo las vencidas pueden llevar alarma', () => {
  const cifras = cifrasDelTablero({
    ...prioridades(0, 1, 0, 0),
    vencidas: 16,
    sin_fecha: 4,
    cerradas_7: 0,
    cerradas_30: 1
  })

  const porClave = Object.fromEntries(cifras.map((c) => [c.clave, c]))

  assert.equal(porClave.vencidas.alarma, true)
  // Cero cierres esta semana no es una mala noticia en sí: un proyecto puede estar entre entregas.
  // Pintarlo de rojo sería una opinión disfrazada de dato.
  assert.equal(porClave.cerradas_7.alarma, false)
  assert.equal(porClave.sin_fecha.alarma, false)
})

test('sin vencidas no hay alarma', () => {
  const cifras = cifrasDelTablero({
    ...prioridades(0, 1, 0, 0),
    vencidas: 0,
    sin_fecha: 0,
    cerradas_7: 3,
    cerradas_30: 9
  })

  assert.ok(cifras.every((c) => c.alarma === false))
})

test('son cuatro cifras y cada una tiene rótulo', () => {
  const cifras = cifrasDelTablero({
    ...prioridades(0, 1, 0, 0),
    vencidas: 1,
    sin_fecha: 1,
    cerradas_7: 1,
    cerradas_30: 1
  })

  assert.equal(cifras.length, 4)
  assert.ok(cifras.every((c) => c.etiqueta.length > 0), 'un número sin rótulo es justo lo que se rechazó')
})
