import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDIOMAS,
  IDIOMAS_EN_ORDEN,
  esIdiomaTraducible,
  idiomaDelActa
} from '../src/dominio/idiomas-acta.ts'
import { fechaLarga, nombreDeArchivo } from '../src/dominio/exportar-acta.ts'

/**
 * El Meeting Paper en tres idiomas.
 *
 * Lo que se prueba acá es lo que decide con qué cara sale un documento que se le manda a un cliente
 * de otro país: la tipografía que lo puede escribir, el nombre con el que baja y cómo se lee la
 * fecha. Los tres fallan en silencio —un PDF de cuadritos vacíos se genera sin error, un archivo
 * que pisa a otro no avisa— y por eso están acá.
 */

test('el español es el original y los otros dos no', () => {
  assert.equal(IDIOMAS.es.esOriginal, true)
  assert.equal(IDIOMAS.en.esOriginal, false)
  assert.equal(IDIOMAS.zh.esOriginal, false)

  // Lo que decide si el acta se pide a `traducciones/{idioma}` o sale de `acta.content`.
  assert.equal(esIdiomaTraducible('es'), false)
  assert.equal(esIdiomaTraducible('en'), true)
  assert.equal(esIdiomaTraducible('zh'), true)
})

test('solo el chino pide tipografía con glifos han', () => {
  // Es lo único que separa un PDF legible de uno lleno de cuadritos vacíos.
  assert.equal(IDIOMAS.zh.necesitaCjk, true)
  assert.equal(IDIOMAS.es.necesitaCjk, false)
  assert.equal(IDIOMAS.en.necesitaCjk, false)
})

test('el chino se declara por escritura y no por país', () => {
  // `zh-Hans` y no `zh-CN`: lo que el navegador necesita para elegir la fuente es la escritura. Con
  // la etiqueta equivocada puede pintar la variante japonesa de un carácter unificado.
  assert.equal(IDIOMAS.zh.etiquetaHtml, 'zh-Hans')
  assert.equal(IDIOMAS.zh.locale, 'zh-CN')
})

test('un código desconocido cae al original en vez de lanzar', () => {
  // El código puede venir de una URL editada a mano: ahí lo correcto es mostrar el acta.
  assert.equal(idiomaDelActa('fr').codigo, 'es')
  assert.equal(idiomaDelActa(null).codigo, 'es')
  assert.equal(idiomaDelActa(undefined).codigo, 'es')
  assert.equal(idiomaDelActa('zh').codigo, 'zh')
})

test('el selector ofrece el original primero', () => {
  assert.deepEqual(IDIOMAS_EN_ORDEN.map((idioma) => idioma.codigo), ['es', 'en', 'zh'])
})

test('el archivo traducido no pisa al original', () => {
  const meta = {
    titulo: 'Kickoff con Cliente',
    cliente: 'Acme',
    fecha: '2026-09-11',
    lugar: 'Oficina',
    autor: 'Ana'
  }

  // Sin idioma y con español dan el mismo nombre: las actas ya guardadas no se renombran.
  assert.equal(nombreDeArchivo(meta, 'pdf'), '2026-09-11-Kickoff-con-Cliente.pdf')
  assert.equal(
    nombreDeArchivo({ ...meta, idioma: IDIOMAS.es }, 'pdf'),
    '2026-09-11-Kickoff-con-Cliente.pdf'
  )

  assert.equal(
    nombreDeArchivo({ ...meta, idioma: IDIOMAS.en }, 'pdf'),
    '2026-09-11-Kickoff-con-Cliente-en.pdf'
  )
  assert.equal(
    nombreDeArchivo({ ...meta, idioma: IDIOMAS.zh }, 'docx'),
    '2026-09-11-Kickoff-con-Cliente-zh.docx'
  )
})

test('un título en hanzi baja con nombre latino y su sufijo', () => {
  // El filtro de `nombreDeArchivo` borra los hanzi enteros y el nombre cae al genérico. Es a
  // propósito: un archivo con caracteres CJK en el nombre viaja mal por correo, Drive y Windows.
  const meta = {
    titulo: '会议纪要 - 启动会',
    cliente: '',
    fecha: '2026-09-11',
    lugar: '',
    autor: '',
    idioma: IDIOMAS.zh
  }

  assert.equal(nombreDeArchivo(meta, 'pdf'), '2026-09-11-meeting-paper-zh.pdf')
})

test('la fecha larga se escribe en el idioma del documento', () => {
  // La fecha viaja como dato y fuera del HTML, así que el traductor no la ve: se formatea acá o
  // sale en español dentro de un acta en chino.
  assert.match(fechaLarga('2026-09-11'), /septiembre/)
  assert.match(fechaLarga('2026-09-11', IDIOMAS.en.locale), /September/)
  assert.match(fechaLarga('2026-09-11', IDIOMAS.zh.locale), /9月11日/)
})

test('la fecha sigue sin retroceder un día en ninguna locale', () => {
  // Se arma en UTC a mano: `new Date('2026-09-11')` en Santiago daba el 10.
  assert.match(fechaLarga('2026-09-11', IDIOMAS.en.locale), /11/)
  assert.match(fechaLarga('2026-09-11', IDIOMAS.zh.locale), /2026年9月11日/)
})

test('una fecha vacía o rota no rompe ningún idioma', () => {
  for (const idioma of IDIOMAS_EN_ORDEN) {
    assert.equal(fechaLarga(null, idioma.locale), '')
    assert.equal(fechaLarga('', idioma.locale), '')
    assert.equal(fechaLarga('no-es-fecha', idioma.locale), '')
    assert.equal(fechaLarga('2026-09', idioma.locale), '')
  }
})

test('el Word en chino pide la fuente china sólo para los hanzi', async () => {
  // OOXML separa `ascii`/`hAnsi` de `eastAsia`, así que el acta en chino conserva la letra de la
  // marca en las cifras y los nombres propios —lo único que el traductor deja en latín— y usa Noto
  // Sans SC donde hay hanzi. Sin esto Word sustituye por su cuenta y puede elegir la japonesa.
  const { ESTILO_DOCX, parrafosDeBloques } = await import('../src/dominio/exportar-docx.ts')
  const { temaDeMarca } = await import('../src/dominio/marcas-acta.ts')
  const tema = temaDeMarca('wiwo')
  const bloques = [{ tipo: 'parrafo', texto: [{ texto: '批准了 USD 48.500', negrita: false, cursiva: false, subrayado: false }] }]

  const enEspanol = parrafosDeBloques(bloques, tema, IDIOMAS.es)
  const enChino = parrafosDeBloques(bloques, tema, IDIOMAS.zh)

  // La firma quedó compatible: sin idioma se comporta como antes de que existieran las traducciones.
  assert.deepEqual(
    JSON.stringify(parrafosDeBloques(bloques, tema)),
    JSON.stringify(enEspanol)
  )
  assert.notEqual(JSON.stringify(enChino), JSON.stringify(enEspanol))
  assert.equal(typeof ESTILO_DOCX.wiwo.fuente, 'string')
})
