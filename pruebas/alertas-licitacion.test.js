/**
 * Pruebas de la banda de alertas de Licitaciones.
 *
 * Lo que importa no es que arme una lista, sino que no alerte de lo que no toca: una Licitación
 * cerrada no tiene plazo que perder, una Tarea de un Espacio normal no es asunto de esta pantalla, y
 * un vencimiento lejano en la banda es ruido que entrena a no mirarla.
 *
 * El día de referencia se inyecta: una prueba de plazos atada al reloj falla sola mañana.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alertasDeLicitaciones,
  clavesDeAvisosDeLicitacion,
  contarAlertas,
  DIAS_DE_AVISO_DE_VENCIMIENTO,
  etiquetaDeMotivo,
  textoDeAlerta
} from '../src/dominio/alertas-licitacion.ts'
import { GLOSARIO } from '../src/dominio/glosario.ts'

/** Mediodía local del 11/09/2026: se construye con partes locales, como hace `diasHasta`. */
const HOY = new Date(2026, 8, 11, 12, 0, 0)

/** Una fila de `GET /licitaciones` con lo mínimo que la banda mira. */
function licitacion ({ id, estado = 'abierta', company = 'Constructora X', deadline = null }) {
  return { id, estado, company, espacio: { name: `Propuesta ${id}`, deadline } }
}

/** Una fila de `GET /me/vencimientos` con lo mínimo que la banda mira. */
function vencimiento ({ id, proyecto, hito = null, estado = 'temprano', dias = 2, due = '2026-09-13' }) {
  return {
    id,
    name: `Tarea ${id}`,
    due_date: due,
    project: proyecto === null ? null : { id: proyecto, name: `Propuesta ${proyecto}` },
    milestone: hito === null ? null : { id: 7, name: hito },
    aviso: { estado, dias_restantes: dias }
  }
}

test('sin licitaciones ni vencimientos no hay ninguna alerta', () => {
  assert.deepEqual(alertasDeLicitaciones([], [], HOY), [])
})

test('el vencimiento de una licitación abierta entra cuando cae dentro de la ventana', () => {
  const dentro = alertasDeLicitaciones([licitacion({ id: 1, deadline: '2026-09-16' })], [], HOY)

  assert.equal(dentro.length, 1)
  assert.equal(dentro[0].motivo, 'vencimiento')
  assert.equal(dentro[0].tramo, 'proximo')
  assert.equal(dentro[0].dias, 5)
  assert.equal(dentro[0].licitacionId, 1)
})

test('un vencimiento más lejano que el umbral no entra', () => {
  const lejos = new Date(HOY)
  lejos.setDate(lejos.getDate() + DIAS_DE_AVISO_DE_VENCIMIENTO + 1)
  const fecha = `${lejos.getFullYear()}-${String(lejos.getMonth() + 1).padStart(2, '0')}-${String(lejos.getDate()).padStart(2, '0')}`

  assert.deepEqual(alertasDeLicitaciones([licitacion({ id: 1, deadline: fecha })], [], HOY), [])
})

test('un vencimiento ya pasado sigue alertando, y en rojo', () => {
  const alertas = alertasDeLicitaciones([licitacion({ id: 1, deadline: '2026-09-08' })], [], HOY)

  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].tramo, 'vencido')
  assert.equal(alertas[0].dias, -3)
})

test('sin fecha de vencimiento no se inventa una alerta', () => {
  assert.deepEqual(alertasDeLicitaciones([licitacion({ id: 1, deadline: null })], [], HOY), [])
})

test('una licitación ganada o perdida no alerta, ni ella ni sus tareas', () => {
  for (const estado of ['ganada', 'perdida']) {
    const alertas = alertasDeLicitaciones(
      [licitacion({ id: 1, estado, deadline: '2026-09-12' })],
      [vencimiento({ id: 50, proyecto: 1, hito: 'SEMANA 2' })],
      HOY
    )

    assert.deepEqual(alertas, [], estado)
  }
})

