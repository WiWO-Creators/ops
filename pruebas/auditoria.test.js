import test from 'node:test'
import assert from 'node:assert/strict'

import { agruparSesiones, haceCuanto } from '../src/componentes/auditoria/presentacion.ts'
import { intervaloDeLatido, TIPOS_AUDITORIA } from '../src/datos/auditoria.ts'
import { AUDITORIA } from '../src/definiciones/auditoria.ts'

/**
 * Lo que se prueba aca es lo que se rompe callado.
 *
 * El agrupado de sesiones es lo unico del centro de auditoria que puede MENTIR sin fallar: si junta
 * mal, la pantalla dice que dos personas son una, o que una sesion empezo cuando no empezo. El resto
 * de la pantalla o pinta o no pinta.
 */

/** Una fila de `GET /sessions`, con lo minimo que mira el agrupado. */
function sesion (id, staffId, desde, ultima, extra = {}) {
  return {
    id,
    staff: staffId === null ? null : { id: staffId, full_name: `Persona ${staffId}`, profile_image_url: null },
    started_at: desde,
    last_used_at: ultima,
    expires_at: null,
    revoked_at: null,
    active: true,
    ip: '10.0.0.1',
    user_agent: 'node',
    impersonated_by: null,
    ...extra
  }
}

test('los tokens rotados de una persona son UNA sesion, no tres', () => {
  const filas = agruparSesiones([
    sesion(3, 183, '2026-09-07T12:00:00Z', '2026-09-07T12:30:00Z'),
    sesion(2, 183, '2026-09-07T11:00:00Z', '2026-09-07T11:59:00Z'),
    sesion(1, 183, '2026-09-07T10:00:00Z', '2026-09-07T10:59:00Z')
  ])

  assert.equal(filas.length, 1)
  assert.equal(filas[0].tokens, 3)
  // Desde el primero que abrio, no desde el ultimo que roto: si no, una jornada de tres horas
  // aparece como recien empezada cada hora.
  assert.equal(filas[0].desde, '2026-09-07T10:00:00Z')
  assert.equal(filas[0].ultima, '2026-09-07T12:30:00Z')
})

test('dos personas no se funden aunque compartan origen', () => {
  const filas = agruparSesiones([
    sesion(1, 183, '2026-09-07T10:00:00Z', '2026-09-07T10:10:00Z'),
    sesion(2, 182, '2026-09-07T10:00:00Z', '2026-09-07T10:20:00Z')
  ])

  assert.equal(filas.length, 2)
  // Ordenadas por ultima señal, la mas reciente primero.
  assert.equal(filas[0].persona.id, 182)
})

test('dos cuentas eliminadas siguen siendo dos sesiones', () => {
  // Agrupar por `staff` daria una sola fila con `null` de clave, que es exactamente la mentira que
  // la clave por id de token evita.
  const filas = agruparSesiones([
    sesion(7, null, '2026-09-07T10:00:00Z', '2026-09-07T10:10:00Z'),
    sesion(8, null, '2026-09-07T10:00:00Z', '2026-09-07T10:20:00Z')
  ])

  assert.equal(filas.length, 2)
  assert.notEqual(filas[0].clave, filas[1].clave)
})

test('los origenes distintos se juntan sin repetirse', () => {
  const filas = agruparSesiones([
    sesion(1, 183, '2026-09-07T10:00:00Z', '2026-09-07T10:10:00Z'),
    sesion(2, 183, '2026-09-07T11:00:00Z', '2026-09-07T11:10:00Z'),
    sesion(3, 183, '2026-09-07T12:00:00Z', '2026-09-07T12:10:00Z', { ip: '10.0.0.9' })
  ])

  assert.deepEqual(filas[0].origenes, ['10.0.0.1 · node', '10.0.0.9 · node'])
})

