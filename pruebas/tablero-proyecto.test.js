/**
 * Las cuentas del tablero de un Proyecto del portal.
 *
 * Lo que se prueba es lo que se rompe en silencio, y en este tablero eso es casi siempre lo mismo:
 * un `null` aplanado a 0. La API manda `null` cuando no hay denominador, y cada vez que alguien lo
 * convierte en cero el cliente lee «no hicieron nada» donde la verdad es «no hay nada compartido
 * para medirlo». Hay una prueba por cada lugar donde eso puede pasar.
 *
 * Lo otro que se prueba son las decisiones de «no dibujar» —el estado en cero que no ocupa una
 * fila, el hito al día que no lleva barra, la clave de actividad que se omite antes que mostrarse
 * cruda— y el reparto en dos columnas, que es lo que evita que un bloque quede solo en su fila.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HITOS_VISIBLES,
  arcoDeAvance,
  barrasPorEstado,
  bloquesDelTablero,
  cifrasDelTablero,
  clavesDePrioridad,
  filasDeCifras,
  leerAvance,
  novedades,
  pendientesPorHito,
  repartirEnColumnas,
  resumenDeFila,
  resumenDePrioridades,
  resumenPorEstado,
  tarjetasDeCifras,
  tramosDePrioridad
} from '../src/componentes/portal/tablero-proyecto.ts'

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

/** El catálogo `task_statuses` del portal, con los colores de Perfex. */
const CATALOGO = [
  { id: 1, name: 'Por iniciar', color: '#f97316' },
  { id: 4, name: 'En proceso', color: '#eab308' },
  { id: 2, name: 'Esperando respuesta', color: '#84cc16' },
  { id: 6, name: 'Cambios', color: '#a855f7' },
  { id: 5, name: 'Completado', color: '#22c55e' }
]

/** Un hito como lo manda la API, con sus pendientes por estado. */
function hito (id, nombre, tareas, cerradas, porEstado = []) {
  return {
    id,
    name: nombre,
    due_date: '2026-12-31',
    tareas,
    cerradas,
    porcentaje: tareas === 0 ? null : Math.round((cerradas * 100) / tareas),
    pendientes: porEstado.reduce((suma, conteo) => suma + conteo.total, 0),
    por_estado: porEstado
  }
}

