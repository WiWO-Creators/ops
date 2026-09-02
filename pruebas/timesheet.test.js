/**
 * Registro de horas: parseo de la duracion y conteo en vivo.
 *
 * Son las dos unicas cuentas que hace el frontend. Todo lo demas —`duration_hm`, `duration_decimal`
 * y los permisos por fila— lo decide el backend y aca solo se muestra. Si estas dos se rompen, se
 * rompen en silencio: la primera manda al servidor una duracion que no es la que se escribio, y la
 * segunda deja un cronometro congelado que parece detenido.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MINUTOS_MAXIMOS,
  PASO_MINUTOS,
  ajustarMinutos,
  duracionDesdeMinutos,
  duracionMostrada,
  formatearDecimal,
  formatearHm,
  parsearDuracion,
  segundosEnVivo,
  validarTimesheet
} from '../src/componentes/proyecto/timesheet.ts'

test('parsearDuracion entiende las tres formas del panel', () => {
  assert.equal(parsearDuracion('2:30'), 2 * 3600 + 30 * 60)
  assert.equal(parsearDuracion('2'), 2 * 3600, '«2» a secas son dos horas enteras')
  assert.equal(parsearDuracion(':15'), 15 * 60, '«:15» son quince minutos')
  assert.equal(parsearDuracion('5:5'), 5 * 3600 + 5 * 60, 'los minutos no exigen dos digitos')
  assert.equal(parsearDuracion(' 1:05 '), 3900, 'los espacios de los costados no cuentan')
})

test('parsearDuracion no admite minutos mayores a 59, porque el panel tampoco los acota', () => {
  assert.equal(parsearDuracion('0:90'), 90 * 60)
})

test('parsearDuracion rechaza lo que no es una duracion', () => {
  for (const texto of ['', '   ', ':', 'dos horas', '1:2:3', '-1', '2.5', '0', '0:0', 'a:b']) {
    assert.equal(parsearDuracion(texto), null, `deberia rechazar ${JSON.stringify(texto)}`)
  }
})

const CORRIENDO = {
  id: 1,
  staff: { id: 12, full_name: 'Daniela Borquez', profile_image_url: null, sigue_asignado: true },
  task: { id: 655, name: 'NES | Voces Feb', status: 4, billable: true, billed: false },
  tags: [],
  start_time: '2026-02-25T12:00:00Z',
  end_time: null,
  note: null,
  duration_seconds: 60,
  duration_hm: '00:01',
  duration_decimal: 0.02,
  corriendo: true,
  puede_editar: false,
  puede_borrar: true,
  puede_detener: true
}

const CERRADO = {
  ...CORRIENDO,
  id: 2,
  end_time: '2026-02-26T18:05:30Z',
  duration_seconds: 108330,
  duration_hm: '30:05',
  duration_decimal: 30.09,
  corriendo: false,
  puede_editar: true,
  puede_detener: false
}

test('el conteo en vivo cuenta contra ahora, no contra lo que dijo el backend', () => {
  const ahora = new Date('2026-02-25T14:30:20Z')

  assert.equal(segundosEnVivo(CORRIENDO, ahora), 2 * 3600 + 30 * 60 + 20)
  assert.deepEqual(duracionMostrada(CORRIENDO, ahora), { hm: '02:30', decimal: 2.51 })
})

test('un reloj atrasado no produce una duracion negativa', () => {
  assert.equal(segundosEnVivo(CORRIENDO, new Date('2026-02-25T11:00:00Z')), 0)
})

test('un registro cerrado muestra tal cual lo que calculo el backend', () => {
  // 30:05 y 30.09 es el registro real de Daniela Borquez en el proyecto 93. El frontend no lo
  // recalcula: dos maneras de calcular lo mismo terminan discrepando en el ultimo minuto.
  assert.deepEqual(duracionMostrada(CERRADO, new Date('2030-01-01T00:00:00Z')), {
    hm: '30:05',
    decimal: 30.09
  })
})

test('formatearHm no convierte las horas en dias', () => {
  assert.equal(formatearHm(30 * 3600), '30:00')
  assert.equal(formatearHm(0), '00:00')
  assert.equal(formatearHm(-5), '00:00')
  assert.equal(formatearDecimal(108330), 30.09)
})

test('validarTimesheet nunca manda duracion y fechas juntas', () => {
  const base = {
    taskId: '655',
    staffId: '12',
    inicio: '2026-02-25T12:00',
    fin: '2026-02-25T14:00',
    duracion: '2:30',
    nota: '',
    etiquetas: 'urgente, revision'
  }

  const porDuracion = validarTimesheet({ ...base, modo: 'duracion' })
  assert.equal(porDuracion.ok, true)
  assert.equal(porDuracion.cuerpo.duration, '2:30')
  assert.equal(porDuracion.cuerpo.start_time, undefined)
  assert.deepEqual(porDuracion.cuerpo.tags, ['urgente', 'revision'])

  const porFechas = validarTimesheet({ ...base, modo: 'fechas' })
  assert.equal(porFechas.ok, true)
  assert.equal(porFechas.cuerpo.duration, undefined)
  assert.ok(porFechas.cuerpo.start_time)
})

test('validarTimesheet rechaza un fin anterior al inicio antes de molestar al servidor', () => {
  const resultado = validarTimesheet({
    modo: 'fechas',
    taskId: '655',
    staffId: '',
    inicio: '2026-02-25T14:00',
    fin: '2026-02-25T12:00',
    duracion: '',
    nota: '',
    etiquetas: ''
  })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.campo, 'fin')
})

test('validarTimesheet exige la tarea', () => {
  const resultado = validarTimesheet({
    modo: 'duracion', taskId: '', staffId: '', inicio: '', fin: '', duracion: '1:00', nota: '', etiquetas: ''
  })

  assert.equal(resultado.ok, false)
  assert.equal(resultado.campo, 'taskId')
})

test('ajustarMinutos no baja de cero ni pasa del tope', () => {
  assert.equal(ajustarMinutos(0, -PASO_MINUTOS), 0, 'restar en cero deja cero, no negativo')
  assert.equal(ajustarMinutos(30, PASO_MINUTOS), 45)
  assert.equal(ajustarMinutos(45, -PASO_MINUTOS), 30)
  assert.equal(ajustarMinutos(MINUTOS_MAXIMOS, PASO_MINUTOS), MINUTOS_MAXIMOS, 'doce horas es el tope')
  assert.equal(ajustarMinutos(Number.NaN, PASO_MINUTOS), 0, 'un valor roto vuelve a cero')
})

test('duracionDesdeMinutos arma la duracion que el contrato acepta', () => {
  assert.equal(duracionDesdeMinutos(30), '0:30')
  assert.equal(duracionDesdeMinutos(60), '1:00')
  assert.equal(duracionDesdeMinutos(120), '2:00')
  assert.equal(duracionDesdeMinutos(105), '1:45')
  assert.equal(duracionDesdeMinutos(MINUTOS_MAXIMOS), '12:00')
})

test('duracionDesdeMinutos trata lo invalido como cero', () => {
  for (const valor of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(duracionDesdeMinutos(valor), '0:00', `deberia dar cero con ${String(valor)}`)
  }
})

test('lo que arma el registro rapido lo vuelve a leer el parseo del formulario', () => {
  for (const minutos of [15, 30, 60, 120, 345, MINUTOS_MAXIMOS]) {
    assert.equal(
      parsearDuracion(duracionDesdeMinutos(minutos)),
      minutos * 60,
      `ida y vuelta rota en ${minutos} minutos`
    )
  }
})
