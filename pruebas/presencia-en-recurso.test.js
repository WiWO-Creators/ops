/**
 * Pruebas de la lógica pura de la presencia en recursos (`dominio/presencia-en-recurso.ts`): el
 * nombre de la sala, a quién se le oculta su propia presencia, cuánto dura «escribiendo», cuándo se
 * avisa y cómo se redactan las frases.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_ESCRIBIENDO_CADA_MS,
  ESCRIBIENDO_VIGENTE_MS,
  debeAvisarEscribiendo,
  escribiendoVigentes,
  msHastaElProximoVencimiento,
  personasDeIds,
  registrarEscritura,
  salaDeRecurso,
  sinMiPresencia,
  textoDeEscribiendo,
  textoDePresentes
} from '../src/dominio/presencia-en-recurso.ts'

test('la sala de un recurso sigue la forma que acepta el servicio', () => {
  assert.equal(salaDeRecurso('tarea', 12), 'recurso:tarea:12')
  assert.equal(salaDeRecurso('ticket', 3), 'recurso:ticket:3')
  assert.equal(salaDeRecurso('proyecto', 7), 'recurso:proyecto:7')
  assert.throws(() => salaDeRecurso('tarea', 0))
  assert.throws(() => salaDeRecurso('tarea', -2))
  assert.throws(() => salaDeRecurso('tarea', 1.5))
  assert.throws(() => salaDeRecurso('tarea', Number.NaN))
})

test('quien mira no se ve a sí misma; sin saber quién es, se ve a todos', () => {
  assert.deepEqual(sinMiPresencia([3, 7, 9], 7), [3, 9])
  assert.deepEqual(sinMiPresencia([3, 7, 9], null), [3, 7, 9])
  assert.deepEqual(sinMiPresencia([], 7), [])
})

test('«escribiendo» dura 5 s desde el último aviso y se ordena por antigüedad', () => {
  let registro = new Map()

  assert.deepEqual(escribiendoVigentes(registro, 1000), [])
  assert.equal(msHastaElProximoVencimiento(registro, 1000), null)

  registro = registrarEscritura(registro, 4, 1000)
  registro = registrarEscritura(registro, 9, 3000)

  assert.deepEqual(escribiendoVigentes(registro, 3500), [4, 9])
  assert.equal(msHastaElProximoVencimiento(registro, 3500), 1000 + ESCRIBIENDO_VIGENTE_MS - 3500)

  // 4 venció, 9 no; un aviso nuevo de 4 lo devuelve al final.
  assert.deepEqual(escribiendoVigentes(registro, 1000 + ESCRIBIENDO_VIGENTE_MS), [9])
  registro = registrarEscritura(registro, 4, 6000)
  assert.deepEqual(escribiendoVigentes(registro, 6100), [9, 4])
  assert.deepEqual(escribiendoVigentes(registro, 3000 + ESCRIBIENDO_VIGENTE_MS), [4])
  assert.equal(msHastaElProximoVencimiento(registro, 3000 + ESCRIBIENDO_VIGENTE_MS), 6000 + ESCRIBIENDO_VIGENTE_MS - (3000 + ESCRIBIENDO_VIGENTE_MS))
})

test('registrarEscritura no modifica el registro que recibe', () => {
  const original = new Map([[1, 100]])
  const nuevo = registrarEscritura(original, 2, 200)

  assert.equal(original.size, 1)
  assert.equal(nuevo.size, 2)
})

test('el aviso de escribir se limita a uno cada 3 s', () => {
  assert.equal(debeAvisarEscribiendo(null, 10), true)
  assert.equal(debeAvisarEscribiendo(1000, 1000 + AVISO_ESCRIBIENDO_CADA_MS - 1), false)
  assert.equal(debeAvisarEscribiendo(1000, 1000 + AVISO_ESCRIBIENDO_CADA_MS), true)
})

test('los ids se vuelven personas en el mismo orden y lo que el catálogo no conoce se omite', () => {
  const catalogo = [
    { id: 1, full_name: 'Ana Pérez', profile_image_url: null },
    { id: 2, full_name: 'Luis Soto' },
    { id: 3, full_name: 'Marta Díaz', profile_image_url: 'https://x/m.png' }
  ]

  assert.deepEqual(personasDeIds([3, 99, 1], catalogo).map((p) => p.id), [3, 1])
  assert.deepEqual(personasDeIds([], catalogo), [])
  assert.deepEqual(personasDeIds([5], []), [])
})

test('frase de quién responde: una, dos y varias personas; nunca texto sin nombre', () => {
  assert.equal(textoDeEscribiendo([]), '')
  assert.equal(textoDeEscribiendo(['Ana Pérez']), 'Ana está respondiendo…')
  assert.equal(textoDeEscribiendo(['Ana Pérez', 'Luis Soto']), 'Ana y Luis están respondiendo…')
  assert.equal(textoDeEscribiendo(['Ana Pérez', 'Luis Soto', 'Marta Díaz']), 'Ana, Luis y 1 más están respondiendo…')
  assert.equal(textoDeEscribiendo(['Ana', 'Luis', 'Marta', 'Juan']), 'Ana, Luis y 2 más están respondiendo…')
  assert.equal(textoDeEscribiendo(['  ', '']), '')
})

test('frase de quiénes más miran: singular, plural y nada', () => {
  assert.equal(textoDePresentes(0), '')
  assert.equal(textoDePresentes(-1), '')
  assert.equal(textoDePresentes(1), '1 persona más está viendo esto')
  assert.equal(textoDePresentes(3), '3 personas más están viendo esto')
})
