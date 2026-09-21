/**
 * Pruebas del lector del dashboard del cliente.
 *
 * Lo que se prueba no es maquetado: es la diferencia entre "cero" y "no se sabe". `GET
 * /portal/resumen` manda `esperando_tu_respuesta` en `null` cuando no hay de donde contarlo, y no
 * manda la clave `procesos` cuando ningun Proyecto comparte su lista de Tareas. Si la pantalla
 * tradujera cualquiera de las dos cosas a un 0, le estaria diciendo al cliente "no te falta nada"
 * justo en el unico numero de la portada que le pide una accion.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVO_SIN_BLOQUEOS,
  MOTIVO_SIN_ESPERA,
  MOTIVO_SIN_FECHA_PROXIMA,
  MOTIVO_SIN_PROCESOS,
  MOTIVO_SIN_PROXIMOS_DIAS,
  etiquetaDeResponsable,
  hayQueDibujarElResumen,
  leerBloqueos,
  leerEspera,
  leerHitos,
  leerProximosDias,
  leerProximosHitos,
  leerTickets,
  ordenarEstados,
  textoDeAntiguedad
} from '../src/componentes/portal/resumen.ts'

test('null no es cero: sin dato se lee como "no se sabe"', () => {
  assert.deepEqual(leerEspera(null), { clase: 'no_se_sabe' })
})

test('cero es cero: no hay nada esperando al cliente', () => {
  assert.deepEqual(leerEspera(0), { clase: 'al_dia' })
})

test('un pendiente viaja con su cantidad', () => {
  assert.deepEqual(leerEspera(3), { clase: 'pendiente', cuantas: 3 })
})

test('una clave que dejara de venir degrada a "no se sabe" y no a NaN', () => {
  // El contrato dice que `esperando_tu_respuesta` viaja siempre. Si algun dia dejara de viajar, la
  // portada tiene que decir que no sabe, no dibujar un hueco roto.
  assert.deepEqual(leerEspera(undefined), { clase: 'no_se_sabe' })
  assert.deepEqual(leerEspera(Number.NaN), { clase: 'no_se_sabe' })
})

test('un numero negativo no se dibuja como pendiente', () => {
  assert.deepEqual(leerEspera(-2), { clase: 'al_dia' })
})

test('los dos motivos explican la ausencia y no la disfrazan de cero', () => {
  for (const motivo of [MOTIVO_SIN_ESPERA, MOTIVO_SIN_PROCESOS]) {
    assert.equal(typeof motivo, 'string')
    assert.equal(motivo.trim().length > 0, true)
    assert.equal(motivo.includes('0'), false)
  }
})

test('sin hitos comprometidos no se dice que esta todo al dia', () => {
  // "Al dia" sobre cero hitos es un cartel verde sobre la nada: no hay contra que estar al dia.
  assert.deepEqual(leerHitos({ total: 0, overdue: 0 }), { clase: 'sin_hitos' })
})

test('los hitos vencidos se separan del total', () => {
  assert.deepEqual(leerHitos({ total: 6, overdue: 2 }), { clase: 'vencidos', cuantos: 2, total: 6 })
})

test('con hitos y ninguno vencido, el cliente esta al dia', () => {
  assert.deepEqual(leerHitos({ total: 6, overdue: 0 }), { clase: 'al_dia', total: 6 })
})

test('el desglose se ordena por el catalogo y no por como llego', () => {
  const estados = [
    { status: 4, name: 'Terminado', color: '#22c55e', order: 100, total: 1 },
    { status: 2, name: 'En progreso', color: '#3b82f6', order: 2, total: 5 },
    { status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 0 }
  ]

  assert.deepEqual(ordenarEstados(estados).map((e) => e.status), [1, 2, 4])
})

test('ordenar no muta el arreglo de la respuesta', () => {
  // El mismo resumen lo leen varios bloques: ordenarlo en el lugar cambiaria lo que ven los demas.
  const estados = [
    { status: 4, name: 'Terminado', color: '#22c55e', order: 100, total: 1 },
    { status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 0 }
  ]

  ordenarEstados(estados)

  assert.deepEqual(estados.map((e) => e.status), [4, 1])
})

test('los estados en cero se conservan', () => {
  // La API los manda siempre para que la fila de insignias no cambie de forma segun el cliente.
  const estados = [
    { status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 0 },
    { status: 2, name: 'En progreso', color: '#3b82f6', order: 2, total: 3 }
  ]

  assert.equal(ordenarEstados(estados).length, 2)
})

test('un contacto sin ningun proyecto no ve una grilla de ceros', () => {
  const vacio = {
    espacios: { total: 0, by_status: [] },
    esperando_tu_respuesta: 0,
    hitos: { total: 0, overdue: 0 }
  }

  assert.equal(hayQueDibujarElResumen(vacio), false)
})

test('con un solo proyecto ya hay algo que contar', () => {
  const uno = {
    espacios: { total: 1, by_status: [{ status: 1, name: 'No iniciado', color: '#64748b', order: 1, total: 1 }] },
    esperando_tu_respuesta: null,
    hitos: { total: 0, overdue: 0 }
  }

  assert.equal(hayQueDibujarElResumen(uno), true)
})

/*
 * Los dos bloques que la portada dibuja debajo de los numeros: los Hitos que vienen y lo que esta
 * trabado. Lo que se prueba sigue siendo lo mismo —la diferencia entre "no hay" y "no se sabe"—,
 * con una vuelta de tuerca: en `bloqueados` las DOS cosas existen. La clave ausente es "no se
 * puede saber" y la lista vacia es "no tenes nada trabado", y confundirlas tranquiliza al cliente
 * sobre algo que nadie miro.
 */