test('una tarea con hito se lee como Fecha Clave y una sin hito como Tarea', () => {
  const alertas = alertasDeLicitaciones(
    [licitacion({ id: 1 })],
    [
      vencimiento({ id: 50, proyecto: 1, hito: 'SEMANA 2' }),
      vencimiento({ id: 51, proyecto: 1, hito: null })
    ],
    HOY
  )

  assert.deepEqual(alertas.map((alerta) => alerta.motivo), ['fecha_clave', 'tarea'])
  assert.equal(alertas[0].detalle, 'SEMANA 2')
  assert.equal(alertas[1].detalle, 'Tarea 51')
})

test('una tarea de un espacio que no es licitación abierta queda fuera', () => {
  const alertas = alertasDeLicitaciones(
    [licitacion({ id: 1 })],
    [vencimiento({ id: 50, proyecto: 99 }), vencimiento({ id: 51, proyecto: null })],
    HOY
  )

  assert.deepEqual(alertas, [])
})

test('lo vencido llega con días negativos aunque el cron los mande en positivo', () => {
  const alertas = alertasDeLicitaciones(
    [licitacion({ id: 1 })],
    [vencimiento({ id: 50, proyecto: 1, estado: 'vencido', dias: 4 })],
    HOY
  )

  assert.equal(alertas[0].tramo, 'vencido')
  assert.equal(alertas[0].dias, -4)
})

test('ordena de lo más urgente a lo menos', () => {
  const alertas = alertasDeLicitaciones(
    [
      licitacion({ id: 1, company: 'Zeta', deadline: '2026-09-20' }),
      licitacion({ id: 2, company: 'Alfa', deadline: '2026-09-11' })
    ],
    [vencimiento({ id: 50, proyecto: 1, estado: 'vencido', dias: 1 })],
    HOY
  )

  assert.deepEqual(alertas.map((alerta) => alerta.dias), [-1, 0, 9])
})

test('cuenta las alertas por gravedad', () => {
  const alertas = alertasDeLicitaciones(
    [
      licitacion({ id: 1, deadline: '2026-09-08' }),
      licitacion({ id: 2, deadline: '2026-09-11' }),
      licitacion({ id: 3, deadline: '2026-09-14' })
    ],
    [],
    HOY
  )

  assert.deepEqual(contarAlertas(alertas), { vencidas: 1, hoy: 1, proximas: 1 })
  assert.deepEqual(contarAlertas([]), { vencidas: 0, hoy: 0, proximas: 0 })
})

test('el texto dice los días que faltan, en singular cuando corresponde', () => {
  const texto = (dias, tramo) => textoDeAlerta({ dias, tramo })

  assert.equal(texto(-1, 'vencido'), 'Venció ayer')
  assert.equal(texto(-5, 'vencido'), 'Venció hace 5 días')
  assert.equal(texto(0, 'hoy'), 'Vence hoy')
  assert.equal(texto(1, 'proximo'), 'Vence mañana')
  assert.equal(texto(9, 'proximo'), 'En 9 días')
})

// Se compara contra el glosario y no contra el texto: el renombre de «Hito» a «Fecha Clave» viaja
// en otra rama, y una prueba que fije el literal convierte ese renombre en un fallo ajeno.
test('los motivos se nombran con el glosario, no con literales', () => {
  assert.equal(etiquetaDeMotivo('vencimiento'), GLOSARIO.licitacion.singular)
  assert.equal(etiquetaDeMotivo('fecha_clave'), GLOSARIO.hito.singular)
  assert.equal(etiquetaDeMotivo('tarea'), GLOSARIO.proceso.singular)
})

test('el interruptor de correo no se dibuja mientras la API no publique su clave', () => {
  assert.deepEqual(clavesDeAvisosDeLicitacion({ editable: {}, readonly: {} }), [])
  assert.deepEqual(
    clavesDeAvisosDeLicitacion({
      editable: { wiwo_avisos_licitaciones: { group: 'correo', type: 'bool', value: false } },
      readonly: {}
    }),
    ['wiwo_avisos_licitaciones']
  )
})
