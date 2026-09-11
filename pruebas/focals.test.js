/**
 * Pruebas de la pantalla de Focals.
 *
 * Lo que se verifica es lo que el servidor NO garantiza y la pantalla tiene que resolver sola: unir
 * dos listados que llegan por separado, ordenar los Proyectos de una cuenta, y traducir los tres
 * códigos con los que WiBot dice "esto no está roto".
 *
 * La fórmula del semáforo no se prueba acá: vive entera en el backend (`Salud\Formula`) y repetirla
 * en el front daría dos verdades sobre el mismo puntaje. Lo que sí se prueba es que los `sin_datos`
 * no se traten como el peor caso, que es el error que un indicador de salud no puede darse.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  agruparPorCliente,
  contarPorTramo,
  mensajeDeFalloDeEstado,
  nombreDe,
  ordenarPorSemaforo,
  rutaDeEstado
} from '../src/datos/focals.ts'
import { GLOSARIO, nombrar } from '../src/dominio/glosario.ts'

/** Un score de cliente con lo mínimo que la pantalla toca. */
function cliente (id, score, semaforo) {
  return {
    client_id: id,
    cliente: `Cliente ${id}`,
    fecha: '2026-09-11',
    score,
    semaforo,
    variacion: null,
    espacios: 0,
    procesos: 0,
    senales: senales()
  }
}

/** Un score de Proyecto con lo mínimo que la pantalla toca. */
function espacio (id, clientId, score, semaforo, nombre = `Proyecto ${id}`) {
  return {
    project_id: id,
    espacio: nombre,
    client_id: clientId,
    cliente: `Cliente ${clientId}`,
    fecha: '2026-09-11',
    score,
    semaforo,
    variacion: null,
    procesos: 0,
    senales: senales(),
    estado: null
  }
}

function senales () {
  return {
    plazos: { peso: 45, score: null, medibles: 0, incumplidos: 0, en_riesgo: 0, atraso_promedio: null },
    carga: { peso: 30, score: null, abiertos: 0, con_movimiento: 0, estancados: 0, dias_ventana: 14 },
    vencimientos: { peso: 25, score: null, por_vencer: 0, criticos: 0, vencidos: 0 }
  }
}

test('el glosario nombra a esta gente "Focals", y de ahí sale la interfaz', () => {
  assert.equal(GLOSARIO.focal.plural, 'Focals')
  assert.equal(GLOSARIO.focal.singular, 'Focal')
  assert.equal(nombrar('focal', 2), 'Focals')
  assert.equal(nombrar('focal', 1), 'Focal')
})

test('agrupar respeta el orden de clientes que trae el servidor', () => {
  const clientes = [cliente(7, 12, 'rojo'), cliente(3, 80, 'verde')]
  const espacios = [espacio(1, 3, 80, 'verde'), espacio(2, 7, 12, 'rojo')]

  const cuentas = agruparPorCliente(clientes, espacios)

  assert.deepEqual(cuentas.map((c) => c.cliente.client_id), [7, 3])
  assert.deepEqual(cuentas[0].espacios.map((e) => e.project_id), [2])
  assert.deepEqual(cuentas[1].espacios.map((e) => e.project_id), [1])
})

test('un cliente sin Proyectos queda con la lista vacía, no se pierde de la pantalla', () => {
  const cuentas = agruparPorCliente([cliente(5, null, 'sin_datos')], [])

  assert.equal(cuentas.length, 1)
  assert.deepEqual(cuentas[0].espacios, [])
})

test('un Proyecto de un cliente que no está en la lista se descarta', () => {
  // Las dos llamadas vieron carteras distintas. Mejor un Proyecto de menos que media pantalla con
  // una tarjeta sin cliente.
  const cuentas = agruparPorCliente([cliente(1, 40, 'rojo')], [espacio(9, 99, 40, 'rojo')])

  assert.deepEqual(cuentas[0].espacios, [])
})

test('un Proyecto sin cliente no rompe el agrupado', () => {
  const huerfano = { ...espacio(9, 1, 40, 'rojo'), client_id: null }

  const cuentas = agruparPorCliente([cliente(1, 40, 'rojo')], [huerfano])

  assert.deepEqual(cuentas[0].espacios, [])
})

test('los Proyectos van del peor al mejor, y "sin datos" al final', () => {
  const ordenados = ordenarPorSemaforo([
    espacio(1, 1, null, 'sin_datos'),
    espacio(2, 1, 90, 'verde'),
    espacio(3, 1, 4, 'rojo')
  ])

  assert.deepEqual(ordenados.map((e) => e.project_id), [3, 2, 1])
})

test('a igual puntaje manda el nombre, y el arreglo de entrada no se toca', () => {
  const entrada = [espacio(1, 1, 10, 'rojo', 'Zeta'), espacio(2, 1, 10, 'rojo', 'Alfa')]

  const ordenados = ordenarPorSemaforo(entrada)

  assert.deepEqual(ordenados.map((e) => e.espacio), ['Alfa', 'Zeta'])
  assert.deepEqual(entrada.map((e) => e.espacio), ['Zeta', 'Alfa'])
})

test('el recuento por tramo declara los cuatro tramos, también los que dan cero', () => {
  const cuenta = contarPorTramo([
    espacio(1, 1, 4, 'rojo'),
    espacio(2, 1, 4, 'rojo'),
    espacio(3, 1, null, 'sin_datos')
  ])

  assert.deepEqual(cuenta, { verde: 0, amarillo: 0, rojo: 2, sin_datos: 1 })
})

test('un Proyecto sin nombre se muestra por su id, nunca en blanco', () => {
  assert.equal(nombreDe({ ...espacio(42, 1, 4, 'rojo'), espacio: null }), '#42')
  assert.equal(nombreDe(espacio(42, 1, 4, 'rojo', 'Rediseño')), 'Rediseño')
})

test('la ruta del estado escapa el id', () => {
  assert.equal(rutaDeEstado(12), 'ia/proyectos/12/estado')
})

test('404 es WiBot apagado y 409 es que todavía no corrió el cálculo', () => {
  // Los dos son estados normales del sistema, y la diferencia importa: en uno no hay nada que hacer
  // y en el otro basta con esperar al cálculo del día.
  const apagado = mensajeDeFalloDeEstado(404, 'Recurso desconocido: "ia".')
  const sinFoto = mensajeDeFalloDeEstado(409, 'Todavía no hay semáforo de hoy para este Espacio.')

  assert.match(apagado, /apagado/)
  assert.notEqual(apagado, sinFoto)
  assert.match(sinFoto, /una vez al día/)
  assert.match(mensajeDeFalloDeEstado(429, 'x'), /cuota/)
})

test('lo que no está previsto se cuenta con las palabras del servidor', () => {
  assert.equal(mensajeDeFalloDeEstado(500, 'Se cayó todo'), 'Se cayó todo')
})

test('ninguno de los tres mensajes previstos sugiere que el semáforo se rompió', () => {
  // El párrafo es lo único que falta cuando WiBot no contesta: el puntaje se sigue viendo. Si el
  // mensaje dijera "no se pudo cargar el semáforo", mandaría a alguien a revisar un cálculo sano.
  for (const codigo of [404, 409, 429]) {
    assert.doesNotMatch(mensajeDeFalloDeEstado(codigo, 'x'), /no se pudo cargar el sem/i)
  }
})
