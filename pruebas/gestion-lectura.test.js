/**
 * Pruebas de la lectura de los tres bloques nuevos del tablero de gestion.
 *
 * Lo que se prueba no es maquetado: es la diferencia entre "cero" y "no se sabe", que en esta
 * pantalla vale plata. La serie de seis meses llega con nulos donde no hubo denominador, el mes en
 * curso llega cortado en AHORA, y los cambios de compromiso y el desglose de retrabajo pueden
 * llegar enteros en `null` porque la instalacion no tiene la migracion. Si alguna de esas tres
 * cosas se dibujara como un 0, el informe mensual diria que el equipo no cumplio nada, que el mes
 * se desplomo, o que nadie movio una sola fecha.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_SIN_HISTORIA,
  MOTIVO_SIN_AUDITORIA,
  MOTIVO_SIN_MOTIVOS,
  MOTIVO_SIN_SERIE,
  avisoDeMesParcial,
  leerCambiosDeCompromiso,
  leerMotivosDeRetrabajo,
  leerTendencia,
  marcasDeIndicador,
  rotularMesCorto,
  serieDeIndicador,
  tramosDeIndicador
} from '../src/componentes/gestion/lectura.ts'

/** Un punto de la serie con lo que cada caso quiera variar. */
function punto (mes, valores = {}) {
  return {
    mes,
    recibidas: 10,
    cerradas: 8,
    porcentaje_en_plazo: 70,
    rondas_promedio: 2,
    deuda_dias: 5,
    parcial: false,
    ...valores
  }
}

/** La serie leida, o el fallo de la prueba si la lectura dijo que no habia. */
function serieDe (puntos) {
  const lectura = leerTendencia(puntos)

  assert.equal(lectura.clase, 'serie')

  return lectura
}

test('sin serie no se dibujan seis meses en cero', () => {
  // Medio año en cero se leeria como medio año sin trabajo. La pantalla dice que no hay serie.
  for (const vacio of [null, undefined, []]) {
    assert.deepEqual(leerTendencia(vacio), { clase: 'sin_serie' })
  }
})

test('un mes con forma invalida se descarta en vez de dibujarse en cualquier lado', () => {
  assert.deepEqual(leerTendencia([punto('2026-13'), punto('ayer')]), { clase: 'sin_serie' })
})

test('la serie sale del mes mas viejo al mas nuevo aunque llegue al reves', () => {
  // El eje del grafico ES el orden: una serie invertida no se ve rota, se ve como una tendencia al
  // reves, que es peor.
  const { meses } = serieDe([punto('2026-09'), punto('2026-04'), punto('2026-07')])

  assert.deepEqual(meses.map((mes) => mes.mes), ['2026-04', '2026-07', '2026-09'])
})

test('un null de la serie llega como null y nunca como cero', () => {
  const { meses } = serieDe([
    punto('2026-08', { porcentaje_en_plazo: null, rondas_promedio: null, deuda_dias: null })
  ])

  assert.equal(meses[0].porcentaje_en_plazo, null)
  assert.equal(meses[0].rondas_promedio, null)
  assert.equal(meses[0].deuda_dias, null)
})

test('un cero medido sigue siendo un cero', () => {
  // La regla es "null no es 0", no "no hay ceros": un mes medido con 0% en plazo se dibuja.
  const { meses } = serieDe([punto('2026-08', { porcentaje_en_plazo: 0 })])

  assert.equal(meses[0].porcentaje_en_plazo, 0)
})

test('el tope del volumen nunca es cero, asi el alto de la barra no es NaN', () => {
  const { maximoVolumen } = serieDe([punto('2026-08', { recibidas: 0, cerradas: 0 })])

  assert.equal(maximoVolumen, 1)
})

test('el mes en curso viaja marcado y con su advertencia escrita', () => {
  const lectura = serieDe([punto('2026-08'), punto('2026-09', { parcial: true })])

  assert.deepEqual(lectura.parciales, [rotularMesCorto('2026-09')])

  const aviso = avisoDeMesParcial(lectura.parciales)

  assert.equal(typeof aviso, 'string')
  assert.equal(aviso.includes(rotularMesCorto('2026-09')), true)
})

test('seis meses cerrados no llevan advertencia de mes parcial', () => {
  assert.equal(avisoDeMesParcial([]), null)
})

test('un indicador con techo no se escala contra su propio maximo', () => {
  // Sin techo, un mes de 12% llenaria la caja y el grafico diria "excelente" con el peor numero
  // del semestre.
  const { meses } = serieDe([punto('2026-08', { porcentaje_en_plazo: 12 })])
  const serie = serieDeIndicador(meses, 'porcentaje_en_plazo', 100)

  assert.equal(serie.maximo, 100)
})

