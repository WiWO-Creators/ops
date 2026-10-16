/**
 * Pruebas del equipo en vivo (fase 5): lo que las tarjetas dicen de cada persona y lo que dejan fuera.
 *
 * Lo que se rompe en silencio aca es lo que se ve y no lanza: una frase cruda del servidor
 * («en /tareas/12») en una tarjeta, una persona en reunion que se lee como «sin jornada», una hora
 * corrida por el huso, o —lo grave— una sala privada que dice a que Proyecto pertenece. Todo sale
 * de funciones puras, asi que se prueba sin navegador, sin LiveKit y sin API.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  etiquetaDeSala,
  etiquetaDeSituacion,
  fraseDePresencia,
  horaDeInicio,
  repartirTarjetas,
  salasDeRespuesta,
  situacionDePersona
} from '../src/dominio/equipo-en-vivo.ts'
import {
  identidadDe,
  salaParaElEquipo,
  SALA_PRIVADA_PARA_EL_EQUIPO,
  staffDeIdentidad
} from '../src/dominio/teletrabajo.ts'
import { CONFIG_EN_VIVO_APAGADA, configDeEnVivo } from '../src/dominio/en-vivo.ts'

/** Una fila del tablero con lo minimo; cada prueba pisa lo que le importa. */
function fila (id, nombre, resto = {}) {
  return {
    staff: { id, name: nombre, avatar: null, cargo: null, area: null },
    jornada: null,
    medidor: null,
    presencia: null,
    seconds_today: 0,
    ...resto
  }
}

const JORNADA = { id: 1, started_at: '2026-10-15T13:05:00Z', seconds: 3600 }
const MEDIDOR = { id: 2, project: null, task: null, start_time: '2026-10-15T14:00:00Z', seconds: 60 }

test('la ruta se resuelve a una frase humana y no se muestra la frase cruda del servidor', () => {
  assert.equal(
    fraseDePresencia({ route: '/tareas/12', phrase: 'en /tareas/12' }),
    'en la sección «Tareas»'
  )
  assert.equal(fraseDePresencia({ route: '/mis-tareas', phrase: 'en /mis-tareas' }), 'en la sección «Mis tareas»')
  assert.equal(fraseDePresencia({ route: '/live', phrase: null }), 'en la sección «En vivo»')
  // Un Proyecto no dice cual: el que importa es el que se mide, y viene aparte.
  assert.equal(fraseDePresencia({ route: '/proyectos/3', phrase: 'viendo el proyecto DELCO' }), 'en un Proyecto')
  assert.equal(fraseDePresencia({ route: '/espacios/3', phrase: null }), 'en un Proyecto')
  assert.equal(fraseDePresencia({ route: '/proyectos', phrase: null }), 'en la sección «Proyectos»')
})

test('la frase del servidor es solo respaldo, y la cruda nunca llega a pantalla', () => {
  // Ruta que el panel no conoce: se cae a la frase, salvo que sea la cruda.
  assert.equal(fraseDePresencia({ route: '/cosa-rara/1', phrase: 'en /cosa-rara/1' }), null)
  assert.equal(fraseDePresencia({ route: '/cosa-rara/1', phrase: 'entrando al panel' }), 'entrando al panel')
  // Sin ruta (API anterior) la frase decente sirve y la cruda no.
  assert.equal(fraseDePresencia({ phrase: 'en su inicio' }), 'en su inicio')
  assert.equal(fraseDePresencia({ phrase: 'en /tareas/9' }), null)
  assert.equal(fraseDePresencia({ route: null, phrase: '  ' }), null)
  // Una ruta con forma de ataque o con query no se interpreta a medias.
  assert.equal(fraseDePresencia({ route: '/tareas?x=1', phrase: null }), null)
  assert.equal(fraseDePresencia(null), null)
})