test('una sesion sin fechas no rompe el agrupado ni el orden', () => {
  const filas = agruparSesiones([
    sesion(1, 183, null, null),
    sesion(2, 183, '2026-09-07T10:00:00Z', '2026-09-07T10:05:00Z')
  ])

  assert.equal(filas.length, 1)
  assert.equal(filas[0].desde, '2026-09-07T10:00:00Z')
  assert.equal(filas[0].ultima, '2026-09-07T10:05:00Z')
})

test('la marca de suplantacion sobrevive al agrupado', () => {
  const quien = { id: 183, full_name: 'Dev Prueba', profile_image_url: null }
  const filas = agruparSesiones([
    sesion(1, 182, '2026-09-07T10:00:00Z', '2026-09-07T10:05:00Z'),
    sesion(2, 182, '2026-09-07T11:00:00Z', '2026-09-07T11:05:00Z', { impersonated_by: quien })
  ])

  // El aviso no puede perderse porque el token que lo lleva no sea el primero de la lista.
  assert.deepEqual(filas[0].suplantada, quien)
})

test('agrupar una lista vacia devuelve una lista vacia', () => {
  assert.deepEqual(agruparSesiones([]), [])
})

test('haceCuanto no adelanta a la persona que acaba de latir', () => {
  assert.equal(haceCuanto(0), 'ahora')
  assert.equal(haceCuanto(44), 'ahora')
  assert.equal(haceCuanto(60), 'hace 1 minuto')
  assert.equal(haceCuanto(300), 'hace 5 minutos')
  assert.equal(haceCuanto(null), 'hace un rato')
})

test('el intervalo del latido se acota en vez de fallar', () => {
  const previo = process.env.PRESENCIA_INTERVALO_SEGUNDOS

  try {
    delete process.env.PRESENCIA_INTERVALO_SEGUNDOS
    assert.equal(intervaloDeLatido(), 45)

    process.env.PRESENCIA_INTERVALO_SEGUNDOS = 'cada rato'
    assert.equal(intervaloDeLatido(), 45, 'un valor sin sentido no puede dejar el panel sin latir')

    process.env.PRESENCIA_INTERVALO_SEGUNDOS = '1'
    assert.equal(intervaloDeLatido(), 15, 'ni convertirlo en un martillo contra la API')

    process.env.PRESENCIA_INTERVALO_SEGUNDOS = '99999'
    assert.equal(intervaloDeLatido(), 600)

    process.env.PRESENCIA_INTERVALO_SEGUNDOS = '30'
    assert.equal(intervaloDeLatido(), 30)
  } finally {
    if (previo === undefined) delete process.env.PRESENCIA_INTERVALO_SEGUNDOS
    else process.env.PRESENCIA_INTERVALO_SEGUNDOS = previo
  }
})

test('todo tipo que la definicion pinta tiene etiqueta y tono', () => {
  // La columna y el filtro leen el mismo mapa: un tipo nuevo en el backend sin entrada aca se
  // pintaria con su nombre interno ("login_fallido") en medio de la tabla.
  for (const clave of Object.keys(TIPOS_AUDITORIA)) {
    assert.equal(typeof TIPOS_AUDITORIA[clave].etiqueta, 'string')
    assert.notEqual(TIPOS_AUDITORIA[clave].etiqueta, '')
    assert.ok(TIPOS_AUDITORIA[clave].tono)
  }
})

test('la definicion del historial no pide un orden que la API no acepta', () => {
  // `GET /audit` solo ordena por `date` e `id`: cualquier otro `sort` es 422, no se ignora.
  const permitidos = ['date', 'id']

  for (const campo of AUDITORIA.ordenables) assert.ok(permitidos.includes(campo), campo)

  for (const columna of AUDITORIA.columnas) {
    if (columna.ordenPor !== undefined) assert.ok(AUDITORIA.ordenables.includes(columna.ordenPor), columna.clave)
  }

  const porDefecto = String(AUDITORIA.ordenPorDefecto).replace('-', '')
  assert.ok(AUDITORIA.ordenables.includes(porDefecto))
})