/**
 * Un Proceso trabado con la forma del contrato.
 *
 * @param {object} campos Lo que cambia respecto del caso base.
 * @returns {object} La fila lista para `leerBloqueos()`.
 */
function bloqueo (campos) {
  return {
    id: 1,
    name: 'Rediseño de la ficha',
    project: { id: 7, name: 'Sitio corporativo' },
    motivo: 'Falta confirmar la paleta.',
    accion_necesaria: null,
    responsable: null,
    bloqueado_en: '2026-09-01T12:00:00Z',
    dias_bloqueada: 13,
    ...campos
  }
}

test('la clave ausente y la lista vacia NO se leen igual', () => {
  // Es la distincion entera de este bloque: sin ella la portada le diria "no hay nada trabado" a un
  // cliente cuyos bloqueos nadie pudo mirar.
  assert.deepEqual(leerBloqueos(undefined), { clase: 'no_se_sabe' })
  assert.deepEqual(leerBloqueos([]), { clase: 'sin_bloqueos' })
})

test('un null tambien es "no se sabe" y no una lista vacia', () => {
  assert.deepEqual(leerBloqueos(null), { clase: 'no_se_sabe' })
})

test('lo que depende del cliente va primero, aunque llegue ultimo', () => {
  // El servidor ya los ordena asi, pero sin las columnas de la migracion 0699 no tiene por donde: la
  // pantalla no puede depender de que el orden venga hecho.
  const lectura = leerBloqueos([
    bloqueo({ id: 1, responsable: 'equipo' }),
    bloqueo({ id: 2, responsable: 'tercero' }),
    bloqueo({ id: 3, responsable: 'cliente' })
  ])

  assert.equal(lectura.clase, 'trabados')
  assert.deepEqual(lectura.filas.map((fila) => fila.id), [3, 1, 2])
  assert.equal(lectura.deTuLado, 1)
})

test('el reordenado es estable: dentro de cada grupo manda el orden del servidor', () => {
  // El servidor los manda del mas antiguo al mas nuevo. Si el reordenado no fuera estable, la
  // pantalla cambiaria ese criterio sin que nadie lo hubiera decidido.
  const lectura = leerBloqueos([
    bloqueo({ id: 1, responsable: 'cliente' }),
    bloqueo({ id: 2, responsable: 'equipo' }),
    bloqueo({ id: 3, responsable: 'cliente' }),
    bloqueo({ id: 4, responsable: 'equipo' })
  ])

  assert.deepEqual(lectura.filas.map((fila) => fila.id), [1, 3, 2, 4])
  assert.equal(lectura.deTuLado, 2)
})

test('leer los bloqueos no toca el arreglo de la respuesta', () => {
  const filas = [bloqueo({ id: 1, responsable: 'equipo' }), bloqueo({ id: 2, responsable: 'cliente' })]

  leerBloqueos(filas)

  assert.deepEqual(filas.map((fila) => fila.id), [1, 2])
  assert.equal(Object.hasOwn(filas[0], 'deTuLado'), false)
})

