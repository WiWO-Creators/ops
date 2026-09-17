import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MESES_ATRAS,
  N_MINIMO_MEDIANA,
  SIN_DATO,
  advertenciaDeUnidades,
  desplazarMes,
  distribucionDeAntiguedad,
  esMesDeGestion,
  formatearDias,
  formatearPorcentaje,
  leerCubos,
  leerMediana,
  mesEnCurso,
  mesesOfrecidos,
  motivoSinEtapas,
  motivoSinMediana,
  resolverMesPedido,
  rotularMes,
  rotularResponsable,
  rotularTramo,
  separarTrabas,
  tonoDePorcentaje
} from '../src/dominio/gestion.ts'

/** Un bloque `{ n, mediana, p90 }` con lo que cada caso quiere variar. */
function resumen (valores = {}) {
  return { n: 0, mediana: null, p90: null, ...valores }
}

/** Una traba con lo mínimo para ordenarla y agruparla. */
function traba (id, responsable, diasBloqueada) {
  return {
    id,
    patente: null,
    name: `Traba ${id}`,
    status: 1,
    project: { id: 1, name: 'Proyecto' },
    date_added: null,
    due_date: null,
    date_finished: null,
    motivo: 'Motivo',
    accion_necesaria: null,
    responsable,
    bloqueado_en: null,
    dias_bloqueada: diasBloqueada
  }
}

// --- `null` no es 0 --------------------------------------------------------------------------

test('un porcentaje ausente sale como guion, jamás como cero', () => {
  // Es la regla más cara del tablero: "0% en plazo" acusa de un mes entero de incumplimiento, y lo
  // que pasó es que no había nada comprometido.
  assert.equal(formatearPorcentaje(null), SIN_DATO)
  assert.equal(formatearPorcentaje(undefined), SIN_DATO)
  assert.equal(formatearPorcentaje(0), '0%', 'un cero real sí es un cero')
  assert.equal(formatearPorcentaje(87), '87%')
})

test('unos días ausentes salen como guion, no como "0 días"', () => {
  assert.equal(formatearDias(null), SIN_DATO)
  assert.equal(formatearDias(undefined), SIN_DATO)
  assert.equal(formatearDias(Number.NaN), SIN_DATO)
  assert.equal(formatearDias(0), '0 días', 'cero días medidos es un dato')
  assert.equal(formatearDias(1), '1 día')
  assert.equal(formatearDias(3.45), '3,5 días')
})

test('no saber nunca se pinta de rojo', () => {
  // Un null en neutro y no en peligro: no hay mala noticia que anunciar sobre un mes sin denominador.
  assert.equal(tonoDePorcentaje(null), 'neutro')
  assert.equal(tonoDePorcentaje(undefined), 'neutro')
  assert.equal(tonoDePorcentaje(0), 'peligro', 'un cero real sí es una mala noticia')
  assert.equal(tonoDePorcentaje(92), 'exito')
  assert.equal(tonoDePorcentaje(70), 'aviso')
  assert.equal(tonoDePorcentaje(12, 'menos_es_mejor'), 'exito')
  assert.equal(tonoDePorcentaje(95, 'menos_es_mejor'), 'peligro')
})

// --- La mediana con `n` chico --------------------------------------------------------------------

test('con menos de tres casos no hay mediana, hay conteo', () => {
  assert.equal(N_MINIMO_MEDIANA, 3)

  assert.deepEqual(leerMediana(resumen({ n: 1, mediana: 4, p90: 4 })), { clase: 'muestraChica', n: 1 })
  assert.deepEqual(leerMediana(resumen({ n: 2, mediana: 9, p90: 12 })), { clase: 'muestraChica', n: 2 })

  assert.deepEqual(
    leerMediana(resumen({ n: 3, mediana: 9, p90: 12 })),
    { clase: 'mediana', n: 3, mediana: 9, p90: 12 },
    'tres es el piso, y en el piso ya se dibuja'
  )
})

test('un mes sin ningún caso no es un mes de cero días', () => {
  assert.deepEqual(leerMediana(resumen({ n: 0 })), { clase: 'sinDatos' })
  assert.deepEqual(leerMediana(null), { clase: 'sinDatos' })
  assert.deepEqual(leerMediana(undefined), { clase: 'sinDatos' })

  // `n` suficiente pero mediana ausente: manda el null, no se inventa el número.
  assert.deepEqual(leerMediana(resumen({ n: 8, mediana: null })), { clase: 'sinDatos' })
})

