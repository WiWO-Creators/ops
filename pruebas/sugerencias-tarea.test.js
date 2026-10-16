/**
 * Pruebas de las sugerencias de campos de una Tarea nueva.
 *
 * Lo que puede salir mal aca no hace ruido: una respuesta mal formada que revienta el formulario, un
 * chip que ofrece a quien ya esta elegido, o un parte de "ignoradas" que cuenta como ignorado lo que
 * la persona si acepto y ensucia lo que el servidor aprende.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarAltaRapida } from '../src/dominio/alta-rapida.ts'
import { aplicarSugerencia } from '../src/dominio/edicion-tarea.ts'
import { fusionarInterpretacion, leerCamposTarea } from '../src/dominio/ia-tarea.ts'
import {
  aplanar, idDeSelector, leerSugerencias, parteDeSugerencias, pendientes, unirSugeridos
} from '../src/dominio/sugerencias-tarea.ts'

/** Una respuesta completa, con la forma del contrato. */
const RESPUESTA = {
  base: { tareas: 40, desde: '2026-07-17' },
  asignados: [
    { id: 12, nombre: 'Franz Molina', puntaje: 0.7, apoyo: 28 },
    { id: 15, nombre: 'Ana Rivas', puntaje: 0.4, apoyo: 16 }
  ],
  seguidores: [{ id: 18, nombre: 'Juan Pérez', puntaje: 0.5, apoyo: 20 }],
  etiquetas: [{ nombre: 'Digital', puntaje: 0.6, apoyo: 24 }, { nombre: 'Urgente', puntaje: 0.3, apoyo: 12 }],
  tipo: { id: 4, nombre: 'Diseño', puntaje: 0.6, apoyo: 24 },
  prioridad: { id: 2, nombre: 'Media', puntaje: 0.8, apoyo: 32 },
  hito: { id: 9, nombre: 'Fase 1', puntaje: 0.5, apoyo: 20 },
  facturable: { valor: false, puntaje: 0.9, apoyo: 36 },
  plazo: { dias: 5, fecha: '2026-10-20', fuente: 'eta_tipo', apoyo: 12 },
  horas_estimadas: { valor: 3.5, apoyo: 18 }
}

/** Un formulario sin nada elegido. */
const VACIO = {
  asignados: [], seguidores: [], etiquetas: [], tipo: null, prioridad: null, hito: null,
  vencimiento: '', horas: '', facturable: true
}

const textos = (chips) => chips.map((chip) => chip.texto)

test('leerSugerencias lee la respuesta completa', () => {
  const s = leerSugerencias(RESPUESTA)

  assert.deepEqual(s.asignados.map((p) => p.id), [12, 15])
  assert.equal(s.tipo.nombre, 'Diseño')
  assert.equal(s.facturable.valor, false)
  assert.deepEqual(s.plazo, { dias: 5, fecha: '2026-10-20', fuente: 'eta_tipo', apoyo: 12 })
  assert.deepEqual(s.horas, { valor: 3.5, apoyo: 18 })
})

test('leerSugerencias devuelve null con algo que no es un objeto o sin nada que sugerir', () => {
  for (const invalido of [null, undefined, 'texto', 7, [1, 2], true]) {
    assert.equal(leerSugerencias(invalido), null)
  }
  assert.equal(leerSugerencias({}), null)
  assert.equal(leerSugerencias({ base: { tareas: 3, desde: '2026-07-17' }, asignados: [], seguidores: [], etiquetas: [], tipo: null }), null)
})

