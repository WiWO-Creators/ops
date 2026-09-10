/**
 * Pruebas del catálogo de ajustes de la instalación.
 *
 * Lo que se protege acá no es la traducción de un texto sino dos cosas que rompen la pantalla en
 * silencio: que una opción nueva del backend siga apareciendo aunque nadie la haya traducido —si se
 * escondiera, un ajuste quedaría invisible sin que nadie se entere— y que los dominios que son ids
 * de `/lookups` se resuelvan a nombres, porque sin eso el formulario ofrece elegir entre «1» y «3».
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clavesDelGrupo, dominiosDeAjustes, etiquetaDeAjuste, grupoDeAjustes, motivoDeIa } from '../src/dominio/ajustes.ts'

/** Un cuerpo de `GET /settings` con lo mínimo para probar el agrupado. */
const AJUSTES = {
  editable: {
    tasks_kanban_limit: { group: 'procesos', type: 'entero', value: 50, min: 5, max: 200 },
    default_task_priority: { group: 'procesos', type: 'enum', value: '2', options: ['1', '2'] },
    ia_habilitada: { group: 'ia', type: 'bool', value: false },
    ia_tope_tokens: { group: 'ia', type: 'entero', value: null, min: 200, max: 4000 },
    opcion_del_futuro: { group: 'grupo_del_futuro', type: 'bool', value: true }
  },
  readonly: { dateformat: 'd/m/Y' }
}

const LOOKUPS = {
  task_statuses: [{ id: 1, name: 'Sin empezar' }],
  task_priorities: [{ id: 1, name: 'Baja' }, { id: 2, name: 'Media' }],
  roles: [{ id: 7, name: 'Empleado' }]
}

test('agrupa por el `group` que publica la API y conserva su orden', () => {
  assert.deepEqual(clavesDelGrupo(AJUSTES, 'procesos'), ['tasks_kanban_limit', 'default_task_priority'])
  assert.deepEqual(clavesDelGrupo(AJUSTES, 'ia'), ['ia_habilitada', 'ia_tope_tokens'])
})

test('un grupo que la instalación no publica sale vacío, no undefined', () => {
  assert.deepEqual(clavesDelGrupo(AJUSTES, 'correo'), [])
})

test('una clave sin traducir se muestra cruda en vez de desaparecer', () => {
  assert.equal(etiquetaDeAjuste('opcion_del_futuro').etiqueta, 'opcion_del_futuro')
  assert.equal(etiquetaDeAjuste('opcion_del_futuro').ayuda, undefined)
  assert.equal(grupoDeAjustes('grupo_del_futuro').titulo, 'grupo_del_futuro')
})

test('el interruptor de la IA está traducido y dice qué apaga', () => {
  const { etiqueta, ayuda } = etiquetaDeAjuste('ia_habilitada')

  assert.equal(etiqueta, 'Funciones con IA')
  assert.match(ayuda, /404/)
})

test('los dominios que son ids de /lookups se resuelven a nombres', () => {
  const dominios = dominiosDeAjustes(LOOKUPS)

  assert.equal(dominios.default_task_priority['2'], 'Media')
  assert.equal(dominios.default_staff_role['7'], 'Empleado')
  // `auto` no sale de `/lookups`: es un valor propio de la whitelist y tiene que sobrevivir a la mezcla.
  assert.equal(dominios.default_task_status.auto, 'Automático')
  assert.equal(dominios.default_task_status['1'], 'Sin empezar')
})

test('el redondeo del cronómetro tiene nombre para cada número', () => {
  const dominios = dominiosDeAjustes(LOOKUPS)

  assert.equal(dominios.round_off_task_timer_option['0'], 'No redondear')
  assert.equal(dominios.round_off_task_timer_option['1'], 'Redondear hacia arriba')
})

/**
 * Lo que separa "apagada" de "nunca se configuró" es un `false` de un `null`, y los dos llegan como
 * "no hay IA". Confundirlos manda a la persona a apagar un interruptor que no está encendido.
 */
test('el motivo de la IA distingue apagada de nunca configurada', () => {
  assert.equal(motivoDeIa(true), 'encendida')
  assert.equal(motivoDeIa(false), 'apagada')
  // `null`: la opción viaja en `/settings` sin fila detrás en `tbloptions`.
  assert.equal(motivoDeIa(null), 'ausente')
  // `undefined`: la opción no viaja en absoluto.
  assert.equal(motivoDeIa(undefined), 'ausente')
})

test('un valor que no es booleano no se cuela como encendida', () => {
  // `GET /settings` presenta los `bool` ya convertidos, pero la cadena "0" es verdadera en
  // JavaScript: si alguna vez llegara sin convertir, tiene que leerse como apagada y no al revés.
  assert.equal(motivoDeIa('0'), 'apagada')
  assert.equal(motivoDeIa('1'), 'apagada')
  assert.equal(motivoDeIa(0), 'apagada')
})
