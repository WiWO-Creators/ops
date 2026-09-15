import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INDICADORES,
  filasDelTablero,
  formatearDelta,
  formatearValor,
  tonoDeDelta
} from '../src/dominio/indicadores.ts'

/** Una foto con todos los contadores en el mismo valor, para variar solo lo que cada caso prueba. */
function foto (fecha, valores = {}) {
  return {
    fecha,
    espacios: 0,
    procesos: 0,
    abiertos: 0,
    vencidos: 0,
    por_vencer: 0,
    criticos: 0,
    en_riesgo: 0,
    incumplidos: 0,
    estancados: 0,
    aprobacion_pendiente: 0,
    calidad_promedio: null,
    calidad_tareas: 0,
    ...valores
  }
}

test('bajar es mejorar solo donde menos es mejor', () => {
  // Menos vencidos es una buena noticia; menos proyectos no dice nada por sí solo.
  assert.equal(tonoDeDelta(-99, 'menos_es_mejor'), 'mejora')
  assert.equal(tonoDeDelta(4, 'menos_es_mejor'), 'retroceso')
  assert.equal(tonoDeDelta(-2, 'mas_es_mejor'), 'retroceso')
  assert.equal(tonoDeDelta(2.1, 'mas_es_mejor'), 'mejora')
  assert.equal(tonoDeDelta(-50, 'neutro'), 'igual', 'lo neutro nunca se pinta como noticia')
})

test('quedarse igual no es mejorar, y sin dato no hay noticia', () => {
  assert.equal(tonoDeDelta(0, 'menos_es_mejor'), 'igual')
  assert.equal(tonoDeDelta(0, 'mas_es_mejor'), 'igual')
  assert.equal(tonoDeDelta(null, 'mas_es_mejor'), 'igual', 'sin promedio no hay nada que decir')
})

test('la diferencia se escribe con signo, y cero se escribe distinto de un total', () => {
  assert.equal(formatearDelta(4), '+4')
  assert.equal(formatearDelta(-99), '−99')
  assert.equal(formatearDelta(0), '=', 'un 0 se confundiría con un total en cero')
  assert.equal(formatearDelta(null), '—')
  assert.equal(formatearDelta(2.1, true), '+2,1', 'el promedio lleva un decimal, con coma')
  assert.equal(formatearDelta(-2.1, true), '−2,1')
})

test('el promedio ausente se escribe con raya y no con cero', () => {
  // Un cero se leería como "todas las tareas están pésimamente planteadas"; lo que pasa es que ese
  // día no había ninguna evaluada.
  assert.equal(formatearValor(null, true), '—')
  assert.equal(formatearValor(0, true), '0,0')
  assert.equal(formatearValor(1288), '1.288')
})

test('el tablero arma una fila por indicador, en orden de lectura', () => {
  const comparacion = {
    base: foto('2026-09-11', { vencidos: 434, incumplidos: 1464, calidad_promedio: 48, calidad_tareas: 876 }),
    corte: foto('2026-09-15', { vencidos: 335, incumplidos: 1288, calidad_promedio: 50.1, calidad_tareas: 876 }),
    // El delta va completo y a mano: es corte menos base, y escribirlo entero deja a la vista que
    // los indicadores que no se movieron valen cero y no `undefined`.
    delta: {
      espacios: 0,
      procesos: 0,
      abiertos: 0,
      vencidos: -99,
      por_vencer: 0,
      criticos: 0,
      en_riesgo: 0,
      incumplidos: -176,
      estancados: 0,
      aprobacion_pendiente: 0,
      calidad_promedio: 2.1
    },
    fechas: ['2026-09-15', '2026-09-11']
  }

  const filas = filasDelTablero(comparacion)

  assert.equal(filas.length, INDICADORES.length)
  assert.equal(filas[0].clave, 'incumplidos', 'lo que más duele va primero')

  const vencidos = filas.find((fila) => fila.clave === 'vencidos')
  assert.equal(vencidos.base, '434')
  assert.equal(vencidos.corte, '335')
  assert.equal(vencidos.delta, '−99')
  assert.equal(vencidos.tono, 'mejora')

  const calidad = filas.find((fila) => fila.clave === 'calidad_promedio')
  assert.equal(calidad.corte, '50,1', 'el promedio lleva su decimal')
  assert.equal(calidad.tono, 'mejora', 'subir la nota es mejorar')

  const espacios = filas.find((fila) => fila.clave === 'espacios')
  assert.equal(espacios.tono, 'igual', 'el contexto no se pinta como noticia')
})

test('una comparación sin promedio en una de las dos fotos no inventa una mejora', () => {
  const comparacion = {
    base: foto('2026-01-01'),
    corte: foto('2026-09-15', { calidad_promedio: 50.1, calidad_tareas: 876 }),
    delta: {
      espacios: 0,
      procesos: 0,
      abiertos: 0,
      vencidos: 0,
      por_vencer: 0,
      criticos: 0,
      en_riesgo: 0,
      incumplidos: 0,
      estancados: 0,
      aprobacion_pendiente: 0,
      calidad_promedio: null
    },
    fechas: ['2026-09-15', '2026-01-01']
  }

  const calidad = filasDelTablero(comparacion).find((fila) => fila.clave === 'calidad_promedio')

  assert.equal(calidad.base, '—')
  assert.equal(calidad.delta, '—', 'restarle a un número la ausencia de otro daría el número entero')
  assert.equal(calidad.tono, 'igual')
})
