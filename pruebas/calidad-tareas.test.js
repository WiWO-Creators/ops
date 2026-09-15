import test from 'node:test'
import assert from 'node:assert/strict'

import { construirConsulta, leerConsulta, estadoInicial } from '../src/datos/consulta.ts'
import {
  describirFalta,
  etiquetaDeTramo,
  formatearPromedio,
  motivoDeLaNota,
  notaQuedoVieja,
  sinRevisarTodavia
} from '../src/dominio/calidad-tareas.ts'
import {
  VISTAS_DE_AUDITORIA,
  vistaElegida,
  vistasPermitidas
} from '../src/dominio/vistas-de-auditoria.ts'
import { CALIDAD_TAREAS } from '../src/definiciones/calidad-tareas.ts'

/**
 * Lo que se prueba aca es lo que se rompe callado.
 *
 * Son tres cosas: que la definicion no salga de la whitelist del backend —un filtro de mas es un
 * `422` en la primera carga, o sea una tabla que no abre—, que el reparto de pestañas no le enseñe a
 * nadie una puerta cerrada, y que los tres estados de la nota no se confundan entre si: "sin
 * revisar", "quedo vieja" y "es mala" se arreglan de maneras distintas y la pantalla tiene que
 * decirlas distinto.
 */

/** Una fila del detector, con lo minimo que miran los presentadores. */
function fila (extra = {}) {
  return {
    id: 42,
    name: 'Revisar planos',
    project_id: 7,
    project_name: 'Casa Matriz',
    client_name: 'Acme',
    due_date: '2026-09-30',
    assignees: [{ id: 5, full_name: 'Ana Soto' }],
    nota: 55,
    tramo: 'floja',
    falta: [],
    descripcion: { puntaje: 60, motivo: null, largo: 84, evaluado_en: '2026-09-15T03:00:00Z', vigente: true },
    ...extra
  }
}

/** El bloque `descripcion` de una fila, con lo que cada caso necesita cambiar. */
function descripcion (extra = {}) {
  return { puntaje: 60, motivo: null, largo: 84, evaluado_en: '2026-09-15T03:00:00Z', vigente: true, ...extra }
}

// --- La definicion contra la whitelist del backend -------------------------
//
// Las tres listas estan congeladas en el contrato. Si alguien agrega aca un filtro que el backend no
// declara, la pantalla responde 422 en la primera carga y nadie lo ve hasta abrirla.

test('la definicion declara EXACTAMENTE los filtros del contrato', () => {
  assert.deepEqual(
    CALIDAD_TAREAS.filtros.map((filtro) => filtro.clave).sort(),
    ['assignee', 'falta', 'incoherencia', 'nota', 'project_id', 'tramo', 'vence']
  )

  // `vence` no es un filtro del backend: es UN control que manda los dos extremos del rango.
  const rango = CALIDAD_TAREAS.filtros.find((filtro) => filtro.clave === 'vence')
  assert.deepEqual(rango.clavesRango, ['date_from', 'date_to'])
})

test('la definicion declara EXACTAMENTE los ordenes del contrato, y ninguno mas', () => {
  assert.deepEqual([...CALIDAD_TAREAS.ordenables].sort(), ['due_date', 'id', 'nota'])
  assert.equal(CALIDAD_TAREAS.includes.length, 0)
})

test('el orden por defecto pone las peores primero', () => {
  // Ascendente y sin signo: la nota mas baja arriba. Es lo unico que hace util esta pantalla.
  assert.equal(CALIDAD_TAREAS.ordenPorDefecto, 'nota')
  assert.ok(CALIDAD_TAREAS.ordenables.includes('nota'))
})

test('ninguna columna ordena por un campo que el backend no acepta', () => {
  for (const columna of CALIDAD_TAREAS.columnas) {
    if (columna.ordenPor === undefined) continue

    assert.ok(
      CALIDAD_TAREAS.ordenables.includes(columna.ordenPor),
      `la columna ${columna.clave} ordena por ${columna.ordenPor}, que no esta en ordenables`
    )
  }
})

test('la consulta por defecto es la que el backend acepta, sin nada de mas', () => {
  assert.equal(construirConsulta(estadoInicial(CALIDAD_TAREAS), CALIDAD_TAREAS), 'sort=nota')
})

test('un filtro que el contrato no declara se poda antes de viajar', () => {
  const params = new URLSearchParams('filter[status]=1&filter[tramo]=insuficiente&sort=name')
  const estado = leerConsulta(params, CALIDAD_TAREAS)

  const consulta = construirConsulta(estado, CALIDAD_TAREAS)

  assert.ok(consulta.includes('filter%5Btramo%5D=insuficiente'))
  assert.ok(!consulta.includes('status'))
  // `sort=name` no esta en la whitelist: cae al orden por defecto en vez de provocar un 422.
  assert.ok(consulta.includes('sort=nota'))
})

test('el rango de vencimiento viaja como dos parametros y no como una lista', () => {
  const params = new URLSearchParams('filter[date_from]=2026-09-01&filter[date_to]=2026-09-30')
  const consulta = construirConsulta(leerConsulta(params, CALIDAD_TAREAS), CALIDAD_TAREAS)

  assert.ok(consulta.includes('filter%5Bdate_from%5D=2026-09-01'))
  assert.ok(consulta.includes('filter%5Bdate_to%5D=2026-09-30'))
})