test('leerSugerencias descarta lo mal formado sin tumbar el resto', () => {
  const s = leerSugerencias({
    asignados: [{ id: '12', nombre: 'Id como texto' }, { id: 15, nombre: '' }, null, 'x', { id: 15, nombre: 'Ana Rivas' }, { id: 15, nombre: 'Repetida' }],
    seguidores: 'no es lista',
    etiquetas: [{ nombre: 'Digital' }, { nombre: 'digital' }, { nombre: '  ' }, { puntaje: 1 }],
    tipo: { id: 0, nombre: 'Id invalido' },
    prioridad: { id: 2 },
    hito: [],
    facturable: { valor: 'no' },
    plazo: { dias: 5, fecha: '20/10/2026', fuente: 'eta_tipo', apoyo: 3 },
    horas_estimadas: { valor: -2, apoyo: 3 }
  })

  assert.deepEqual(s.asignados.map((p) => p.id), [15], 'solo queda la fila valida y sin repetir')
  assert.equal(s.asignados[0].nombre, 'Ana Rivas')
  assert.deepEqual(s.seguidores, [])
  assert.deepEqual(s.etiquetas.map((e) => e.nombre), ['Digital'], 'sin repetidas ni vacias')
  assert.equal(s.tipo, null)
  assert.equal(s.prioridad, null)
  assert.equal(s.hito, null)
  assert.equal(s.facturable, null)
  assert.equal(s.plazo, null, 'la fecha tiene que venir como YYYY-MM-DD')
  assert.equal(s.horas, null, 'horas negativas no son una estimacion')
})

test('leerSugerencias acepta un plazo de fuente desconocida solo si es una de las dos del contrato', () => {
  const sinFuente = leerSugerencias({ plazo: { dias: 3, fecha: '2026-10-20', fuente: 'adivinanza', apoyo: 1 } })

  assert.equal(sinFuente, null)
})

test('pendientes arma un chip por sugerencia con el texto que se ve', () => {
  const chips = pendientes(leerSugerencias(RESPUESTA), VACIO)

  assert.deepEqual(textos(chips.asignados), ['Franz Molina', 'Ana Rivas'])
  assert.deepEqual(textos(chips.seguidores), ['Juan Pérez'])
  assert.deepEqual(textos(chips.etiquetas), ['Digital', 'Urgente'])
  assert.deepEqual(textos(chips.tipo), ['Diseño'])
  assert.deepEqual(textos(chips.prioridad), ['Media'])
  assert.deepEqual(textos(chips.hito), ['Fase 1'])
  assert.deepEqual(textos(chips.facturable), ['No facturable'])
  assert.match(chips.plazo[0].texto, /^Vence 20\soct\.?\s2026$/, 'la fecha sale en es-CL')
  assert.equal(chips.plazo[0].valor, '2026-10-20')
  assert.match(chips.horas_estimadas[0].texto, /^3,5 horas$/)
  assert.equal(chips.horas_estimadas[0].valor, '3.5')
  assert.equal(aplanar(chips).length, 11)
})

test('pendientes oculta lo que ya esta elegido', () => {
  const chips = pendientes(leerSugerencias(RESPUESTA), {
    asignados: [12], seguidores: [18], etiquetas: ['digital'], tipo: 4, prioridad: 3, hito: 9,
    vencimiento: '2026-10-25', horas: '2', facturable: false
  })

  assert.deepEqual(textos(chips.asignados), ['Ana Rivas'], 'ofrece a quien falta')
  assert.deepEqual(chips.seguidores, [])
  assert.deepEqual(textos(chips.etiquetas), ['Urgente'], 'compara etiquetas sin mirar mayusculas')
  assert.deepEqual(chips.tipo, [])
  assert.deepEqual(chips.prioridad, [], 'con otra prioridad elegida tampoco se insiste')
  assert.deepEqual(chips.hito, [])
  assert.deepEqual(chips.plazo, [])
  assert.deepEqual(chips.horas_estimadas, [])
  assert.deepEqual(chips.facturable, [], 'ya esta desmarcado')
})

test('pendientes solo sugiere "no facturable" cuando lo habitual es no facturar', () => {
  const facturaba = { ...RESPUESTA, facturable: { valor: true, puntaje: 0.9, apoyo: 30 } }

  assert.deepEqual(pendientes(leerSugerencias(facturaba), VACIO).facturable, [])
})

