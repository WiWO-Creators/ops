/**
 * Pruebas de las reglas puras de las imagenes del texto enriquecido (`dominio/imagenes-ricas.ts`).
 *
 * Lo que no puede fallar: que el `src` propio sea exactamente el que acepta el saneador de la API, que
 * ningun otro pase, y que solo se haga cargo de lo que de verdad es una imagen subible.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  atributoAcceptDeImagenes,
  destinoDeImagenRica,
  esImagenSubible,
  esSrcDeImagenRica,
  MAXIMO_BYTES_DE_IMAGEN_RICA,
  motivoParaNoSubirImagen,
  nombreDeCaptura,
  separarImagenes,
  srcDeImagenRica,
  textoAlternativoDe
} from '../src/dominio/imagenes-ricas.ts'

const CODIGO = '0123456789abcdef'.repeat(2)

test('esSrcDeImagenRica: solo la ruta propia con 32 hex exactos', () => {
  assert.equal(esSrcDeImagenRica(`/api/bff/files/texto-rico/${CODIGO}`), true)

  for (const malo of [
    null,
    undefined,
    '',
    `/api/bff/files/texto-rico/${CODIGO}\n`,
    `/api/bff/files/texto-rico/${CODIGO} `,
    `/api/bff/files/texto-rico/${CODIGO}.png`,
    `/api/bff/files/texto-rico/${CODIGO.slice(1)}`,
    `/api/bff/files/texto-rico/${CODIGO}0`,
    `/api/bff/files/texto-rico/${CODIGO.toUpperCase()}`,
    `api/bff/files/texto-rico/${CODIGO}`,
    `https://x.cl/api/bff/files/texto-rico/${CODIGO}`,
    `/api/v1/files/texto-rico/${CODIGO}`,
    'data:image/png;base64,AAAA'
  ]) {
    assert.equal(esSrcDeImagenRica(malo), false, String(malo))
  }
})

test('srcDeImagenRica arma el src desde el codigo y rechaza lo que no lo es', () => {
  assert.equal(srcDeImagenRica(CODIGO), `/api/bff/files/texto-rico/${CODIGO}`)
  assert.equal(srcDeImagenRica('../../me'), null)
  assert.equal(srcDeImagenRica(`${CODIGO}?x=1`), null)
  assert.equal(srcDeImagenRica(''), null)
})

test('esImagenSubible: por tipo declarado y, si no hay, por extension', () => {
  assert.equal(esImagenSubible({ name: 'image.png', type: 'image/png' }), true)
  assert.equal(esImagenSubible({ name: 'foto.JPG', type: 'image/jpeg' }), true)
  assert.equal(esImagenSubible({ name: 'a.gif', type: 'image/gif' }), true)
  assert.equal(esImagenSubible({ name: 'a.webp', type: 'image/webp' }), true)
  assert.equal(esImagenSubible({ name: 'sin-tipo.png', type: '' }), true)
  assert.equal(esImagenSubible({ name: 'a.svg', type: 'image/svg+xml' }), false)
  assert.equal(esImagenSubible({ name: 'a.bmp', type: 'image/bmp' }), false)
  assert.equal(esImagenSubible({ name: 'a.pdf', type: 'application/pdf' }), false)
  assert.equal(esImagenSubible({ name: 'a.png', type: 'text/html' }), false, 'el tipo declarado manda sobre la extension')
  assert.equal(esImagenSubible({ name: 'sin-extension', type: '' }), false)
})

test('motivoParaNoSubirImagen: vacio, tamano y formato', () => {
  assert.equal(motivoParaNoSubirImagen({ name: 'a.png', type: 'image/png', size: 1000 }), null)
  assert.match(motivoParaNoSubirImagen({ name: 'a.png', type: 'image/png', size: 0 }) ?? '', /vacía/)
  assert.match(motivoParaNoSubirImagen({ name: 'a.png', type: 'image/png', size: MAXIMO_BYTES_DE_IMAGEN_RICA + 1 }) ?? '', /5 MB/)
  assert.equal(motivoParaNoSubirImagen({ name: 'a.png', type: 'image/png', size: MAXIMO_BYTES_DE_IMAGEN_RICA }), null, 'justo en el tope pasa')
  assert.match(motivoParaNoSubirImagen({ name: 'a.svg', type: 'image/svg+xml', size: 10 }) ?? '', /PNG, JPG, GIF o WebP/)
  assert.match(motivoParaNoSubirImagen({ name: '', type: 'image/png', size: 0 }) ?? '', /^La imagen/)
})

test('nombreDeCaptura: renombra lo pegado, respeta un nombre propio', () => {
  const ahora = new Date(2026, 9, 14, 9, 5, 7)

  assert.equal(nombreDeCaptura({ name: 'image.png', type: 'image/png' }, ahora), 'captura-20261014-090507.png')
  assert.equal(nombreDeCaptura({ name: 'image.jpg', type: 'image/jpeg' }, ahora), 'captura-20261014-090507.jpg')
  assert.equal(nombreDeCaptura({ name: '', type: 'image/webp' }, ahora), 'captura-20261014-090507.webp')
  assert.equal(nombreDeCaptura({ name: 'logo.png', type: 'image/png' }, ahora), 'logo.png')
})

test('textoAlternativoDe: sin extension, sin control, acotado', () => {
  assert.equal(textoAlternativoDe('captura-1.png'), 'captura-1')
  assert.equal(textoAlternativoDe('a\nb.png'), 'a b')
  assert.equal(textoAlternativoDe(`${'x'.repeat(300)}.png`).length, 200)
})

test('separarImagenes: se queda con las imagenes y cuenta el resto', () => {
  const archivos = [
    { name: 'a.png', type: 'image/png' },
    { name: 'b.pdf', type: 'application/pdf' },
    { name: 'c.gif', type: 'image/gif' }
  ]
  const { imagenes, otros } = separarImagenes(archivos)

  assert.deepEqual(imagenes.map((a) => a.name), ['a.png', 'c.gif'])
  assert.deepEqual(otros.map((a) => a.name), ['b.pdf'])
})

test('destinoDeImagenRica: ruta segun quien sube y Espacio opcional solo en el panel', () => {
  assert.deepEqual(destinoDeImagenRica(false, 12), { ruta: 'imagenes-texto', proyecto: '12' })
  assert.deepEqual(destinoDeImagenRica(false, null), { ruta: 'imagenes-texto', proyecto: null })
  assert.deepEqual(destinoDeImagenRica(true, 12), { ruta: 'portal/imagenes-texto', proyecto: '12' })
  assert.deepEqual(destinoDeImagenRica(true, null), { ruta: 'portal/imagenes-texto', proyecto: null })
  assert.equal(destinoDeImagenRica(false, 0).proyecto, null)
  assert.equal(destinoDeImagenRica(false, 1.5).proyecto, null)
})

test('atributoAcceptDeImagenes lista las cinco extensiones', () => {
  assert.equal(atributoAcceptDeImagenes(), '.png,.jpg,.jpeg,.gif,.webp')
})
