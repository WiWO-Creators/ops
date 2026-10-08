/**
 * El informe exportable del tablero.
 *
 * Lo que se prueba es lo que se rompe en silencio: un bloque que no llegó escrito como cero, un
 * porcentaje `null` convertido en «0 %», la nota de «aproximado» que aparece donde no corresponde
 * y un rótulo de mes cerrado que sigue diciendo «esta semana». El documento de pdfmake se prueba
 * por su forma —que arme y que lleve el texto— y no por su aspecto, que se revisa en el navegador.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contenidoDelInforme, modeloDelInforme } from '../src/dominio/informe-tablero.ts'
import { nombreDelInforme } from '../src/dominio/exportar-informe-pdf.ts'
import { COLORES } from '../src/dominio/exportar-pdf.ts'

const ESTADOS = [
  { id: 1, name: 'Por iniciar', color: '#f97316' },
  { id: 5, name: 'Completo', color: '#22c55e' }
]

function tablero (extra = {}) {
  return {
    avance: { tareas: 80, cerradas: 59, abiertas: 21, porcentaje: 74 },
    tareas: {
      por_prioridad: [
        { priority: 1, name: 'Bajo', total: 0 },
        { priority: 2, name: 'Medio', total: 74 },
        { priority: 3, name: 'Alto', total: 6 },
        { priority: 4, name: 'Urgente', total: 0 }
      ],
      por_estado: [{ status: 1, total: 20 }, { status: 5, total: 59 }],
      vencidas: 16,
      sin_fecha: 0,
      cerradas_7: 21,
      cerradas_30: 40,
      cerradas_mes: 33
    },
    proxima_entrega: { id: 1, name: 'Newsletter Agosto', duedate: '2026-08-20', dias: 1 },
    hitos: { lista: [] },
    actividad: [
      { fecha: '2026-08-10 10:00:00', clave: 'project_activity_task_marked_complete' },
      { fecha: '2026-08-11 10:00:00', clave: 'clave_desconocida' }
    ],
    ...extra
  }
}

const OPCIONES = { proyecto: 'Proyecto Demo', mes: null, emitido: '2026-10-08' }

function textoDe (contenido) {
  return JSON.stringify(contenido)
}

test('el período es «Mes en curso» o el mes rotulado', () => {
  assert.equal(modeloDelInforme(tablero(), ESTADOS, OPCIONES).periodo, 'Mes en curso')

  const cerrado = modeloDelInforme(
    tablero({ foto: { mes: '2026-08', cerrado: true, hasta: '2026-08-31', aproximado: false } }),
    ESTADOS,
    { ...OPCIONES, mes: '2026-08' }
  )

  assert.match(cerrado.periodo, /agosto/i)
  assert.match(cerrado.periodo, /2026/)
})

test('un bloque que no llegó se omite, no se escribe en cero', () => {
  const sinPestanias = { avance: tablero().avance }
  const modelo = modeloDelInforme(sinPestanias, ESTADOS, OPCIONES)

  for (const clave of ['cifras', 'estados', 'prioridades', 'hitos', 'novedades', 'proximaEntrega']) {
    assert.equal(modelo[clave], undefined, clave)
  }

  const texto = textoDe(contenidoDelInforme(modelo, COLORES.wiwo))

  assert.doesNotMatch(texto, /Tareas por estado|Pendientes por hito|Novedades del período/)
})

test('un porcentaje null se dice «sin dato» y nunca «0 %»', () => {
  const modelo = modeloDelInforme(
    { avance: { tareas: 0, cerradas: 0, abiertas: 0, porcentaje: null } },
    ESTADOS,
    OPCIONES
  )
  const texto = textoDe(contenidoDelInforme(modelo, COLORES.wiwo))

  assert.match(texto, /Sin dato/)
  assert.doesNotMatch(texto, /0 %/)
})

test('la nota de reparto aproximado solo aparece en una foto cerrada y aproximada', () => {
  const nota = /aproximado/
  const vivo = modeloDelInforme(tablero(), ESTADOS, OPCIONES)
  const exacto = modeloDelInforme(
    tablero({ foto: { mes: '2026-08', cerrado: true, hasta: '2026-08-31', aproximado: false } }),
    ESTADOS,
    OPCIONES
  )
  const aproximado = modeloDelInforme(
    tablero({ foto: { mes: '2026-08', cerrado: true, hasta: '2026-08-31', aproximado: true } }),
    ESTADOS,
    OPCIONES
  )

  assert.equal(vivo.notas.length, 0)
  assert.equal(exacto.notas.some((n) => nota.test(n)), false)
  assert.equal(aproximado.notas.some((n) => nota.test(n)), true)
})

test('los rótulos de un mes cerrado dicen «al cierre» y «en el mes»', () => {
  const modelo = modeloDelInforme(
    tablero({ foto: { mes: '2026-08', cerrado: true, hasta: '2026-08-31', aproximado: false } }),
    ESTADOS,
    OPCIONES
  )
  const etiquetas = modelo.cifras.map((cifra) => cifra.etiqueta)

  assert.deepEqual(etiquetas, ['Vencidas al cierre', 'Cerradas en el mes', 'Abiertas sin fecha al cierre'])
  assert.match(modelo.resumen.join(' '), /Al cierre había 16 tareas vencidas/)
})

test('sin cerradas_mes se cae a la ventana de siete días', () => {
  const t = tablero()

  delete t.tareas.cerradas_mes

  const modelo = modeloDelInforme(t, ESTADOS, OPCIONES)

  assert.equal(modelo.cifras[1].etiqueta, 'Cerradas esta semana')
})

test('las claves de actividad desconocidas no entran', () => {
  const modelo = modeloDelInforme(tablero(), ESTADOS, OPCIONES)

  assert.equal(modelo.novedades.length, 1)
})

test('el documento arma, lleva el texto y respeta la fecha de emisión inyectada', () => {
  const modelo = modeloDelInforme(tablero(), ESTADOS, OPCIONES)
  const texto = textoDe(contenidoDelInforme(modelo, COLORES.wiwo))

  assert.match(texto, /Proyecto Demo/)
  assert.match(texto, /emitido el 2026-10-08/)
  assert.match(texto, /Tareas por prioridad/)
  assert.match(texto, /Newsletter Agosto/)
})

test('el nombre del archivo no lleva tildes ni símbolos y distingue el mes', () => {
  assert.equal(nombreDelInforme('Año Nuevo / Ñandú', '2026-08'), 'informe-ano-nuevo-nandu-2026-08.pdf')
  assert.equal(nombreDelInforme('Demo', null), 'informe-demo-en-curso.pdf')
  assert.equal(nombreDelInforme('///', null), 'informe-proyecto-en-curso.pdf')
})