test('un indicador sin techo escala contra su maximo, y nunca contra cero', () => {
  const { meses } = serieDe([punto('2026-08', { deuda_dias: 0 })])

  assert.equal(serieDeIndicador(meses, 'deuda_dias').maximo, 1)
})

test('el mes sin dato queda nombrado, no dibujado en cero', () => {
  const { meses } = serieDe([
    punto('2026-07', { rondas_promedio: 1.5 }),
    punto('2026-08', { rondas_promedio: null })
  ])
  const serie = serieDeIndicador(meses, 'rondas_promedio')

  assert.equal(serie.conDato, 1)
  assert.deepEqual(serie.sinDato, [rotularMesCorto('2026-08')])
  assert.equal(serie.puntos[1].valor, null)
})

test('la linea no atraviesa un mes sin dato', () => {
  // Unir julio con septiembre por encima de agosto afirma un valor intermedio que nadie calculo.
  const { meses } = serieDe([
    punto('2026-07', { deuda_dias: 10 }),
    punto('2026-08', { deuda_dias: null }),
    punto('2026-09', { deuda_dias: 20 })
  ])

  assert.deepEqual(tramosDeIndicador(serieDeIndicador(meses, 'deuda_dias')), [])
})

test('dos meses medidos y adyacentes si se unen', () => {
  const { meses } = serieDe([
    punto('2026-08', { deuda_dias: 10 }),
    punto('2026-09', { deuda_dias: 20, parcial: true })
  ])
  const tramos = tramosDeIndicador(serieDeIndicador(meses, 'deuda_dias'))

  assert.equal(tramos.length, 1)
  assert.deepEqual(
    { x1: tramos[0].x1, x2: tramos[0].x2, y1: tramos[0].y1, y2: tramos[0].y2 },
    { x1: 0, x2: 100, y1: 50, y2: 100 }
  )
  // El tramo que toca el mes cortado se dibuja punteado.
  assert.equal(tramos[0].parcial, true)
})

test('el mes sin dato no tiene marca: ese es el hueco', () => {
  const { meses } = serieDe([
    punto('2026-07', { deuda_dias: 10 }),
    punto('2026-08', { deuda_dias: null }),
    punto('2026-09', { deuda_dias: 20 })
  ])
  const marcas = marcasDeIndicador(serieDeIndicador(meses, 'deuda_dias'))

  assert.deepEqual(marcas.map((marca) => marca.mes), ['2026-07', '2026-09'])
  assert.deepEqual(marcas.map((marca) => marca.x), [0, 100])
})

test('un indicador sin ningun mes medido no tiene ultimo valor que rotular', () => {
  const { meses } = serieDe([punto('2026-08', { rondas_promedio: null })])
  const serie = serieDeIndicador(meses, 'rondas_promedio')

  assert.equal(serie.conDato, 0)
  assert.equal(serie.ultimo, null)
  assert.deepEqual(tramosDeIndicador(serie), [])
  assert.deepEqual(marcasDeIndicador(serie), [])
})

test('el ultimo valor rotulado es el ultimo mes CON dato, no el ultimo mes', () => {
  const { meses } = serieDe([
    punto('2026-08', { deuda_dias: 7 }),
    punto('2026-09', { deuda_dias: null, parcial: true })
  ])

  assert.deepEqual(
    serieDeIndicador(meses, 'deuda_dias').ultimo,
    { rotulo: rotularMesCorto('2026-08'), valor: 7, parcial: false }
  )
})

test('el rotulo corto del mes se arma en UTC y no corre de mes', () => {
  assert.equal(rotularMesCorto('2026-01'), 'ene 26')
  assert.equal(rotularMesCorto('2026-12'), 'dic 26')
  assert.equal(rotularMesCorto('cualquier cosa'), 'cualquier cosa')
})

test('sin la tabla de auditoria no hay ceros: no hay dato', () => {
  // Una instalacion sin la 0770 no es una instalacion donde nadie movio una fecha.
  const sinTabla = {
    entradas_no_planificadas: 5,
    estimado: true,
    reprogramaciones: null,
    cambios_de_prioridad: null,
    cambios_de_hito: null
  }

  assert.deepEqual(leerCambiosDeCompromiso(sinTabla), { clase: 'sin_registro' })
  assert.deepEqual(leerCambiosDeCompromiso(null), { clase: 'sin_registro' })
  assert.deepEqual(leerCambiosDeCompromiso(undefined), { clase: 'sin_registro' })
})