test('pendientes tolera horas en cero y no las confunde con vacio', () => {
  const cero = leerSugerencias({ horas_estimadas: { valor: 0, apoyo: 5 } })

  assert.equal(pendientes(cero, VACIO).horas_estimadas[0].valor, '0')
  assert.deepEqual(pendientes(cero, { ...VACIO, horas: '0' }).horas_estimadas, [])
})

test('pendientes con soloVacios (edicion) solo sugiere en campos sin nada', () => {
  const sugerencias = leerSugerencias(RESPUESTA)
  const lleno = pendientes(sugerencias, { ...VACIO, asignados: [99], etiquetas: ['Otra'], seguidores: [99] }, { soloVacios: true })

  assert.deepEqual(lleno.asignados, [])
  assert.deepEqual(lleno.seguidores, [])
  assert.deepEqual(lleno.etiquetas, [])
  assert.deepEqual(lleno.facturable, [], 'la casilla nunca esta vacia')

  const vacio = pendientes(sugerencias, VACIO, { soloVacios: true })

  assert.equal(vacio.asignados.length, 2)
  assert.equal(vacio.tipo.length, 1)
})

test('pendientes descarta ids que el formulario no sabe mostrar', () => {
  const chips = pendientes(leerSugerencias(RESPUESTA), VACIO, {
    conocidos: { personas: new Set([12]), tipos: new Set([7]), prioridades: new Set([2]), hitos: new Set() }
  })

  assert.deepEqual(textos(chips.asignados), ['Franz Molina'])
  assert.deepEqual(textos(chips.seguidores), [], 'Juan no esta en el selector')
  assert.deepEqual(chips.tipo, [])
  assert.deepEqual(textos(chips.prioridad), ['Media'])
  assert.deepEqual(chips.hito, [])
})

test('pendientes sin sugerencias no devuelve nada, pero siempre trae las nueve claves', () => {
  const chips = pendientes(null, VACIO)

  assert.equal(Object.keys(chips).length, 9)
  assert.deepEqual(aplanar(chips), [])
})

test('parteDeSugerencias separa aceptadas de ignoradas y no cuenta dos veces lo aceptado', () => {
  const chips = pendientes(leerSugerencias(RESPUESTA), VACIO)
  const franz = chips.asignados[0]
  const digital = chips.etiquetas[0]

  // La persona clico Franz y Digital; despues saco Franz a mano y su chip volvio a aparecer.
  const parte = parteDeSugerencias([franz, digital], aplanar(chips))

  assert.deepEqual(parte.aceptadas, [{ campo: 'asignados', valor: '12' }, { campo: 'etiquetas', valor: 'Digital' }])
  assert.equal(parte.ignoradas.some((e) => e.campo === 'asignados' && e.valor === '12'), false)
  assert.equal(parte.ignoradas.some((e) => e.campo === 'asignados' && e.valor === '15'), true)
  assert.equal(parte.ignoradas.some((e) => e.campo === 'plazo' && e.valor === '5'), true, 'el plazo viaja como dias')
  assert.equal(parte.ignoradas.some((e) => e.campo === 'plazo' && e.valor === '2026-10-20'), false)
  assert.equal(parte.ignoradas.some((e) => e.campo === 'facturable' && e.valor === '0'), true, 'facturable viaja como 0/1')
  assert.ok(parte.ignoradas.every((e) => typeof e.valor === 'string'), 'el valor viaja siempre como texto')
})

test('parteDeSugerencias sin chips ni clics es null y no repite entradas', () => {
  assert.equal(parteDeSugerencias([], []), null)

  const chips = pendientes(leerSugerencias(RESPUESTA), VACIO)
  const repetido = parteDeSugerencias([chips.tipo[0], chips.tipo[0]], [])

  assert.equal(repetido.aceptadas.length, 1)
  assert.deepEqual(repetido.ignoradas, [])
})

