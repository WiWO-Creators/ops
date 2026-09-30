import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarAdjuntos, mensajeDeAdjuntosFallidos, MAXIMO_ADJUNTOS_EN_ALTA } from '../src/dominio/adjuntos-alta.ts'

const archivo = (name, size = 100, lastModified = 1) => ({ name, size, lastModified })

test('suma archivos nuevos a los ya elegidos', () => {
  const { lista, rechazados } = agregarAdjuntos([archivo('a.docx')], [archivo('b.png')])

  assert.deepEqual(lista.map((f) => f.name), ['a.docx', 'b.png'])
  assert.deepEqual(rechazados, [])
})

test('elegir dos veces el mismo archivo no lo duplica', () => {
  const { lista } = agregarAdjuntos([archivo('a.docx')], [archivo('a.docx')])

  assert.equal(lista.length, 1)
})

test('un nombre vacío se rechaza con su motivo', () => {
  const { lista, rechazados } = agregarAdjuntos([], [archivo('  ')])

  assert.equal(lista.length, 0)
  assert.equal(rechazados.length, 1)
})

test('lo que excede el tope se rechaza y lo anterior se conserva', () => {
  const llenos = Array.from({ length: MAXIMO_ADJUNTOS_EN_ALTA }, (_, i) => archivo(`f${i}.pdf`))
  const { lista, rechazados } = agregarAdjuntos(llenos, [archivo('extra.pdf')])

  assert.equal(lista.length, MAXIMO_ADJUNTOS_EN_ALTA)
  assert.match(rechazados[0], /extra\.pdf/)
})

test('sin fallos no hay mensaje; con fallos los nombra', () => {
  assert.equal(mensajeDeAdjuntosFallidos('#5', []), null)
  assert.match(mensajeDeAdjuntosFallidos('#5', ['«a.exe»: extensión no permitida']), /#5.*un archivo.*a\.exe/)
})