test('"le falta" admite varios valores: el backend los combina con OR', () => {
  const params = new URLSearchParams('filter[falta]=asignado,fecha')
  const consulta = construirConsulta(leerConsulta(params, CALIDAD_TAREAS), CALIDAD_TAREAS)

  assert.ok(consulta.includes('filter%5Bfalta%5D=asignado%2Cfecha'))
})

// --- Los tres estados de la nota -------------------------------------------

test('"sin revisar" no es "quedo vieja": se distinguen por el puntaje', () => {
  // Nunca se puntuo: `vigente` llega en false igual, y eso NO es una nota desactualizada.
  const nueva = descripcion({ puntaje: null, evaluado_en: null, vigente: false })
  assert.equal(sinRevisarTodavia(nueva), true)
  assert.equal(notaQuedoVieja(nueva), false)

  // Se puntuo y despues cambio el texto: ahi si la nota describe algo que ya no existe.
  const desactualizada = descripcion({ puntaje: 30, vigente: false })
  assert.equal(sinRevisarTodavia(desactualizada), false)
  assert.equal(notaQuedoVieja(desactualizada), true)

  const alDia = descripcion()
  assert.equal(sinRevisarTodavia(alDia), false)
  assert.equal(notaQuedoVieja(alDia), false)
})

test('una nota alta sin evaluar sigue siendo "sin revisar"', () => {
  // La API manda `nota` SIEMPRE como entero, aunque la IA no haya mirado: mirar el numero no
  // distingue "es buena" de "no la vio nadie". La señal es `evaluado_en`.
  assert.equal(sinRevisarTodavia(descripcion({ puntaje: null, evaluado_en: null, vigente: true })), true)
})

test('el motivo prefiere lo que escribio la IA', () => {
  const conMotivo = fila({ descripcion: descripcion({ puntaje: 30, motivo: 'No dice cuándo se cierra.' }) })
  assert.equal(motivoDeLaNota(conMotivo), 'No dice cuándo se cierra.')
})

test('sin motivo de la IA, el motivo son los ejes que faltan', () => {
  const sinMotivo = fila({ falta: ['descripcion', 'fecha'], due_date: null })
  assert.equal(motivoDeLaNota(sinMotivo), 'Descripción, Sin fecha')
})

test('sin evaluar, el motivo lo dice con suavidad y no como una falla', () => {
  const pendiente = fila({ descripcion: descripcion({ puntaje: null, evaluado_en: null, vigente: false }) })
  const texto = motivoDeLaNota(pendiente)

  assert.ok(texto.startsWith('Sin revisar aún'))
})

test('una tarea completa y evaluada no arrastra una segunda linea', () => {
  assert.equal(motivoDeLaNota(fila()), null)
})

test('"qué falta" dice que está completa en vez de quedar en blanco', () => {
  // Una celda vacia en una tabla de hallazgos se lee como un dato que no cargo, que es lo contrario.
  assert.equal(describirFalta([]), 'Nada: está completa')
})

test('los ejes que faltan salen en orden de lectura, no en el que llegaron', () => {
  assert.equal(describirFalta(['fecha', 'descripcion']), 'Descripción, Sin fecha')
})

test('cada tramo tiene su palabra: el color nunca va solo', () => {
  assert.equal(etiquetaDeTramo('completa'), 'Completa')
  assert.equal(etiquetaDeTramo('floja'), 'Floja')
  assert.equal(etiquetaDeTramo('insuficiente'), 'Insuficiente')
})

test('el promedio sin nada medido es una raya y nunca un cero', () => {
  // Un cero ahi diria "todas malas" y lo que pasa es que todavia no hay nada evaluado.
  assert.equal(formatearPromedio(null), '—')
  assert.equal(formatearPromedio(58.44), '58,4')
  assert.equal(formatearPromedio(0), '0')
})

// --- El reparto de pestañas ------------------------------------------------

test('Actividad es solo de superadministrador; Calidad tambien es de gerencia', () => {
  assert.deepEqual(vistasPermitidas({ is_superadmin: true, escalon: 'gerencia' }), ['actividad', 'calidad'])
  assert.deepEqual(vistasPermitidas({ is_superadmin: true, escalon: 'staff' }), ['actividad', 'calidad'])
  assert.deepEqual(vistasPermitidas({ is_superadmin: false, escalon: 'gerencia' }), ['calidad'])
})

test('a quien no le corresponde ninguna no se le ofrece ninguna', () => {
  for (const escalon of ['staff', 'lead', 'director']) {
    assert.deepEqual(vistasPermitidas({ is_superadmin: false, escalon }), [])
  }
})

test('sin pestaña en la URL se abre Actividad, y Calidad a quien solo tiene esa', () => {
  assert.equal(vistaElegida(null, ['actividad', 'calidad']), 'actividad')
  assert.equal(vistaElegida(null, ['calidad']), 'calidad')
  assert.equal(vistaElegida(null, []), null)
})

test('una pestaña que no corresponde cae a la primera permitida, no a un error', () => {
  // Una URL compartida por alguien con mas permisos tiene que dar una pantalla util.
  assert.equal(vistaElegida('actividad', ['calidad']), 'calidad')
  assert.equal(vistaElegida('inventada', ['actividad', 'calidad']), 'actividad')
  assert.equal(vistaElegida('calidad', ['actividad', 'calidad']), 'calidad')
})

test('las dos pestañas se llaman como la pantalla dice que se llaman', () => {
  assert.deepEqual(
    VISTAS_DE_AUDITORIA.map((vista) => [vista.clave, vista.etiqueta]),
    [['actividad', 'Actividad'], ['calidad', 'Calidad de tareas']]
  )
})