/** Un tablero con todos los bloques; `sin` quita los que se nombren, como lo haría la API. */
function tablero (sin = []) {
  const completo = {
    avance: { tareas: 40, cerradas: 22, abiertas: 18, porcentaje: 55 },
    tareas: {
      ...prioridades(2, 30, 6, 2),
      por_estado: [
        { status: 1, total: 5 }, { status: 4, total: 6 }, { status: 2, total: 4 },
        { status: 6, total: 3 }, { status: 5, total: 22 }
      ]
    },
    proxima_entrega: { id: 9, name: 'Guion del reel', duedate: '2026-09-25', dias: 3 },
    hitos: {
      lista: [
        hito(1, 'Estrategia', 6, 6),
        hito(2, 'Identidad', 10, 4, [{ status: 1, total: 2 }, { status: 4, total: 4 }]),
        hito(3, 'Piezas', 12, 5, [{ status: 4, total: 2 }, { status: 2, total: 3 }, { status: 6, total: 2 }]),
        hito(4, 'Sitio', 8, 5, [{ status: 1, total: 3 }]),
        hito(5, 'Redes', 4, 2, [{ status: 2, total: 1 }, { status: 6, total: 1 }])
      ]
    },
    actividad: Array.from({ length: 7 }, (_, i) => ({
      fecha: `2026-09-${String(20 - i).padStart(2, '0')} 10:00:00`,
      clave: 'project_activity_task_marked_complete'
    }))
  }

  for (const clave of sin) delete completo[clave]

  return completo
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
// EL ANILLO DEL MEDIDOR
// =================================================================================================

test('el arco pintado es la fracción exacta de la circunferencia', () => {
  const { circunferencia, pintado } = arcoDeAvance(50, 48)

  assert.equal(circunferencia, 2 * Math.PI * 48)
  assert.ok(Math.abs(pintado - circunferencia / 2) < 1e-9, 'el 50 % pinta media vuelta')
})

test('el arco se acota a 0-100 en vez de dar la vuelta', () => {
  const r = 48
  const completa = arcoDeAvance(100, r).pintado

  // Un porcentaje fuera de rango no debería llegar, pero si llega, un arco de 140 % da dos vueltas
  // y se lee como un 40 %. Se satura en la vuelta completa.
  assert.equal(arcoDeAvance(140, r).pintado, completa)
  assert.equal(arcoDeAvance(-10, r).pintado, 0)
})

test('sin avance medido el arco es cero, y el componente no lo dibuja', () => {
  assert.equal(arcoDeAvance(null, 48).pintado, 0)
})

// =================================================================================================
// LA BARRA APILADA DE PRIORIDADES
// =================================================================================================

test('los tramos son porcentajes del total y suman 100', () => {
  // El reparto real del Proyecto 167.
  const tramos = tramosDePrioridad(prioridades(0, 74, 6, 2))
  const suma = tramos.reduce((s, t) => s + t.porcentaje, 0)

  assert.equal(tramos.length, 3, 'la prioridad en cero no entra a la barra')
  assert.ok(Math.abs(suma - 100) < 1e-9, 'los tramos cubren la barra entera, sin hueco ni desborde')
})

test('cada tramo se queda con su paso de la rampa ordinal, no con su rango', () => {
  // El paso sale del ORDEN de la prioridad, no de cuántas tareas tenga. Si saliera del tamaño,
  // filtrar o cambiar un conteo repintaría los tramos que sobreviven y quien aprendió «Urgente es
  // el más oscuro» quedaría engañado.
  const tramos = tramosDePrioridad(prioridades(0, 74, 6, 2))
  const porPrioridad = Object.fromEntries(tramos.map((t) => [t.priority, t.paso]))

  assert.equal(porPrioridad[2], 2)
  assert.equal(porPrioridad[3], 3)
  assert.equal(porPrioridad[4], 4, 'Urgente es el cuarto paso aunque sea el tramo más chico')
})

test('el rótulo solo va adentro del tramo cuando cabe', () => {
  const tramos = tramosDePrioridad(prioridades(0, 74, 6, 2))
  const porPrioridad = Object.fromEntries(tramos.map((t) => [t.priority, t.rotuloAdentro]))

  assert.equal(porPrioridad[2], true, 'el tramo del 90 % lo aguanta')
  // 6 de 82 es 7,3 % y 2 de 82 es 2,4 %: ahí «Alto» y «Urgente» se recortarían. Un rótulo cortado
  // por la mitad es peor que ninguno; lo lleva la leyenda.
  assert.equal(porPrioridad[3], false)
  assert.equal(porPrioridad[4], false)
})

test('sin tareas no hay barra que dibujar', () => {
  assert.deepEqual(tramosDePrioridad(prioridades(0, 0, 0, 0)), [])
})

test('la leyenda sale con las cuatro prioridades, también las que están en cero', () => {
  const claves = clavesDePrioridad(prioridades(0, 0, 0, 1))

  assert.equal(claves.length, 4, 'la leyenda es donde el cliente lee el cero')
  assert.equal(claves[0].total, 0)
  assert.deepEqual(claves.map((c) => c.paso), [1, 2, 3, 4])
})

test('el resumen accesible nombra solo las prioridades que tienen tareas', () => {
  const resumen = resumenDePrioridades(prioridades(0, 74, 6, 2))

  assert.match(resumen, /82 tareas/, 'el total sale del dato, no del catálogo')
  assert.match(resumen, /74 en Medio/)
  assert.doesNotMatch(resumen, /Bajo/, 'la prioridad vacía no se lee en voz alta')
})

test('sin nada que repartir el resumen lo dice en vez de quedar en blanco', () => {
  assert.match(resumenDePrioridades(prioridades(0, 0, 0, 0)), /Sin tareas/)
})

// =================================================================================================
// LAS TAREAS POR ESTADO
// =================================================================================================

test('los estados en cero no ocupan una fila, y el orden es el del catálogo', () => {
  const barras = barrasPorEstado([
    { status: 1, total: 0 }, { status: 4, total: 6 }, { status: 2, total: 0 }, { status: 5, total: 12 }
  ], CATALOGO)

  assert.deepEqual(barras.map((b) => b.status), [4, 5])
})

test('cada barra lleva el nombre y el color del catálogo, no uno inventado', () => {
  const [barra] = barrasPorEstado([{ status: 6, total: 3 }], CATALOGO)

  assert.equal(barra.etiqueta, 'Cambios')
  assert.equal(barra.color, '#a855f7')
  assert.equal(barra.desconocido, false)
})

test('un estado fuera del catálogo se cuenta igual, sin color y marcado como desconocido', () => {
  const barras = barrasPorEstado([{ status: 1, total: 2 }, { status: 3, total: 1 }], CATALOGO)
  const retirado = barras.find((b) => b.status === 3)

  assert.equal(retirado.desconocido, true, 'se pinta con contorno, como la insignia')
  assert.equal(retirado.color, null, 'no puede llevar el color de otro estado')
  assert.equal(retirado.etiqueta, '#3')
})

test('un estado del catálogo sin color queda en null, para el tono neutro', () => {
  const [barra] = barrasPorEstado([{ status: 7, total: 1 }], [{ id: 7, name: 'Pausado' }])

  assert.equal(barra.color, null)
  assert.equal(barra.desconocido, false)
})

test('la barra más larga es la del estado con más tareas', () => {
  const barras = barrasPorEstado([{ status: 1, total: 5 }, { status: 5, total: 20 }], CATALOGO)

  assert.deepEqual(barras.map((b) => b.fraccion), [0.25, 1])
  assert.deepEqual(barras.map((b) => b.porcentaje), [20, 80])
})

test('sin catálogo los estados igual se cuentan, como desconocidos', () => {
  const barras = barrasPorEstado([{ status: 1, total: 2 }], undefined)

  assert.equal(barras.length, 1)
  assert.equal(barras[0].desconocido, true)
})

test('el resumen accesible por estado dice los números, y el vacío lo dice también', () => {
  const barras = barrasPorEstado([{ status: 1, total: 2 }, { status: 5, total: 8 }], CATALOGO)

  assert.equal(resumenPorEstado(barras), '10 tareas: 2 en Por iniciar, 8 en Completado.')
  assert.match(resumenPorEstado([]), /Sin tareas/)
})

// =================================================================================================
// LAS PENDIENTES POR HITO
// =================================================================================================

test('un hito al día no lleva barra, pero se cuenta en el total de hitos', () => {
  const lectura = pendientesPorHito(tablero().hitos.lista, CATALOGO)

  assert.deepEqual(lectura.filas.map((f) => f.nombre), ['Identidad', 'Piezas', 'Sitio', 'Redes'])
  assert.equal(lectura.hitos, 5)
  assert.equal(lectura.total, 6 + 7 + 3 + 2)
})

test('el largo va en escala común: el hito más cargado llena el carril', () => {
  const lectura = pendientesPorHito(tablero().hitos.lista, CATALOGO)
  const porNombre = Object.fromEntries(lectura.filas.map((f) => [f.nombre, f]))

  assert.equal(porNombre.Piezas.fraccion, 1)
  assert.equal(porNombre.Redes.fraccion, 2 / 7, 'estirada a su propio 100 % se vería igual que Piezas')
})

test('los tramos de un hito suman el 100 % de su barra y llevan el color del estado', () => {
  const [, piezas] = pendientesPorHito(tablero().hitos.lista, CATALOGO).filas
  const suma = piezas.tramos.reduce((total, tramo) => total + tramo.porcentaje, 0)

  assert.ok(Math.abs(suma - 100) < 1e-9)
  assert.deepEqual(piezas.tramos.map((t) => t.color), ['#eab308', '#84cc16', '#a855f7'])
})

test('la leyenda nombra cada estado una sola vez, en el orden del catálogo', () => {
  const lectura = pendientesPorHito([
    hito(1, 'A', 3, 0, [{ status: 6, total: 1 }, { status: 3, total: 1 }]),
    hito(2, 'B', 3, 0, [{ status: 1, total: 2 }, { status: 6, total: 1 }])
  ], CATALOGO)

  // El desconocido va al final, donde también lo pone la API.
  assert.deepEqual(lectura.leyenda.map((e) => e.status), [1, 6, 3])
})

test('sin hitos, o con todos al día, no hay filas', () => {
  assert.deepEqual(pendientesPorHito([], CATALOGO).filas, [])

  const alDia = pendientesPorHito([hito(1, 'A', 4, 4), hito(2, 'B', 0, 0)], CATALOGO)

  assert.deepEqual(alDia.filas, [])
  assert.equal(alDia.hitos, 2, 'la pantalla tiene que poder decir «todo al día» y no «no hay hitos»')
})

test('el resumen accesible de una fila nombra sus pendientes por estado', () => {
  const [identidad] = pendientesPorHito(tablero().hitos.lista, CATALOGO).filas

  assert.equal(resumenDeFila(identidad), 'Identidad: 6 pendientes, 2 en Por iniciar, 4 en En proceso.')
})

test('el techo de filas a la vista es seis', () => {
  assert.equal(HITOS_VISIBLES, 6)
})

// =================================================================================================
// EL REPARTO EN COLUMNAS
// =================================================================================================

/** Reparte el tablero de prueba sin los bloques que se nombren. */
function repartir (sin = []) {
  return repartirEnColumnas(bloquesDelTablero(tablero(sin), CATALOGO))
}

/** Lo que tiene que valer en cualquier reparto: cada bloque una vez y cada columna en orden. */
function comprobarReparto (columnas, esperados) {
  const todos = [...columnas.estrecha, ...columnas.ancha]

  assert.deepEqual([...todos].sort(), [...esperados].sort(), 'cada bloque presente va una sola vez')

  if (esperados.length > 1) {
    assert.ok(columnas.estrecha.length > 0 && columnas.ancha.length > 0, 'ninguna columna queda vacía')
  }
}

test('todo presente: el medidor, las cifras y los estados a la izquierda; lo largo a la derecha', () => {
  const columnas = repartir()

  comprobarReparto(columnas, ['avance', 'cifras', 'estados', 'prioridades', 'hitos', 'novedades'])
  assert.deepEqual(columnas.estrecha, ['avance', 'cifras', 'estados'])
  assert.deepEqual(columnas.ancha, ['hitos', 'prioridades', 'novedades'])
})

test('sin la pestaña de tareas: se van cifras, estados y prioridades, y nadie queda solo', () => {
  const columnas = repartir(['tareas', 'proxima_entrega'])

  comprobarReparto(columnas, ['avance', 'hitos', 'novedades'])
  assert.deepEqual(columnas.estrecha, ['avance'])
  assert.deepEqual(columnas.ancha, ['hitos', 'novedades'])
})

test('sin hitos: los estados cruzan a la columna ancha para que las dos terminen parejas', () => {
  const columnas = repartir(['hitos'])

  comprobarReparto(columnas, ['avance', 'cifras', 'estados', 'prioridades', 'novedades'])
  assert.deepEqual(columnas.estrecha, ['avance', 'cifras', 'prioridades'])
  assert.deepEqual(columnas.ancha, ['estados', 'novedades'])
})

test('sin actividad: la columna ancha se completa con los estados', () => {
  const columnas = repartir(['actividad'])

  comprobarReparto(columnas, ['avance', 'cifras', 'estados', 'prioridades', 'hitos'])
  assert.deepEqual(columnas.estrecha, ['avance', 'cifras'])
  assert.deepEqual(columnas.ancha, ['hitos', 'estados', 'prioridades'])
})

test('solo el avance: va a la columna ancha y no se estira a las doce', () => {
  const columnas = repartir(['tareas', 'proxima_entrega', 'hitos', 'actividad'])

  assert.deepEqual(columnas, { estrecha: [], ancha: ['avance'] })
})

test('sin bloques no hay columnas, y el orden de entrada no importa', () => {
  assert.deepEqual(repartirEnColumnas([]), { estrecha: [], ancha: [] })

  const bloques = bloquesDelTablero(tablero(), CATALOGO)

  assert.deepEqual(repartirEnColumnas([...bloques].reverse()), repartirEnColumnas(bloques))
})

test('las columnas terminan cerca: la diferencia es menor que el bloque más chico', () => {
  for (const sin of [[], ['hitos'], ['actividad'], ['tareas', 'proxima_entrega']]) {
    const bloques = bloquesDelTablero(tablero(sin), CATALOGO)
    const columnas = repartirEnColumnas(bloques)
    const peso = Object.fromEntries(bloques.map((b) => [b.bloque, b.peso]))
    const carga = (lado) => columnas[lado].reduce((suma, b) => suma + peso[b], 0)
    const menor = Math.min(...bloques.map((b) => b.peso))

    assert.ok(Math.abs(carga('estrecha') - carga('ancha')) < Math.max(menor, 20), `sin ${sin.join(', ')}`)
  }
})

// =================================================================================================
// LAS TARJETAS DE CIFRA
// =================================================================================================

test('cuatro tarjetas van en dos filas de dos; tres, en una', () => {
  assert.equal(filasDeCifras(4), 2)
  assert.equal(filasDeCifras(3), 1)
  assert.equal(filasDeCifras(0), 0)
})

test('la próxima entrega suma una tarjeta solo cuando hay una', () => {
  assert.equal(tarjetasDeCifras(tablero()), 4)
  assert.equal(tarjetasDeCifras({ ...tablero(), proxima_entrega: null }), 3)
  assert.equal(tarjetasDeCifras(tablero(['tareas', 'proxima_entrega'])), 0)
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

test('son tres cifras, y «cerradas en 30 días» no está', () => {
  const cifras = cifrasDelTablero({
    ...prioridades(0, 1, 0, 0),
    vencidas: 1,
    sin_fecha: 1,
    cerradas_7: 1,
    cerradas_30: 9
  })

  assert.equal(cifras.length, 3)
  // Treinta días es un mes entero: en un proyecto tranquilo esa cifra repite lo que el medidor de
  // avance ya dice, y una cifra que repite otro bloque es el relleno que el usuario rechazó.
  assert.ok(!cifras.some((c) => c.clave === 'cerradas_30'), 'no se repite lo que el medidor ya muestra')
  assert.ok(cifras.every((c) => c.etiqueta.length > 0), 'un número sin rótulo es justo lo que se rechazó')
})