test('cada caso sin mediana viene con su frase, y la mediana dibujada no', () => {
  assert.equal(
    motivoSinMediana({ clase: 'sinDatos' }, 'aprobaciones resueltas'),
    'Este mes no hubo aprobaciones resueltas: todavía no hay datos.'
  )
  assert.match(motivoSinMediana({ clase: 'muestraChica', n: 1 }, 'x'), /1 sola/)
  assert.match(motivoSinMediana({ clase: 'muestraChica', n: 2 }, 'x'), /Hubo 2/)
  assert.equal(motivoSinMediana({ clase: 'mediana', n: 5, mediana: 2, p90: 4 }, 'x'), null)
})

// --- Los cubos que pueden no sumar ---------------------------------------------------------------

test('con el estado al cierre medido, los cuatro cubos son una partición', () => {
  const lectura = leerCubos(
    {
      produccion: 4,
      revision_interna: 2,
      revision_vp: 1,
      terminado: 0,
      bloqueadas: 3,
      estado_al_cierre: 'medido'
    },
    7
  )

  assert.equal(lectura.estimado, false)
  assert.equal(lectura.suma, 7)
  assert.equal(lectura.cuadra, true)
  assert.equal(lectura.sin_clasificar, 0)
  assert.equal(lectura.bloqueadas, 3, 'bloqueadas es ortogonal: no entra en la suma')
  assert.deepEqual(lectura.cubos.map((c) => c.rotulo), ['Producción', 'Revisión interna', 'Revisión VP', 'Completo'])
})

test('con el estado al cierre estimado, lo que falta se rotula en vez de repartirse', () => {
  // Una tarea que hoy dice Completo pero al cierre seguía abierta no se puede clasificar: se sabe que
  // el cubo es falso, no cuál era el verdadero. Empujarla a producción para cuadrar sería inventar.
  const lectura = leerCubos(
    {
      produccion: 2,
      revision_interna: 1,
      revision_vp: 0,
      terminado: 0,
      bloqueadas: 1,
      estado_al_cierre: 'estimado'
    },
    9
  )

  assert.equal(lectura.estimado, true)
  assert.equal(lectura.suma, 3)
  assert.equal(lectura.total, 9)
  assert.equal(lectura.cuadra, false)
  assert.equal(lectura.sin_clasificar, 6)
})

// --- Las etapas sin histórico ---------------------------------------------------------------------

test('sin histórico el bloque de etapas trae su motivo, no cuatro ceros', () => {
  assert.equal(motivoSinEtapas('medida'), null)

  const motivo = motivoSinEtapas('sin_datos')
  assert.notEqual(motivo, null)
  assert.match(motivo, /historial de cambios de estado/)
  assert.match(motivo, /no son cero: todavía no los medimos/)
})

test('el tiempo acordado y los cubos no están en la misma unidad, y se avisa', () => {
  const aviso = advertenciaDeUnidades(true)
  assert.notEqual(aviso, null)
  assert.match(aviso, /días hábiles/)
  assert.match(aviso, /ciclo completo/)
  assert.equal(advertenciaDeUnidades(false), null)
})

// --- Las trabas ------------------------------------------------------------------------------------

test('las trabas del cliente van aparte y de la más vieja a la más nueva', () => {
  const { del_cliente: delCliente, del_resto: delResto } = separarTrabas([
    traba(1, 'equipo', 30),
    traba(2, 'cliente', 4),
    traba(3, 'cliente', 12),
    traba(4, null, 2),
    traba(5, 'cliente', null),
    traba(6, 'tercero', 40)
  ])

  assert.deepEqual(delCliente.map((t) => t.id), [3, 2, 5], 'la que no tiene fecha va al final')
  assert.deepEqual(delResto.map((t) => t.id), [6, 1, 4])
})

test('un bloqueo sin responsable declarado se nombra, no se disfraza de nuestro', () => {
  assert.equal(rotularResponsable('cliente'), 'Depende de ustedes')
  assert.equal(rotularResponsable('equipo'), 'Depende de nosotros')
  assert.equal(rotularResponsable('tercero'), 'Depende de un tercero')
  assert.equal(rotularResponsable(null), 'Sin responsable declarado')
})

// --- La antigüedad ----------------------------------------------------------------------------------

test('las barras se miden contra el tramo más poblado, y los cinco tramos siempre están', () => {
  const tramos = [
    { rango: '0-7', desde_dias: 0, hasta_dias: 7, total: 2 },
    { rango: '8-15', desde_dias: 8, hasta_dias: 15, total: 8 },
    { rango: '16-30', desde_dias: 16, hasta_dias: 30, total: 0 },
    { rango: '31-60', desde_dias: 31, hasta_dias: 60, total: 4 },
    { rango: '61+', desde_dias: 61, hasta_dias: null, total: 1 }
  ]

  const { barras, total } = distribucionDeAntiguedad(tramos)

  assert.equal(total, 15)
  assert.equal(barras.length, 5, 'los vacíos también se dibujan: la forma no cambia según el mes')
  assert.deepEqual(barras.map((b) => b.porcentaje), [25, 100, 0, 50, 13])
  assert.equal(barras[4].etiqueta, '61+ días')
  assert.equal(barras[0].etiqueta, '0–7 días')
})