test('la sala gana sobre el cronometro y la jornada, y el orden es reunion, midiendo, jornada, nada', () => {
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: JORNADA, medidor: MEDIDOR }), 'general'), 'en_reunion')
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: JORNADA, medidor: MEDIDOR }), null), 'midiendo')
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: JORNADA }), undefined), 'en_jornada')
  assert.equal(situacionDePersona(fila(1, 'A'), undefined), 'sin_jornada')
  // En una sala sin jornada tambien es reunion: es lo que se sabe y no se esconde.
  assert.equal(situacionDePersona(fila(1, 'A'), 'cafe'), 'en_reunion')
  assert.deepEqual(
    ['en_reunion', 'midiendo', 'teletrabajo', 'en_jornada', 'sin_jornada'].map(etiquetaDeSituacion),
    ['En reunión', 'Midiendo', 'Teletrabajo', 'En jornada', 'Sin jornada']
  )
})

test('Teletrabajo es un estado propio: gana a «En jornada», pierde con la reunion y con el medidor', () => {
  const remota = { ...JORNADA, modalidad: 'teletrabajo' }
  const enOficina = { ...JORNADA, modalidad: 'oficina' }

  assert.equal(situacionDePersona(fila(1, 'A', { jornada: remota }), null), 'teletrabajo')
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: enOficina }), null), 'en_jornada')
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: { ...JORNADA, modalidad: null } }), null), 'en_jornada')
  // Una API sin la modalidad, o con un valor que el panel no conoce, se lee como «En jornada».
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: JORNADA }), null), 'en_jornada')
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: { ...JORNADA, modalidad: 'remoto' } }), null), 'en_jornada')
  // «En reunión» sigue teniendo prioridad si esta en sala; midiendo tambien dice mas que el lugar.
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: remota }), 'general'), 'en_reunion')
  assert.equal(situacionDePersona(fila(1, 'A', { jornada: remota, medidor: MEDIDOR }), null), 'midiendo')
  // Sin jornada no hay modalidad que valga.
  assert.equal(situacionDePersona(fila(1, 'A'), null), 'sin_jornada')
  assert.equal(etiquetaDeSituacion('teletrabajo'), 'Teletrabajo')
})

test('repartir el tablero: el teletrabajo va entre midiendo y jornada y tiene tarjeta', () => {
  const filas = [
    fila(1, 'Zoe'),
    fila(2, 'Ana', { jornada: JORNADA }),
    fila(3, 'Beto', { jornada: { ...JORNADA, modalidad: 'teletrabajo' } }),
    fila(4, 'Carla', { jornada: { ...JORNADA, modalidad: 'teletrabajo' }, medidor: MEDIDOR }),
    fila(5, 'Dani', { jornada: { ...JORNADA, modalidad: 'teletrabajo' } })
  ]
  const { tarjetas, enReposo } = repartirTarjetas(filas, new Map([[5, 'general']]))

  assert.deepEqual(tarjetas.map((f) => f.staff.name), ['Dani', 'Carla', 'Beto', 'Ana'])
  assert.deepEqual(enReposo.map((f) => f.staff.name), ['Zoe'])
})

test('repartir el tablero: quien esta en una sala tiene tarjeta aunque no tenga jornada', () => {
  const filas = [
    fila(1, 'Zoe'),
    fila(2, 'Ana', { jornada: JORNADA }),
    fila(3, 'Beto', { jornada: JORNADA, medidor: MEDIDOR }),
    fila(4, 'Carla'),
    fila(5, 'Álvaro', { jornada: JORNADA, medidor: MEDIDOR })
  ]
  const { tarjetas, enReposo } = repartirTarjetas(filas, new Map([[4, 'general']]))

  assert.deepEqual(tarjetas.map((f) => f.staff.name), ['Carla', 'Álvaro', 'Beto', 'Ana'])
  assert.deepEqual(enReposo.map((f) => f.staff.name), ['Zoe'])
  // Sin saber de salas (LiveKit caido) nadie aparece en reunion y Carla vuelve a la lista plegada.
  assert.deepEqual(repartirTarjetas(filas, null).enReposo.map((f) => f.staff.name), ['Carla', 'Zoe'])
  // No muta la lista que recibe: es estado de React.
  assert.equal(filas[0].staff.name, 'Zoe')
  assert.deepEqual(repartirTarjetas([], null), { tarjetas: [], enReposo: [] })
})