test('sin la migracion 0699 la fila sale igual, y ninguna depende del cliente', () => {
  // `accion_necesaria` y `responsable` pueden faltar: una base atrasada pierde el dato nuevo, no la
  // fila. El motivo y la antiguedad llegan igual.
  const lectura = leerBloqueos([{
    id: 1,
    name: 'Migración del catálogo',
    project: { id: 7, name: 'Sitio corporativo' },
    motivo: 'El proveedor todavía no habilitó el acceso.',
    bloqueado_en: '2026-09-01T12:00:00Z',
    dias_bloqueada: 13
  }])

  assert.equal(lectura.clase, 'trabados')
  assert.equal(lectura.deTuLado, 0)
  assert.equal(lectura.filas[0].deTuLado, false)
  assert.equal(lectura.filas[0].motivo, 'El proveedor todavía no habilitó el acceso.')
})

test('una fecha ilegible no se pinta como "hace 0 dias"', () => {
  // `dias_bloqueada` en `null` es "no se pudo leer la fecha". "Se trabo hoy" es una afirmacion, y una
  // fila sin fecha no la sostiene: la pantalla omite la frase en vez de inventar un dia.
  assert.equal(textoDeAntiguedad(null), null)
  assert.equal(textoDeAntiguedad(undefined), null)
  assert.equal(textoDeAntiguedad(Number.NaN), null)
})

test('un cero legitimo si tiene texto, y no es el mismo que el null', () => {
  assert.equal(textoDeAntiguedad(0), 'Se trabó hoy')
  assert.notEqual(textoDeAntiguedad(0), textoDeAntiguedad(null))
})

test('la antiguedad concuerda en singular y en plural', () => {
  assert.equal(textoDeAntiguedad(1), 'Hace 1 día')
  assert.equal(textoDeAntiguedad(21), 'Hace 21 días')
})

test('el responsable que no vino no se inventa', () => {
  // Sin saber de quien depende, la pantalla no pone la insignia en vez de poner una equivocada.
  assert.equal(etiquetaDeResponsable(null), null)
  assert.equal(etiquetaDeResponsable(undefined), null)
  assert.equal(etiquetaDeResponsable('otro'), null)
})

test('los tres valores del enum tienen su propia etiqueta', () => {
  const etiquetas = ['cliente', 'equipo', 'tercero'].map(etiquetaDeResponsable)

  assert.equal(etiquetas.every((texto) => typeof texto === 'string' && texto.length > 0), true)
  assert.equal(new Set(etiquetas).size, 3)
})

test('sin ningun hito comprometido, la lista se calla: el contador ya lo dijo', () => {
  // La lista COMPLEMENTA al contador, no lo duplica. Con cero hitos, la tarjeta de arriba ya dice
  // "todavia no hay ninguno comprometido" y repetirlo abajo es ruido.
  assert.deepEqual(
    leerProximosHitos([], { total: 0, overdue: 0 }),
    { clase: 'nada_comprometido' }
  )
})

test('con hitos contados y la lista vacia, la noticia es otra', () => {
  // Hay hitos, pero ninguno con fecha pendiente por delante. Es una noticia propia y hay que
  // escribirla: sin ella, el cliente ve un contador en 4 y ninguna fila, sin explicacion.
  assert.deepEqual(
    leerProximosHitos([], { total: 4, overdue: 0 }),
    { clase: 'sin_fecha_proxima' }
  )
})

test('una lista que no viniera se lee como la vacia, porque el contador ya conto', () => {
  assert.deepEqual(
    leerProximosHitos(undefined, { total: 4, overdue: 1 }),
    { clase: 'sin_fecha_proxima' }
  )
})

