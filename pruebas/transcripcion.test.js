/**
 * El contrato de "Solo transcribir".
 *
 * Lo que puede salir mal sin que nadie lo note: un frame SSE que no se entiende y tira la pantalla
 * abajo, un texto con marcas de tiempo mal armado, o una transcripción que se muestra vencida cuando
 * todavía no lo está.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDIOMAS_TRANSCRIPCION,
  IDIOMA_POR_DEFECTO,
  formatoDeVencimiento,
  leerEventoTranscripcion,
  leerSegmento,
  leerSegmentos,
  leerTranscripcion,
  nombreDeArchivoTranscripcion,
  textoDeTranscripcion,
  transcripcionVencida,
  validarAudioDeTranscripcion,
  AVISO_PRIVACIDAD_TRANSCRIPCION
} from '../src/dominio/transcripcion.ts'

const evento = (nombre, datos) => `event: ${nombre}\ndata: ${JSON.stringify(datos)}`

const TRANSCRIPCION = {
  id: 1,
  project_id: 9,
  idioma: 'es',
  texto: 'Hola mundo',
  segmentos: [
    { inicio: 0, fin: 2, texto: 'Hola' },
    { inicio: 2, fin: 4, texto: 'mundo' }
  ],
  duracion_segundos: 4,
  creado_en: '2026-09-28T10:00:00Z',
  expira_en: '2026-09-29T10:00:00Z'
}

test('el idioma por defecto esta en la lista de opciones', () => {
  assert.ok(IDIOMAS_TRANSCRIPCION.some((o) => o.valor === IDIOMA_POR_DEFECTO))
  assert.equal(IDIOMA_POR_DEFECTO, 'es')
})

test('un segmento sin tiempos numericos se descarta', () => {
  assert.equal(leerSegmento({ inicio: 0, fin: 2, texto: 'ok' }).texto, 'ok')
  assert.equal(leerSegmento({ inicio: 'a', fin: 2, texto: 'ok' }), null)
  assert.equal(leerSegmento({ inicio: 0, fin: 2 }), null)
  assert.equal(leerSegmento(null), null)
})

test('segmentos invalidos no tumban a los demas', () => {
  const segmentos = leerSegmentos([
    { inicio: 0, fin: 1, texto: 'uno' },
    { inicio: 'x', fin: 1, texto: 'malo' },
    { inicio: 1, fin: 2, texto: 'tres' }
  ])

  assert.equal(segmentos.length, 2)
  assert.deepEqual(segmentos.map((s) => s.texto), ['uno', 'tres'])
})

test('segmentos vacio o no-array cae a []', () => {
  assert.deepEqual(leerSegmentos(undefined), [])
  assert.deepEqual(leerSegmentos('no es array'), [])
  assert.deepEqual(leerSegmentos([]), [])
})

test('una transcripcion completa se valida entera', () => {
  const leida = leerTranscripcion(TRANSCRIPCION)

  assert.equal(leida.id, 1)
  assert.equal(leida.segmentos.length, 2)
})

test('sin id, proyecto, texto o expira_en la transcripcion se descarta', () => {
  assert.equal(leerTranscripcion({ ...TRANSCRIPCION, id: 'x' }), null)
  assert.equal(leerTranscripcion({ ...TRANSCRIPCION, project_id: undefined }), null)
  assert.equal(leerTranscripcion({ ...TRANSCRIPCION, texto: 123 }), null)
  assert.equal(leerTranscripcion({ ...TRANSCRIPCION, expira_en: undefined }), null)
  assert.equal(leerTranscripcion(null), null)
})

test('segmentos ausentes o duracion nula no descartan la transcripcion', () => {
  const { segmentos, duracion_segundos: duracion, ...resto } = TRANSCRIPCION
  const leida = leerTranscripcion({ ...resto, duracion_segundos: null })

  assert.deepEqual(leida.segmentos, [])
  assert.equal(leida.duracion_segundos, null)
})

test('el evento paso se interpreta igual que en el resto de la capa de IA', () => {
  const frame = evento('paso', { fase: 'inicio', herramienta: 'transcribir', etiqueta: 'Escuchando…', orbe: 'listening' })
  const leido = leerEventoTranscripcion(frame)

  assert.equal(leido.tipo, 'paso')
  assert.equal(leido.paso.etiqueta, 'Escuchando…')
})

test('el evento error trae codigo y mensaje', () => {
  const leido = leerEventoTranscripcion(evento('error', { code: 'provider_error', message: 'Se cortó.' }))

  assert.deepEqual(leido, { tipo: 'error', codigo: 'provider_error', mensaje: 'Se cortó.' })
})

test('el evento fin trae la transcripcion ya guardada', () => {
  const leido = leerEventoTranscripcion(evento('fin', { transcripcion: TRANSCRIPCION }))

  assert.equal(leido.tipo, 'fin')
  assert.equal(leido.transcripcion.id, 1)
})

test('un fin sin transcripcion valida se descarta entero', () => {
  assert.equal(leerEventoTranscripcion(evento('fin', {})), null)
  assert.equal(leerEventoTranscripcion(evento('fin', { transcripcion: { id: 'x' } })), null)
})

test('un frame desconocido o corrupto no revienta el stream', () => {
  assert.equal(leerEventoTranscripcion(evento('otra-cosa', {})), null)
  assert.equal(leerEventoTranscripcion('data: no es un frame valido'), null)
  assert.equal(leerEventoTranscripcion('event: fin\ndata: {no es json'), null)
})

test('solo se acepta audio', () => {
  assert.equal(validarAudioDeTranscripcion({ name: 'reunion.mp3', size: 1024 }), null)
  assert.equal(validarAudioDeTranscripcion({ name: 'foto.png', size: 1024 }), 'Solo se aceptan archivos de audio.')
  assert.match(validarAudioDeTranscripcion({ name: 'reunion.mp3', size: 0 }), /vacío/)
})

test('el audio respeta el mismo tope que el del acta', () => {
  const grande = { name: 'reunion.mp3', size: 200 * 1024 * 1024 }
  assert.match(validarAudioDeTranscripcion(grande), /máximo/)
})

test('el texto con marcas junta segmento y tiempo', () => {
  assert.equal(textoDeTranscripcion(TRANSCRIPCION, true), '[00:00] Hola\n[00:02] mundo')
})

test('sin marcas se muestra el texto corrido', () => {
  assert.equal(textoDeTranscripcion(TRANSCRIPCION, false), 'Hola mundo')
})

test('sin segmentos, pedir marcas igual cae al texto corrido', () => {
  const sinSegmentos = { ...TRANSCRIPCION, segmentos: [] }
  assert.equal(textoDeTranscripcion(sinSegmentos, true), 'Hola mundo')
})

test('una transcripcion vence segun su propio expira_en', () => {
  const ahora = new Date('2026-09-29T10:00:01Z')
  const antes = new Date('2026-09-29T09:59:59Z')

  assert.equal(transcripcionVencida(TRANSCRIPCION.expira_en, ahora), true)
  assert.equal(transcripcionVencida(TRANSCRIPCION.expira_en, antes), false)
})

test('una fecha de vencimiento invalida no revienta el aviso', () => {
  assert.equal(formatoDeVencimiento('no-es-fecha'), 'en 24 horas')
  assert.match(formatoDeVencimiento(TRANSCRIPCION.expira_en), /2026/)
})

test('el nombre del archivo descargado lleva la fecha adelante', () => {
  assert.equal(nombreDeArchivoTranscripcion(TRANSCRIPCION), 'transcripcion-2026-09-28-1.txt')
})

test('el aviso de privacidad dice cuanto dura y de quien es la responsabilidad', () => {
  assert.match(AVISO_PRIVACIDAD_TRANSCRIPCION, /24 horas/)
  assert.match(AVISO_PRIVACIDAD_TRANSCRIPCION, /responsabilidad/)
})