test('sin nada abierto, ninguna barra se estira', () => {
  const { barras, total } = distribucionDeAntiguedad([
    { rango: '0-7', desde_dias: 0, hasta_dias: 7, total: 0 },
    { rango: '61+', desde_dias: 61, hasta_dias: null, total: 0 }
  ])

  assert.equal(total, 0)
  assert.deepEqual(barras.map((b) => b.porcentaje), [0, 0], 'dividir por cero no puede dar NaN en pantalla')
})

test('el tramo abierto de la derecha se rotula distinto', () => {
  assert.equal(rotularTramo({ rango: '8-15', desde_dias: 8, hasta_dias: 15, total: 0 }), '8–15 días')
  assert.equal(rotularTramo({ rango: '61+', desde_dias: 61, hasta_dias: null, total: 0 }), '61+ días')
})

// --- El mes -------------------------------------------------------------------------------------------

test('sólo `YYYY-MM` con un mes real entra', () => {
  assert.equal(esMesDeGestion('2026-09'), true)
  assert.equal(esMesDeGestion('2026-13'), false)
  assert.equal(esMesDeGestion('2026-00'), false)
  assert.equal(esMesDeGestion('2026-9'), false)
  assert.equal(esMesDeGestion('septiembre'), false)
  assert.equal(esMesDeGestion(null), false)
  assert.equal(esMesDeGestion(undefined), false)
})

test('correr meses cruza el año sin pasar por Date', () => {
  assert.equal(desplazarMes('2026-01', -1), '2025-12')
  assert.equal(desplazarMes('2026-12', 1), '2027-01')
  assert.equal(desplazarMes('2026-03', -14), '2025-01')
  assert.equal(desplazarMes('2026-09', 0), '2026-09')
})

test('el selector ofrece el mes en curso y 24 hacia atrás, y nada del futuro', () => {
  const meses = mesesOfrecidos('2026-09')

  assert.equal(meses.length, MESES_ATRAS + 1)
  assert.equal(meses[0], '2026-09', 'el más nuevo primero')
  assert.equal(meses.at(-1), '2024-09', 'el tope de la API, ni uno más')
  assert.equal(meses.includes('2026-10'), false, 'un mes que no pasó no es "todavía no hay datos"')
  assert.deepEqual(mesesOfrecidos('no es un mes'), [])
})

test('un `?mes=` fuera de rango se deja pasar tal cual para que la API conteste su 422', () => {
  // Corregirlo en silencio mostraría un mes distinto del que dice la barra de direcciones, y ese
  // enlace se comparte.
  assert.deepEqual(resolverMesPedido(null, '2026-09'), { mes: '2026-09', aceptable: true })
  assert.deepEqual(resolverMesPedido('', '2026-09'), { mes: '2026-09', aceptable: true })
  assert.deepEqual(resolverMesPedido('2026-07', '2026-09'), { mes: '2026-07', aceptable: true })
  assert.deepEqual(resolverMesPedido('2026-11', '2026-09'), { mes: '2026-11', aceptable: false })
  assert.deepEqual(resolverMesPedido('1999-01', '2026-09'), { mes: '1999-01', aceptable: false })
  assert.deepEqual(resolverMesPedido('marzo', '2026-09'), { mes: 'marzo', aceptable: false })
})

test('el mes en curso se lee en la zona del negocio, no en la del servidor', () => {
  // El 30 de septiembre a las 23:30 en Santiago (UTC-3) son las 02:30 del 1 de octubre en UTC. Leer
  // el mes en UTC haría que el tablero saltara de mes tres horas antes de tiempo: no corre un día,
  // corre el mes entero.
  assert.equal(mesEnCurso(new Date('2026-10-01T02:30:00Z')), '2026-09')
  assert.equal(mesEnCurso(new Date('2026-10-01T04:30:00Z')), '2026-10')
})

test('el mes se rotula con su nombre y en mayúscula inicial', () => {
  assert.equal(rotularMes('2026-09'), 'Septiembre 2026')
  assert.equal(rotularMes('2026-01'), 'Enero 2026')
  assert.equal(rotularMes('no es un mes'), 'no es un mes')
})
