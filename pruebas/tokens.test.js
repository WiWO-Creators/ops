/**
 * Pruebas del armado de la sesion a partir de la respuesta de la API.
 *
 * Existen por un bug real: `/auth/login` devuelve el bloque `staff` y `/auth/refresh` **no**. El
 * codigo leia `par.staff.id` en los dos casos, asi que todo refresco lanzaba, el BFF lo interpretaba
 * como sesion vencida y expulsaba a la persona. Sin esta prueba, el mismo error vuelve la proxima vez
 * que alguien toque el refresco.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sesionDesdeTokens } from '../src/datos/sobre-sesion.ts'

const AHORA = 1_700_000_000_000 // epoch ms

test('el vencimiento relativo se guarda como epoch absoluto', () => {
  const sesion = sesionDesdeTokens(
    { access_token: 'acc', expires_in: 3600, refresh_token: 'ref', refresh_expires_in: 2592000 },
    7,
    AHORA
  )

  assert.equal(sesion.venceEn, AHORA / 1000 + 3600)
  assert.equal(sesion.acceso, 'acc')
  assert.equal(sesion.refresco, 'ref')
})

test('la respuesta de refresh no trae staff y aun asi arma la sesion', () => {
  const respuestaDeRefresh = {
    access_token: 'acc2',
    expires_in: 3600,
    refresh_token: 'ref2',
    refresh_expires_in: 2592000
  }

  const sesion = sesionDesdeTokens(respuestaDeRefresh, 42, AHORA)

  assert.equal(sesion.staffId, 42, 'el staffId se conserva del que ya tenia la sesion')
})

test('el staffId que se guarda es el que se pasa, no el del bloque staff', () => {
  const conStaff = {
    access_token: 'a',
    expires_in: 60,
    refresh_token: 'r',
    refresh_expires_in: 60,
    staff: { id: 99 }
  }

  assert.equal(sesionDesdeTokens(conStaff, 7, AHORA).staffId, 7)
})