test('unirSugeridos suma los de la IA sin duplicar los del historial', () => {
  const nombres = {
    personas: [{ id: 12, nombre: 'Franz Molina' }, { id: 20, nombre: 'Luz Soto' }],
    tipos: [{ id: 4, nombre: 'Diseño' }, { id: 5, nombre: 'Redacción' }],
    prioridades: [{ id: 3, nombre: 'Alta' }],
    hitos: [{ id: 9, nombre: 'Fase 1' }]
  }
  const habito = { asignados: [12, 20, 77], seguidores: [], etiquetas: ['digital', 'Nueva'], tipo: 5, prioridad: 3, hito: 40 }
  const unida = unirSugeridos(leerSugerencias(RESPUESTA), habito, nombres)

  assert.deepEqual(unida.asignados.map((p) => p.id), [12, 15, 20], 'Franz no se repite y el 77 no tiene nombre')
  assert.deepEqual(unida.etiquetas.map((e) => e.nombre), ['Digital', 'Urgente', 'Nueva'])
  assert.equal(unida.tipo.id, 4, 'el del historial gana')
  assert.equal(unida.prioridad.id, 2, 'el del historial gana')
  assert.equal(unida.hito.id, 9)
})

test('unirSugeridos funciona sin historial y devuelve null si la IA tampoco aporta', () => {
  const nombres = { personas: [{ id: 20, nombre: 'Luz Soto' }], tipos: [], prioridades: [{ id: 3, nombre: 'Alta' }], hitos: [] }
  const solo = unirSugeridos(null, { asignados: [20], seguidores: [], etiquetas: [], tipo: null, prioridad: 3, hito: null }, nombres)

  assert.deepEqual(textos(pendientes(solo, VACIO).asignados), ['Luz Soto'])
  assert.deepEqual(textos(pendientes(solo, VACIO).prioridad), ['Alta'])

  const nada = { asignados: [99], seguidores: [], etiquetas: [], tipo: 8, prioridad: null, hito: null }

  assert.equal(unirSugeridos(null, nada, nombres), null)
  assert.equal(unirSugeridos(null, null, nombres), null)
  assert.equal(unirSugeridos(leerSugerencias(RESPUESTA), null, nombres).tipo.id, 4)
})

const CATALOGOS = {
  personas: [{ id: 12, full_name: 'Franz Molina' }, { id: 15, full_name: 'Ana Rivas' }],
  espacios: [{ id: 8, name: 'Colbún' }],
  prioridades: [{ id: 1, name: 'Baja' }, { id: 3, name: 'Alta' }],
  etiquetas: [{ id: 1, name: 'Digital' }]
}

test('la interpretacion lee "sugeridos" y nunca los aplica', () => {
  const ia = leerCamposTarea({
    campos: { name: 'Algo', assignees: [], tags: [] },
    sugeridos: { asignados: [12, 999], seguidores: [15], etiquetas: ['digital', 'Inventada'], tipo: 4, prioridad: 3, hito: 9 }
  })
  const fusion = fusionarInterpretacion(interpretarAltaRapida('Algo para hacer', CATALOGOS), ia, CATALOGOS)

  assert.deepEqual(fusion.assignees, [], 'lo que viene por habito no asigna')
  assert.equal(fusion.priority, null)
  assert.deepEqual(fusion.tags, [])
  assert.deepEqual(fusion.sugeridos.asignados, [12], 'el id que la interfaz no conoce se cae')
  assert.deepEqual(fusion.sugeridos.seguidores, [15])
  assert.deepEqual(fusion.sugeridos.etiquetas, ['Digital'], 'solo etiquetas del catalogo, con su nombre canonico')
  assert.equal(fusion.sugeridos.prioridad, 3)
  assert.equal(fusion.sugeridos.tipo, 4)
  assert.equal(fusion.sugeridos.hito, 9)
})

