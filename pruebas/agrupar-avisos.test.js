import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparAvisos } from '../src/lib/agrupar-avisos.ts'

test('avisos seguidos llegan una sola vez, tras la espera del ultimo', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let llamadas = 0
  const aviso = agruparAvisos(() => { llamadas++ }, 300)

  aviso.disparar()
  t.mock.timers.tick(200)
  aviso.disparar()
  t.mock.timers.tick(200)
  assert.equal(llamadas, 0, 'cada aviso reinicia la espera')
  t.mock.timers.tick(100)
  assert.equal(llamadas, 1)
  t.mock.timers.tick(1000)
  assert.equal(llamadas, 1)
})

test('un aviso posterior a la llamada vuelve a llamar', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let llamadas = 0
  const aviso = agruparAvisos(() => { llamadas++ }, 300)

  aviso.disparar()
  t.mock.timers.tick(300)
  aviso.disparar()
  t.mock.timers.tick(300)
  assert.equal(llamadas, 2)
})

test('cancelar descarta el aviso pendiente y es inofensivo sin pendiente', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let llamadas = 0
  const aviso = agruparAvisos(() => { llamadas++ }, 300)

  aviso.cancelar()
  aviso.disparar()
  aviso.cancelar()
  t.mock.timers.tick(1000)
  assert.equal(llamadas, 0)
})
