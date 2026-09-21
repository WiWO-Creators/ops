/**
 * Pruebas del codigo que se muestra cuando una pantalla no se pudo dibujar.
 *
 * Lo que importa aca es la pantalla de acceso: ahi no hay sesion, asi que no hay incidente ni codigo
 * en el aviso flotante, y el `digest` de Next es lo unico que la persona puede dictarle a soporte.
 * Si se pierde o si se pinta cualquier cosa en su lugar, el reporte vuelve a ser «no funciona».
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoDeFallo, detalleConCodigoDeFallo } from '../src/lib/fallo-de-pantalla.ts'

test('el digest de produccion es el codigo', () => {
  assert.equal(codigoDeFallo({ digest: '2493474559' }), '2493474559')
})

test('sin digest no hay codigo: en desarrollo Next no lo pone', () => {
  assert.equal(codigoDeFallo({}), null)
  assert.equal(codigoDeFallo({ digest: undefined }), null)
})

test('un digest en blanco no es un codigo', () => {
  assert.equal(codigoDeFallo({ digest: '' }), null)
  assert.equal(codigoDeFallo({ digest: '   ' }), null)
})

test('el digest se limpia de espacios antes de mostrarlo', () => {
  assert.equal(codigoDeFallo({ digest: '  4f75456f\n' }), '4f75456f')
})

test('lo que no tiene forma de digest no se pinta: la frase se muestra tal cual', () => {
  assert.equal(codigoDeFallo({ digest: 'Error: /var/www/app.php:307' }), null)
  assert.equal(codigoDeFallo({ digest: 'a b' }), null)
  assert.equal(codigoDeFallo({ digest: '1'.repeat(65) }), null)
})

test('la frase lleva el codigo y cierra con punto para que soporte lo lea entero', () => {
  assert.equal(
    detalleConCodigoDeFallo('No pudimos mostrar la pantalla.', 'ab12cd34'),
    'No pudimos mostrar la pantalla. Si vuelve a pasar, repórtalo con el código ab12cd34.'
  )
})

test('sin codigo la frase no promete uno', () => {
  const detalle = 'No pudimos mostrar la pantalla.'

  assert.equal(detalleConCodigoDeFallo(detalle, null), detalle)
})