test('con la tabla presente y sin filas si hay ceros, y son ceros medidos', () => {
  const lectura = leerCambiosDeCompromiso({
    entradas_no_planificadas: 0,
    estimado: true,
    reprogramaciones: { cambios: 0, procesos: 0 },
    cambios_de_prioridad: { cambios: 0, procesos: 0 },
    cambios_de_hito: { cambios: 0, procesos: 0 }
  })

  assert.equal(lectura.clase, 'medido')
  assert.equal(lectura.filas.length, 3)
  assert.equal(lectura.totalCambios, 0)
})

test('los movimientos y los procesos que se movieron son dos numeros distintos', () => {
  // Treinta reprogramaciones sobre treinta procesos y treinta sobre dos son problemas opuestos.
  const lectura = leerCambiosDeCompromiso({
    entradas_no_planificadas: 5,
    estimado: true,
    reprogramaciones: { cambios: 17, procesos: 9 },
    cambios_de_prioridad: { cambios: 4, procesos: 4 },
    cambios_de_hito: { cambios: 0, procesos: 0 }
  })

  assert.equal(lectura.clase, 'medido')
  assert.deepEqual(
    lectura.filas.map((fila) => [fila.clave, fila.cambios, fila.procesos]),
    [['reprogramaciones', 17, 9], ['cambios_de_prioridad', 4, 4], ['cambios_de_hito', 0, 0]]
  )
  assert.equal(lectura.totalCambios, 21)
})

test('un backend que emita dos de tres campos no deja la pantalla vacia', () => {
  const lectura = leerCambiosDeCompromiso({
    entradas_no_planificadas: 1,
    estimado: true,
    reprogramaciones: { cambios: 3, procesos: 2 },
    cambios_de_prioridad: null,
    cambios_de_hito: { cambios: 1, procesos: 1 }
  })

  assert.equal(lectura.clase, 'medido')
  assert.deepEqual(lectura.filas.map((fila) => fila.clave), ['reprogramaciones', 'cambios_de_hito'])
})

test('sin catalogo de motivos no se publican cuatro ceros', () => {
  assert.deepEqual(leerMotivosDeRetrabajo(null), { clase: 'sin_registro' })
  assert.deepEqual(leerMotivosDeRetrabajo(undefined), { clase: 'sin_registro' })
})

test('un mes medido sin retrabajo se distingue de un mes sin registrar', () => {
  const lectura = leerMotivosDeRetrabajo({
    error_evitable: 0,
    ajuste_de_contenido: 0,
    cambio_de_alcance: 0,
    sin_motivo: 0,
    total: 0
  })

  assert.deepEqual(lectura, { clase: 'sin_retrabajo' })
})

test('el porcentaje del desglose se calcula sobre el total, no sobre lo clasificado', () => {
  // Con 12 sin clasificar de 40, repartir el 100% entre las tres categorias haria que 4 de 40
  // apareciera como el 40% del retrabajo del mes.
  const lectura = leerMotivosDeRetrabajo({
    error_evitable: 9,
    ajuste_de_contenido: 14,
    cambio_de_alcance: 5,
    sin_motivo: 12,
    total: 40
  })

  assert.equal(lectura.clase, 'desglose')
  assert.deepEqual(
    lectura.filas.map((fila) => [fila.clave, fila.total, fila.porcentaje]),
    [['error_evitable', 9, 23], ['ajuste_de_contenido', 14, 35], ['cambio_de_alcance', 5, 13]]
  )
  assert.equal(lectura.sinMotivo, 12)
  assert.equal(lectura.total, 40)
  assert.equal(lectura.cuadra, true)
})

test('un desglose que no suma el total se declara en vez de disimularse', () => {
  const lectura = leerMotivosDeRetrabajo({
    error_evitable: 1,
    ajuste_de_contenido: 1,
    cambio_de_alcance: 1,
    sin_motivo: 0,
    total: 10
  })

  assert.equal(lectura.clase, 'desglose')
  assert.equal(lectura.cuadra, false)
  assert.equal(lectura.total, 10)
})

test('las frases que explican una ausencia no contienen un cero', () => {
  // Un "0" dentro de la explicacion es exactamente lo que estas frases existen para no decir.
  for (const motivo of [MOTIVO_SIN_SERIE, MOTIVO_SIN_AUDITORIA, MOTIVO_SIN_MOTIVOS]) {
    assert.equal(typeof motivo, 'string')
    assert.equal(motivo.trim().length > 0, true)
    assert.equal(motivo.includes('0'), false)
  }
})

test('la advertencia del backfill dice que lo anterior no se puede recuperar', () => {
  assert.equal(AVISO_SIN_HISTORIA.includes('no se puede recuperar'), true)
})