test('sin "sugeridos", o mal formados, la interpretacion sigue igual y el campo queda vacio', () => {
  const vacio = { asignados: [], seguidores: [], etiquetas: [], tipo: null, prioridad: null, hito: null }

  assert.deepEqual(leerCamposTarea({ name: 'Algo' }).sugeridos, vacio)
  assert.deepEqual(leerCamposTarea({ name: 'Algo', sugeridos: 'x' }).sugeridos, vacio)
  assert.deepEqual(
    leerCamposTarea({ sugeridos: { asignados: ['12', 7, 7], tipo: '4', etiquetas: [3, 'a'] } }).sugeridos,
    { ...vacio, asignados: [7], etiquetas: ['a'] }
  )
  assert.deepEqual(fusionarInterpretacion(interpretarAltaRapida('Algo', CATALOGOS), null, CATALOGOS).sugeridos, vacio)
})

/** Los campos de una Tarea vacía en el formulario de edición. */
const CAMPOS_VACIOS = {
  asignados: [], seguidores: [], etiquetas: [], tipo: '', prioridad: '', hito: '',
  vencimiento: '', horasEstimadas: '', facturable: true
}
const ETIQUETAS_DEL_CATALOGO = [{ id: 1, name: 'Digital' }]

test('aplicarSugerencia (edicion) pone el valor del chip en su campo', () => {
  const chips = pendientes(leerSugerencias(RESPUESTA), VACIO, { soloVacios: true })
  const aplicar = (campos, chip) => aplicarSugerencia(campos, chip, ETIQUETAS_DEL_CATALOGO)

  assert.deepEqual(aplicar(CAMPOS_VACIOS, chips.asignados[0]).asignados, [12])
  assert.deepEqual(aplicar(CAMPOS_VACIOS, chips.seguidores[0]).seguidores, [18])
  assert.equal(aplicar(CAMPOS_VACIOS, chips.tipo[0]).tipo, '4')
  assert.equal(aplicar(CAMPOS_VACIOS, chips.prioridad[0]).prioridad, '2')
  assert.equal(aplicar(CAMPOS_VACIOS, chips.hito[0]).hito, '9')
  assert.equal(aplicar(CAMPOS_VACIOS, chips.plazo[0]).vencimiento, '2026-10-20')
  assert.equal(aplicar(CAMPOS_VACIOS, chips.horas_estimadas[0]).horasEstimadas, '3.5')
})

test('aplicarSugerencia guarda la etiqueta existente por id y la nueva por nombre, sin repetir', () => {
  const chips = pendientes(leerSugerencias(RESPUESTA), VACIO, { soloVacios: true }).etiquetas
  const conDigital = aplicarSugerencia(CAMPOS_VACIOS, chips[0], ETIQUETAS_DEL_CATALOGO)
  const conUrgente = aplicarSugerencia(conDigital, chips[1], ETIQUETAS_DEL_CATALOGO)

  assert.deepEqual(conDigital.etiquetas, [1], 'la del catalogo viaja como id')
  assert.deepEqual(conUrgente.etiquetas, [1, 'Urgente'], 'la que no existe viaja como nombre')
  assert.equal(aplicarSugerencia(conUrgente, chips[0], ETIQUETAS_DEL_CATALOGO), conUrgente, 'aceptar dos veces no repite')
})

test('aplicarSugerencia ignora lo que no puede aplicar', () => {
  const sinId = { campo: 'tipo', valor: '4', texto: 'Diseño', ayuda: '', id: null }
  const facturable = { campo: 'facturable', valor: 'false', texto: 'No facturable', ayuda: '', id: null }

  assert.equal(aplicarSugerencia(CAMPOS_VACIOS, sinId, []), CAMPOS_VACIOS)
  assert.equal(aplicarSugerencia(CAMPOS_VACIOS, facturable, []), CAMPOS_VACIOS)
})

test('idDeSelector solo acepta ids positivos', () => {
  assert.equal(idDeSelector('7'), 7)
  for (const invalido of ['', 'ninguno', '0', '-3', '2.5', 'NaN']) assert.equal(idDeSelector(invalido), null)
})
