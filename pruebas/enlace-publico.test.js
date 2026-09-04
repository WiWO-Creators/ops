/**
 * Pruebas del enlace publico de una Tarea.
 *
 * Cubren las dos cosas que fallan en silencio: una URL mal armada se copia, se manda por chat y
 * recien revienta del otro lado; y un `percent` en `null` mostrado como cero convierte "esta Tarea no
 * tiene lista de control" en "no se hizo nada", que es lo contrario de lo que pasa.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avancePublico, urlDeEnlacePublico } from '../src/lib/enlace-publico.ts'

const TOKEN = 'a1b2c3d4e5f6'

test('arma la URL absoluta a partir del origen y el token', () => {
  assert.equal(
    urlDeEnlacePublico('https://ops.wiwo.me', TOKEN),
    `https://ops.wiwo.me/tarea/${TOKEN}`
  )
})

test('recorta las barras finales del origen', () => {
  assert.equal(
    urlDeEnlacePublico('https://ops.wiwo.me///', TOKEN),
    `https://ops.wiwo.me/tarea/${TOKEN}`
  )
})

test('codifica el token en vez de pegarlo crudo', () => {
  assert.equal(urlDeEnlacePublico('https://ops.wiwo.me', 'a/b c'), 'https://ops.wiwo.me/tarea/a%2Fb%20c')
})

test('sin origen o sin token no hay URL, y no una a medias', () => {
  assert.equal(urlDeEnlacePublico('', TOKEN), null)
  assert.equal(urlDeEnlacePublico('   ', TOKEN), null)
  assert.equal(urlDeEnlacePublico('https://ops.wiwo.me', ''), null)
  assert.equal(urlDeEnlacePublico('https://ops.wiwo.me', '   '), null)
})

test('con lista de control muestra el porcentaje y cuantos items van', () => {
  const avance = avancePublico({ checklist_total: 4, checklist_done: 1, percent: 25 })

  assert.equal(avance.porcentaje, 25)
  assert.equal(avance.detalle, '1 de 4 ítems de la lista de control')
})

test('un solo item se dice en singular', () => {
  const avance = avancePublico({ checklist_total: 1, checklist_done: 0, percent: 0 })

  assert.equal(avance.detalle, '0 de 1 ítem de la lista de control')
})

test('sin lista de control y sin cerrar, el porcentaje es null y no cero', () => {
  const avance = avancePublico({ checklist_total: 0, checklist_done: 0, percent: null })

  assert.equal(avance.porcentaje, null)
  assert.equal(avance.detalle, 'Sin lista de control')
})

test('sin lista de control pero completada, el 100 se muestra y se explica', () => {
  const avance = avancePublico({ checklist_total: 0, checklist_done: 0, percent: 100 })

  assert.equal(avance.porcentaje, 100)
  assert.equal(avance.detalle, 'Sin lista de control · marcada como terminada')
})
