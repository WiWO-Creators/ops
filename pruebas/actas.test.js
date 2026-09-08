import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACEPTA,
  LIMITE_BYTES,
  extensionDe,
  formatoPeso,
  inferirMime,
  mensajeDeMicrofono,
  mimeDeGrabacion,
  nombreDeGrabacion,
  reloj,
  tituloDeActa,
  validarArchivo
} from '../src/dominio/actas.ts'
import { ACTAS, vistaPrevia } from '../src/definiciones/actas.ts'

/**
 * Reglas del Meeting Paper.
 *
 * Lo que se prueba acá es lo que decide si un archivo sale del navegador y con qué nombre se guarda
 * el acta: si se rompe, la persona graba una reunión de una hora y se entera al final.
 */

test('el tipo sale de la extensión, no de lo que diga el navegador', () => {
  assert.equal(inferirMime('reunion.m4a'), 'audio/aac')
  assert.equal(inferirMime('REUNION.M4A'), 'audio/aac', 'la extensión no distingue mayúsculas')
  assert.equal(inferirMime('pizarra.jpeg'), 'image/jpeg')
  assert.equal(inferirMime('foto.HEIC'), 'image/heic', 'lo que sale de un iPhone sin convertir')
  assert.equal(inferirMime('acta.pdf'), null)
  assert.equal(inferirMime('sinextension'), null)
  assert.equal(inferirMime('.gitignore'), null)
})

test('un .mp4 se trata como audio: es el .m4a que renombró iCloud', () => {
  // No es un descuido. Sin esta línea, el archivo que la gente sube desde el teléfono se rechaza.
  assert.equal(inferirMime('grabacion.mp4'), 'audio/aac')
})

test('extensionDe aísla la última extensión', () => {
  assert.equal(extensionDe('acta.final.m4a'), 'm4a')
  assert.equal(extensionDe('sinpunto'), '')
  assert.equal(extensionDe(''), '')
})

test('validarArchivo rechaza lo que la API rechazaría, antes de subirlo', () => {
  assert.equal(validarArchivo({ name: 'reunion.m4a', size: 1024 }), null)

  assert.match(validarArchivo({ name: 'acta.pdf', size: 1024 }) ?? '', /audio o de imagen/)
  assert.match(validarArchivo({ name: 'reunion.m4a', size: 0 }) ?? '', /vacío/)

  const grande = validarArchivo({ name: 'reunion.m4a', size: LIMITE_BYTES + 1 })
  assert.match(grande ?? '', /25,0 MB/, 'el mensaje dice cuánto pesa y cuánto se acepta')

  assert.equal(validarArchivo({ name: 'reunion.m4a', size: LIMITE_BYTES }), null, 'el borde exacto entra')
})

test('el peso se lee de un vistazo', () => {
  assert.equal(formatoPeso(0), '0 KB')
  assert.equal(formatoPeso(512), '1 KB', 'nunca "0 KB" para algo que sí ocupa')
  assert.equal(formatoPeso(1024 * 1024), '1,0 MB')
  assert.equal(formatoPeso(14.2 * 1024 * 1024), '14,2 MB')
  assert.equal(formatoPeso(-5), '0 KB')
  assert.equal(formatoPeso(Number.NaN), '0 KB')
})

test('el título sale del <h1> y pierde el prefijo que se repite en todas', () => {
  assert.equal(tituloDeActa('<h1>Meeting Paper - Kickoff Acme</h1><p>x</p>'), 'Kickoff Acme')
  assert.equal(tituloDeActa('<h1 class="x">meeting paper -   Revisión</h1>'), 'Revisión')
  assert.equal(tituloDeActa('<h1>Sin prefijo</h1>'), 'Sin prefijo')
  assert.equal(tituloDeActa('<h1><strong>Con</strong> etiquetas</h1>'), 'Con etiquetas')
  assert.equal(tituloDeActa('<h1>Ana &amp; Luis</h1>'), 'Ana & Luis')
})

test('el título nunca queda vacío: un acta sin nombre no se puede guardar', () => {
  assert.equal(tituloDeActa('<p>sin encabezado</p>'), 'Meeting Paper')
  assert.equal(tituloDeActa('<h1></h1>'), 'Meeting Paper')
  assert.equal(tituloDeActa('<h1>Meeting Paper - </h1>'), 'Meeting Paper')
  assert.equal(tituloDeActa(''), 'Meeting Paper')
  assert.equal(tituloDeActa('<p>x</p>', 'De reserva'), 'De reserva')
})

test('la grabación elige un tipo que el navegador sepa grabar', () => {
  assert.equal(mimeDeGrabacion(() => true), 'audio/webm;codecs=opus')
  // Safari: no graba webm. Sin esta caída, la grabación falla en todos los iPhone.
  assert.equal(mimeDeGrabacion((tipo) => tipo === 'audio/mp4'), 'audio/mp4')
  assert.equal(mimeDeGrabacion(() => false), '', 'sin candidatos, decide el navegador')
})

test('el nombre del archivo grabado acompaña a su tipo', () => {
  assert.match(nombreDeGrabacion('audio/mp4'), /^reunion-\d{4}-\d{2}-\d{2}\.m4a$/)
  assert.match(nombreDeGrabacion('audio/webm;codecs=opus'), /\.webm$/)
})

test('el cronómetro cuenta mm:ss', () => {
  assert.equal(reloj(0), '00:00')
  assert.equal(reloj(65_000), '01:05')
  assert.equal(reloj(3_600_000), '60:00', 'no se reinicia a la hora')
  assert.equal(reloj(-1), '00:00')
})

test('el fallo del micrófono dice qué hacer, no solo que falló', () => {
  assert.match(mensajeDeMicrofono('NotAllowedError'), /candado/)
  assert.match(mensajeDeMicrofono('NotFoundError'), /ningún micrófono/)
  assert.match(mensajeDeMicrofono('NotReadableError'), /otra aplicación/)
  assert.match(mensajeDeMicrofono(''), /No se pudo iniciar/)
})

test('el selector de archivos ofrece las extensiones que la API acepta', () => {
  assert.ok(ACEPTA.audio.includes('.m4a'))
  assert.ok(ACEPTA.audio.includes('.opus'))
  assert.ok(ACEPTA.imagen.includes('.heic'))
  assert.ok(!ACEPTA.imagen.includes('.m4a'))
})

test('la vista previa del listado es texto plano, nunca HTML', () => {
  const previa = vistaPrevia('<h1>Acta</h1><p>Se acordó el <strong>alcance</strong>.</p>')

  assert.ok(!previa.includes('<'), 'ni una etiqueta sobrevive')
  assert.ok(previa.includes('Se acordó el alcance.'))
  assert.equal(vistaPrevia(null), '')
  assert.ok(vistaPrevia(`<p>${'a'.repeat(500)}</p>`).length <= 120)
})

test('el orden por defecto está entre los ordenables que el backend acepta', () => {
  // Un `sort` que el backend no declara devuelve 422 en la primera carga de la pestaña.
  assert.ok(ACTAS.ordenables.includes(ACTAS.ordenPorDefecto.replace(/^-/, '')))
  for (const columna of ACTAS.columnas) {
    if (columna.ordenPor !== undefined) {
      assert.ok(ACTAS.ordenables.includes(columna.ordenPor), `columna ${columna.clave}`)
    }
  }
})
