/**
 * Cuando el portal vuelve a pedir sus paginas al servidor.
 *
 * Lo que se prueba es lo que el cliente notaria: que los datos no queden como una foto de la
 * apertura, pero que el refresco nunca le pise lo que esta escribiendo ni se apile.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUSENCIA_MINIMA_PORTAL_MS,
  debeRefrescarPortal,
  esElementoDeEdicion,
  INTERVALO_REFRESCO_PORTAL_MS
} from '../src/datos/refresco-portal.ts'

const AHORA = 1_000_000

/** Un estado que, sin tocar nada, permite refrescar tras `hace` milisegundos. */
function estado (hace, cambios = {}) {
  return { oculto: false, ultimoRefrescoMs: AHORA - hace, ahoraMs: AHORA, editando: false, enVuelo: false, ...cambios }
}

test('el intervalo refresca solo cuando paso un minuto desde el ultimo', () => {
  assert.equal(debeRefrescarPortal(estado(INTERVALO_REFRESCO_PORTAL_MS - 1), 'intervalo'), false)
  assert.equal(debeRefrescarPortal(estado(INTERVALO_REFRESCO_PORTAL_MS), 'intervalo'), true)
})

test('volver a la pestaña refresca solo si estuvo fuera mas de 30 segundos', () => {
  assert.equal(debeRefrescarPortal(estado(AUSENCIA_MINIMA_PORTAL_MS), 'regreso'), false)
  assert.equal(debeRefrescarPortal(estado(AUSENCIA_MINIMA_PORTAL_MS + 1), 'regreso'), true)
})

test('una escritura confirmada refresca de inmediato', () => {
  assert.equal(debeRefrescarPortal(estado(0), 'escritura'), true)
})

test('nunca refresca con la pestaña oculta', () => {
  for (const motivo of ['intervalo', 'regreso', 'escritura']) {
    assert.equal(debeRefrescarPortal(estado(10 * INTERVALO_REFRESCO_PORTAL_MS, { oculto: true }), motivo), false)
  }
})

test('no apila un refresco sobre otro en vuelo', () => {
  for (const motivo of ['intervalo', 'regreso', 'escritura']) {
    assert.equal(debeRefrescarPortal(estado(10 * INTERVALO_REFRESCO_PORTAL_MS, { enVuelo: true }), motivo), false)
  }
})

test('no refresca mientras la persona escribe', () => {
  for (const motivo of ['intervalo', 'regreso', 'escritura']) {
    assert.equal(debeRefrescarPortal(estado(10 * INTERVALO_REFRESCO_PORTAL_MS, { editando: true }), motivo), false)
  }
})

test('reconoce los campos de edicion y nada mas', () => {
  assert.equal(esElementoDeEdicion(null), false)
  assert.equal(esElementoDeEdicion({ tagName: 'TEXTAREA' }), true)
  assert.equal(esElementoDeEdicion({ tagName: 'input' }), true)
  assert.equal(esElementoDeEdicion({ tagName: 'SELECT' }), true)
  assert.equal(esElementoDeEdicion({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(esElementoDeEdicion({ tagName: 'BUTTON' }), false)
  assert.equal(esElementoDeEdicion({ tagName: 'BODY', isContentEditable: false }), false)
})
