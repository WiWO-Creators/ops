import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACEPTA,
  LIMITE_AUDIO_BYTES,
  LIMITE_BYTES,
  LIMITE_DOCUMENTO_BYTES,
  LIMITE_TOTAL_BYTES,
  MAXIMO_ARCHIVOS,
  MIME_DOCUMENTO,
  extensionDe,
  formatoPeso,
  inferirMime,
  mensajeDeMicrofono,
  mimeDeGrabacion,
  nombreDeGrabacion,
  reloj,
  seVeComoImagen,
  tituloDeActa,
  validarArchivo,
  validarArchivos
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

test('el selector permite grabaciones en contenedores de video y otros formatos de audio', () => {
  for (const extension of ['mp4', 'm4v', 'mov', 'mkv', 'avi', '3gp', 'wma', 'amr']) {
    assert.ok(ACEPTA.audio.split(',').includes(`.${extension}`))
    assert.equal(validarArchivo({ name: `reunion.${extension.toUpperCase()}`, size: 1024 }, 'audio'), null)
    assert.match(inferirMime(`reunion.${extension}`), /^audio\//)
    assert.match(validarArchivo({ name: `reunion.${extension}`, size: 0 }, 'audio'), /vacío/)
    assert.match(validarArchivo({ name: `reunion.${extension}`, size: LIMITE_AUDIO_BYTES + 1 }, 'audio'), /máximo/)
  }
  assert.match(validarArchivo({ name: 'reunion.exe', size: 1024 }, 'audio'), /Solo se aceptan/)
  assert.match(validarArchivo({ name: '', size: 1024 }, 'audio'), /Solo se aceptan/)
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

  const grande = validarArchivo({ name: 'reunion.m4a', size: LIMITE_AUDIO_BYTES + 1 })
  assert.match(grande ?? '', /100,0 MB/, 'el mensaje dice cuánto pesa y cuánto se acepta')

  assert.equal(validarArchivo({ name: 'reunion.m4a', size: 100 * 1024 * 1024 }), null, 'el borde exacto entra')
  assert.equal(validarArchivo({ name: '2026-09-08 10-04-02.mp4', size: Math.ceil(38.5 * 1024 * 1024) }, 'audio'), null)
  assert.equal(validarArchivo({ name: 'pizarra.jpg', size: LIMITE_BYTES }, 'imagen'), null)
  assert.match(validarArchivo({ name: 'pizarra.jpg', size: LIMITE_BYTES + 1 }, 'imagen') ?? '', /25,0 MB/)
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
  // webm primero: los dos formatos pasan igual por ffmpeg en el servidor, y a 32 kbps opus comprime
  // voz mejor que AAC, así que lo que cambia es cuánto sube la persona.
  assert.equal(mimeDeGrabacion(() => true), 'audio/webm;codecs=opus')
  // Safari: no graba webm. Sin esta caída, la grabación falla en todos los iPhone.
  assert.equal(mimeDeGrabacion((tipo) => tipo === 'audio/mp4'), 'audio/mp4')
  assert.equal(mimeDeGrabacion((tipo) => tipo.startsWith('audio/webm')), 'audio/webm;codecs=opus')
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

/**
 * Subir un Meeting Paper ya redactado.
 *
 * El segundo parámetro de `validarArchivo` es opcional a propósito: sin él manda la regla de
 * siempre, que es lo que verifican las pruebas de arriba. Estas cubren solo el modo `documento`.
 */
test('validarArchivo en modo documento acepta lo que la API sabe leer', () => {
  assert.equal(validarArchivo({ name: 'acta.pdf', size: 1024 }, 'documento'), null)
  assert.equal(validarArchivo({ name: 'acta.docx', size: 1024 }, 'documento'), null)
  assert.equal(validarArchivo({ name: 'ACTA.MD', size: 1024 }, 'documento'), null, 'la extensión no distingue mayúsculas')
  assert.equal(validarArchivo({ name: 'acta.htm', size: 1024 }, 'documento'), null)

  assert.match(validarArchivo({ name: 'reunion.m4a', size: 1024 }, 'documento') ?? '', /PDF, DOCX/)
  assert.match(validarArchivo({ name: 'acta.pdf', size: 0 }, 'documento') ?? '', /vacío/)
})

// `.doc` es el binario de Word 97 y no se lee sin una librería. El mensaje genérico dejaría a la
// persona mirando lo que para ella es un documento de Word como cualquier otro.
test('un .doc dice qué hacer, no solo que no se puede', () => {
  const mensaje = validarArchivo({ name: 'acta.doc', size: 1024 }, 'documento') ?? ''
  assert.match(mensaje, /\.doc/)
  assert.match(mensaje, /PDF/)
  assert.match(mensaje, /docx/)
})

test('el tope del documento es propio y más bajo que el del audio', () => {
  assert.equal(LIMITE_DOCUMENTO_BYTES, 20 * 1024 * 1024)
  assert.ok(LIMITE_DOCUMENTO_BYTES < LIMITE_BYTES, 'un PDF de 48 MB son miles de páginas, no un acta')

  assert.equal(validarArchivo({ name: 'acta.pdf', size: LIMITE_DOCUMENTO_BYTES }, 'documento'), null, 'el borde exacto entra')
  const grande = validarArchivo({ name: 'acta.pdf', size: LIMITE_DOCUMENTO_BYTES + 1 }, 'documento')
  assert.match(grande ?? '', /20,0 MB/)

  // Sin modo, un PDF de 30 MB ni siquiera llega al tope: no es audio ni imagen.
  assert.match(validarArchivo({ name: 'acta.pdf', size: 30 * 1024 * 1024 }) ?? '', /audio o de imagen/)
})

test('el selector de documento ofrece exactamente lo que la API extrae', () => {
  assert.deepEqual(Object.keys(MIME_DOCUMENTO), ['pdf', 'docx', 'txt', 'md', 'html', 'htm'])
  assert.equal(MIME_DOCUMENTO.doc, undefined, '.doc no se ofrece: se rechaza con su propio mensaje')

  for (const extension of Object.keys(MIME_DOCUMENTO)) {
    assert.ok(ACEPTA.documento.includes(`.${extension}`), `falta .${extension} en el selector`)
  }
  assert.ok(!ACEPTA.documento.includes('.m4a'))
  assert.ok(!ACEPTA.audio.includes('.pdf'))
})


/**
 * La subida de VARIOS archivos.
 *
 * Es lo que cambia el contrato de punta a punta —`File[]` en vez de `File | null`— y lo que decide
 * si una selección sale del navegador entera o a medias. Perder uno en silencio es el fallo caro: la
 * persona eligió cinco fotos de una pizarra, se subieron cuatro y nadie se entera hasta que falta un
 * acuerdo en el acta.
 */
test('sin archivos no hay nada que validar', () => {
  assert.equal(validarArchivos([]), null)
})

test('la selección entera se acepta o se rechaza entera, y el mensaje dice cuál falla', () => {
  const buenos = [
    { name: 'pizarra.jpg', size: 1024 },
    { name: 'cuaderno.png', size: 2048 }
  ]
  assert.equal(validarArchivos(buenos, 'imagen'), null)

  const conUnMalo = [...buenos, { name: 'presupuesto.exe', size: 512 }]
  const problema = validarArchivos(conUnMalo, 'imagen') ?? ''
  assert.match(problema, /presupuesto\.exe/, 'con varios, el mensaje nombra el archivo que falla')
  assert.match(problema, /audio o de imagen/)
})

test('con un solo archivo el mensaje no repite el nombre', () => {
  const problema = validarArchivos([{ name: 'acta.pdf', size: 1024 }]) ?? ''
  assert.match(problema, /audio o de imagen/)
  assert.ok(!problema.startsWith('acta.pdf:'), 'con uno solo el nombre ya está a la vista')
})

test('el tope por archivo sigue mandando dentro de la lista', () => {
  const problema = validarArchivos([
    { name: 'pizarra.jpg', size: 1024 },
    { name: 'reunion.m4a', size: LIMITE_AUDIO_BYTES + 1 }
  ]) ?? ''
  assert.match(problema, /reunion\.m4a/)
  assert.match(problema, /100,0 MB/)
})

// El tope de la suma no es la suma de los topes: lo fija el `post_max_size` de PHP, que descarta el
// cuerpo ENTERO cuando se pasa. Con un archivo nunca se alcanzaba; con diez, sí.
test('la suma tiene su propio tope, y el mensaje dice qué hacer', () => {
  const cuatroAudios = Array.from({ length: 4 }, (_, i) => ({
    name: `reunion-${i}.m4a`,
    size: 40 * 1024 * 1024
  }))
  assert.ok(cuatroAudios.every((a) => validarArchivo(a) === null), 'cada uno entra por separado')

  const problema = validarArchivos(cuatroAudios) ?? ''
  assert.match(problema, /160,0 MB/, 'dice cuánto suman')
  assert.match(problema, /120,0 MB/, 'y cuánto se acepta')
  assert.match(problema, /Saca alguno/)
})

test('el borde exacto de la suma entra, y un byte más no', () => {
  // 100 MB de audio (su tope exacto) + 20 MB de foto son justo los 120 del tope de la suma.
  const justo = [
    { name: 'reunion.m4a', size: LIMITE_AUDIO_BYTES },
    { name: 'pizarra.jpg', size: LIMITE_TOTAL_BYTES - LIMITE_AUDIO_BYTES }
  ]
  assert.ok(justo[1].size < LIMITE_BYTES, 'la foto tiene que seguir entrando por su propio tope')
  assert.equal(validarArchivos(justo), null, 'justo en el tope todavía se manda')

  const unoMas = [justo[0], { name: 'pizarra.jpg', size: justo[1].size + 1 }]
  assert.match(validarArchivos(unoMas) ?? '', /120,0 MB/)
})

test('hay un tope de cantidad, igual al de la API', () => {
  assert.equal(MAXIMO_ARCHIVOS, 10)
  const once = Array.from({ length: 11 }, (_, i) => ({ name: `foto-${i}.jpg`, size: 1024 }))
  assert.match(validarArchivos(once, 'imagen') ?? '', /hasta 10 archivos/)
})

/**
 * Qué se puede pintar como miniatura.
 *
 * No es "qué es una imagen": un `.heic` lo es y ningún navegador de escritorio lo dibuja. Si esto se
 * rompe, la ficha del acta muestra iconos rotos donde deberían estar las fotos de la pizarra, que se
 * lee como "los archivos se corrompieron".
 */
test('el .heic se acepta al subir pero no se pinta: ningún navegador lo dibuja', () => {
  assert.equal(inferirMime('pizarra.heic'), 'image/heic', 'sigue siendo una imagen que se acepta')
  assert.equal(seVeComoImagen('image/heic', 'pizarra.heic'), false)
  assert.equal(seVeComoImagen('', 'pizarra.heic'), false, 'tampoco por extensión')
})

test('manda el tipo real que guardó la API, y la extensión es la reserva', () => {
  assert.equal(seVeComoImagen('image/jpeg', 'pizarra.jpg'), true)
  assert.equal(seVeComoImagen('image/png; charset=binary', 'x.png'), true, 'el parámetro no estorba')
  assert.equal(seVeComoImagen('IMAGE/PNG', 'x.png'), true)

  // Un `.jpg` que en realidad es un audio: manda lo que dijo `finfo`, no la extensión.
  assert.equal(seVeComoImagen('audio/mpeg', 'trampa.jpg'), false)

  // Sin tipo guardado —`finfo` no estaba en el servidor— se cae a la extensión.
  assert.equal(seVeComoImagen(null, 'pizarra.jpeg'), true)
  assert.equal(seVeComoImagen(undefined, 'reunion.m4a'), false)
  assert.equal(seVeComoImagen('', 'sinextension'), false)
})