test('los hitos vencidos se cuentan aparte y conservan el orden del servidor', () => {
  // El servidor los manda por fecha ascendente, asi que los vencidos salen primero. Reordenar un
  // recorte de seis filas mentiria sobre lo que quedo afuera.
  const filas = [
    { id: 1, name: 'Entrega inicial', due_date: '2026-08-30', project: { id: 7, name: 'Sitio' }, vencido: true },
    { id: 2, name: 'Cierre', due_date: '2026-10-30', project: { id: 7, name: 'Sitio' }, vencido: false }
  ]

  const lectura = leerProximosHitos(filas, { total: 2, overdue: 1 })

  assert.equal(lectura.clase, 'proximos')
  assert.equal(lectura.vencidos, 1)
  assert.deepEqual(lectura.filas.map((hito) => hito.id), [1, 2])
})

test('leer los proximos hitos no toca el arreglo de la respuesta', () => {
  const filas = [
    { id: 1, name: 'Entrega inicial', due_date: '2026-08-30', project: { id: 7, name: 'Sitio' }, vencido: true }
  ]

  assert.notEqual(leerProximosHitos(filas, { total: 1, overdue: 1 }).filas, filas)
})

test('los dos motivos nuevos explican la ausencia y no la disfrazan de cero', () => {
  for (const motivo of [MOTIVO_SIN_BLOQUEOS, MOTIVO_SIN_FECHA_PROXIMA]) {
    assert.equal(typeof motivo, 'string')
    assert.equal(motivo.trim().length > 0, true)
    assert.equal(motivo.includes('0'), false)
  }
})

/**
 * Una fila de «Próximos días», con lo minimo para reconocerla en las aserciones.
 *
 * @param campos lo que la prueba quiere fijar; el resto sale del molde
 * @returns la fila lista para meter en un tramo
 */
function fila (campos) {
  return {
    id: 1,
    name: 'Revisar guion',
    due_date: '2026-09-24',
    status: { id: 4, name: 'En progreso', color: '#3b82f6' },
    project: { id: 88, name: 'Campaña primavera' },
    espera_tu_respuesta: false,
    en_progreso: false,
    ...campos
  }
}

test('la clave de proximos dias que no vino no es "no tenes nada por vencer"', () => {
  // Es la misma puerta que `procesos`: sin ningun Proyecto que comparta su lista de Tareas no hay
  // de donde sacar vencimientos, y afirmar que no hay ninguno seria tranquilizar sobre lo que
  // nadie miro.
  assert.deepEqual(leerProximosDias(undefined), { clase: 'no_se_sabe' })
  assert.deepEqual(leerProximosDias(null), { clase: 'no_se_sabe' })
})

test('con la clave presente y los tres tramos vacios, la afirmacion si es legitima', () => {
  const lectura = leerProximosDias({ vencido: [], hoy: [], proximo: [], total: 0 })

  assert.deepEqual(lectura, { clase: 'sin_vencimientos', restantes: 0 })
})

test('sin vencimientos cercanos, lo que queda abierto se cuenta igual', () => {
  const lectura = leerProximosDias({ vencido: [], hoy: [], proximo: [], total: 7 })

  assert.deepEqual(lectura, { clase: 'sin_vencimientos', restantes: 7 })
})

test('los tramos salen en orden de urgencia y sin los vacios', () => {
  const lectura = leerProximosDias({
    vencido: [fila({ id: 1 })],
    hoy: [],
    proximo: [fila({ id: 2 }), fila({ id: 3 })],
    total: 3
  })

  assert.equal(lectura.clase, 'tramos')
  assert.deepEqual(lectura.grupos.map((grupo) => grupo.tramo), ['vencido', 'proximo'])
  assert.deepEqual(lectura.grupos.map((grupo) => grupo.etiqueta), ['Vencidas', 'Próximos días'])
})

test('lo que el servidor no listo se anuncia con su numero', () => {
  // El servidor recorta cada tramo y ademas hay trabajo que vence mas alla de los siete dias. Sin
  // este numero, un cliente con cuarenta Tareas abiertas veria tres y creeria que son todas.
  const lectura = leerProximosDias({
    vencido: [fila({ id: 1 })],
    hoy: [fila({ id: 2 })],
    proximo: [fila({ id: 3 })],
    total: 40
  })

  assert.equal(lectura.restantes, 37)
})

test('un total ilegible no dibuja un "y NaN mas"', () => {
  const lectura = leerProximosDias({ vencido: [fila({ id: 1 })], hoy: [], proximo: [], total: null })

  assert.equal(lectura.restantes, 0)
})