test('la hora de inicio es la de pared del negocio y no la del dispositivo', () => {
  // 13:05Z es 09:05 en Santiago en horario de invierno y 10:05 en verano; octubre ya es verano (UTC-3).
  assert.equal(horaDeInicio('2026-10-15T13:05:00Z'), '10:05')
  assert.equal(horaDeInicio('2026-07-15T13:05:00Z'), '09:05')
  assert.equal(horaDeInicio('no es una fecha'), null)
  assert.equal(horaDeInicio(null), null)
  assert.equal(horaDeInicio(undefined), null)
})

test('una sala privada no dice a que Espacio pertenece', () => {
  assert.equal(etiquetaDeSala('general'), 'la sala General')
  assert.equal(etiquetaDeSala('cafe'), 'la sala Café')
  assert.equal(etiquetaDeSala(SALA_PRIVADA_PARA_EL_EQUIPO), 'una sala privada')
  assert.equal(etiquetaDeSala('ya-no-existe'), 'una sala de Teletrabajo')

  assert.equal(salaParaElEquipo('general'), 'general')
  assert.equal(salaParaElEquipo('espacio-7'), SALA_PRIVADA_PARA_EL_EQUIPO)
  assert.equal(salaParaElEquipo('Sala Rara!'), null)
  assert.equal(salaParaElEquipo(''), null)
})

test('la identidad de LiveKit se lee de vuelta a la persona, y lo ajeno no es de nadie', () => {
  assert.equal(staffDeIdentidad(identidadDe(42, 'a1b2')), 42)
  assert.equal(staffDeIdentidad('staff-7-x-y'), 7)
  for (const ajena of ['', 'staff-0-x', 'staff--x', 'staff-abc-x', 'staff-5', 'invitado-5-x', 'staff-99999999999999999999-x']) {
    assert.equal(staffDeIdentidad(ajena), null, ajena)
  }
})

test('la respuesta de salas se lee sin fiarse de su forma', () => {
  assert.deepEqual([...salasDeRespuesta({ data: { 3: 'general', 9: 'privada' } })], [[3, 'general'], [9, 'privada']])
  for (const rara of [null, undefined, 'x', 5, {}, { data: null }, { data: 'x' }, { data: { a: 'general', 0: 'general', 4: 7, 5: '' } }]) {
    assert.equal(salasDeRespuesta(rara).size, 0)
  }
})

test('las tarjetas solo existen con el interruptor del equipo y el maestro encendidos', () => {
  const ajustes = (valores) => ({
    editable: Object.fromEntries(Object.entries(valores).map(([clave, value]) => [clave, { value }]))
  })

  assert.equal(configDeEnVivo(ajustes({ wiwo_en_vivo: '1', wiwo_en_vivo_equipo: '1' }), 'wss://x/en-vivo').equipo, true)
  assert.equal(configDeEnVivo(ajustes({ wiwo_en_vivo: '1', wiwo_en_vivo_equipo: '0' }), 'wss://x/en-vivo').equipo, false)
  // Sin el maestro o sin URL, todo apagado aunque el interruptor del equipo diga que si.
  assert.deepEqual(configDeEnVivo(ajustes({ wiwo_en_vivo: '0', wiwo_en_vivo_equipo: '1' }), 'wss://x/en-vivo'), CONFIG_EN_VIVO_APAGADA)
  assert.deepEqual(configDeEnVivo(ajustes({ wiwo_en_vivo: '1', wiwo_en_vivo_equipo: '1' }), ''), CONFIG_EN_VIVO_APAGADA)
})