test('un total menor que lo listado no da un numero negativo', () => {
  const lectura = leerProximosDias({
    vencido: [fila({ id: 1 }), fila({ id: 2 })],
    hoy: [],
    proximo: [],
    total: 1
  })

  assert.equal(lectura.restantes, 0)
})

test('el orden dentro del tramo es el del servidor y no se toca', () => {
  // El servidor pone primero lo que espera al cliente, despues lo que el equipo mueve, y recien
  // ahi por fecha. Reordenar aca un recorte del servidor mentiria sobre lo que quedo afuera.
  const filas = [
    fila({ id: 9, espera_tu_respuesta: true, due_date: '2026-09-30' }),
    fila({ id: 8, en_progreso: true, due_date: '2026-09-25' }),
    fila({ id: 7, due_date: '2026-09-22' })
  ]

  const lectura = leerProximosDias({ vencido: [], hoy: [], proximo: filas, total: 3 })

  assert.deepEqual(lectura.grupos[0].filas.map((f) => f.id), [9, 8, 7])
  assert.notEqual(lectura.grupos[0].filas, filas)
})

test('un tramo que no es lista se lee como tramo vacio y no rompe la pantalla', () => {
  const lectura = leerProximosDias({ vencido: null, hoy: [fila({ id: 1 })], proximo: undefined, total: 1 })

  assert.equal(lectura.clase, 'tramos')
  assert.deepEqual(lectura.grupos.map((grupo) => grupo.tramo), ['hoy'])
})

test('el motivo de los proximos dias explica la ausencia y no la disfraza de cero', () => {
  assert.equal(typeof MOTIVO_SIN_PROXIMOS_DIAS, 'string')
  assert.equal(MOTIVO_SIN_PROXIMOS_DIAS.trim().length > 0, true)
  assert.equal(MOTIVO_SIN_PROXIMOS_DIAS.includes('0'), false)
})

/**
 * Un ticket del resumen, con lo minimo para reconocerlo.
 *
 * @param campos lo que la prueba quiere fijar
 * @returns el ticket listo para meter en `ultimos`
 */
function ticket (campos) {
  return {
    id: 41,
    subject: 'No puedo descargar el informe',
    status: { id: 1, name: 'Abierto', color: '#0284c7' },
    last_reply: '2026-09-20 14:02:00',
    project: { id: 88, name: 'Campaña primavera' },
    ...campos
  }
}

test('sin la seccion de soporte no se dibuja nada, ni siquiera el hueco', () => {
  // Es la excepcion a la regla del hueco: un "no podemos decirte cuantos tickets tenes" sobre una
  // seccion que el contacto no ve en el menu es ruido, no informacion.
  assert.deepEqual(leerTickets(undefined), { clase: 'sin_seccion' })
  assert.deepEqual(leerTickets(null), { clase: 'sin_seccion' })
})

test('con soporte habilitado y sin tickets, tampoco hay bloque', () => {
  const lectura = leerTickets({ abiertos: 0, esperando_tu_respuesta: 0, ultimos: [] })

  assert.deepEqual(lectura, { clase: 'sin_tickets' })
})

test('los tickets llegan con los dos contadores que la pantalla acentua', () => {
  const lectura = leerTickets({
    abiertos: 3,
    esperando_tu_respuesta: 1,
    ultimos: [ticket({ id: 41 }), ticket({ id: 42 })]
  })

  assert.equal(lectura.clase, 'tickets')
  assert.equal(lectura.abiertos, 3)
  assert.equal(lectura.esperando, 1)
  assert.deepEqual(lectura.filas.map((t) => t.id), [41, 42])
})

test('leer los tickets no toca el arreglo de la respuesta', () => {
  const ultimos = [ticket({})]

  assert.notEqual(leerTickets({ abiertos: 1, esperando_tu_respuesta: 0, ultimos }).filas, ultimos)
})

test('un contador de tickets ilegible cae en cero y no en NaN', () => {
  // Aca el 0 SI es aceptable, al reves que en `leerEspera`: las filas ya estan en pantalla y el
  // contador solo las acompaña, asi que degradarlo esconde un acento, no un hecho.
  const lectura = leerTickets({ abiertos: null, esperando_tu_respuesta: -4, ultimos: [ticket({})] })

  assert.equal(lectura.abiertos, 0)
  assert.equal(lectura.esperando, 0)
})
