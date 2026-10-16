/**
 * Pruebas del aviso de escritura del Orbe (`dominio/orbe-escritura.ts`), de la lectura de `?acta=`
 * que decide el `acta_id` que viaja al crear (`dominio/pantalla.ts`) y del manejo del conflicto de
 * versión al corregir un acta (`dominio/acta-concurrencia.ts`).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actaAbiertaDeUrl, idPositivoDeTexto } from '../src/dominio/pantalla.ts'
import { contextoDeOrbe } from '../src/dominio/orbe-contexto.ts'
import { escrituraAlcanzaAlActa, pudoEscribir } from '../src/dominio/orbe-escritura.ts'
import {
  debeRevalidarActaAbierta,
  debeRevalidarListaDeActas,
  esConflictoDeRevision,
  hayCambioAjeno,
  textoDeCambioAjeno
} from '../src/dominio/acta-concurrencia.ts'

test('?acta= solo cuenta si es un entero positivo', () => {
  assert.equal(idPositivoDeTexto('12'), 12)
  assert.equal(idPositivoDeTexto(' 7 '), 7)
  for (const malo of [null, '', '  ', 'nuevo', 'transcribir', 'abc', '-3', '0', '1.5', '1e3', '0x10', '12abc', '9007199254740993']) {
    assert.equal(idPositivoDeTexto(malo), null, `«${String(malo)}» no es un id`)
  }
})

test('el acta de la URL exige la pestaña de actas de un proyecto', () => {
  assert.equal(actaAbiertaDeUrl('/proyectos/3', new URLSearchParams('tab=actas&acta=5')), 5)
  assert.equal(actaAbiertaDeUrl('/espacios/3', new URLSearchParams('tab=actas&acta=5')), 5)
  assert.equal(actaAbiertaDeUrl('/proyectos/3', new URLSearchParams('tab=tareas&acta=5')), null)
  assert.equal(actaAbiertaDeUrl('/tareas', new URLSearchParams('tab=actas&acta=5')), null)
})

test('con ?acta=nuevo, transcribir o basura no viaja acta_id', () => {
  for (const valor of ['nuevo', 'transcribir', 'abc', '-1', '0', '']) {
    const contexto = contextoDeOrbe('/proyectos/3', new URLSearchParams(`tab=actas&acta=${valor}`), null)

    assert.equal(contexto.actaId, null, `acta=${valor}`)
    assert.equal(contexto.etiqueta, 'Proyecto')
  }
})

test('una ejecución solo avisa escritura si algún paso no es de lectura', () => {
  const paso = riesgo => ({ id: 'p', descripcion: 'x', estado: 'completado', ...(riesgo === undefined ? {} : { riesgo }) })

  assert.equal(pudoEscribir({}), false)
  assert.equal(pudoEscribir({ plan: { id: 'a', version: '1', resumen: '', pasos: [] } }), false)
  assert.equal(pudoEscribir({ plan: { id: 'a', version: '1', resumen: '', pasos: [paso('lectura'), paso('lectura')] } }), false)
  assert.equal(pudoEscribir({ plan: { id: 'a', version: '1', resumen: '', pasos: [paso('lectura'), paso('escritura')] } }), true)
  assert.equal(pudoEscribir({ plan: { id: 'a', version: '1', resumen: '', pasos: [paso('destructiva')] } }), true)
  assert.equal(pudoEscribir({ plan: { id: 'a', version: '1', resumen: '', pasos: [paso(undefined)] } }), true)
})

test('el aviso del Orbe alcanza al acta abierta solo si coincide o no trae acta', () => {
  assert.equal(escrituraAlcanzaAlActa({ actaId: 5 }, 5), true)
  assert.equal(escrituraAlcanzaAlActa({ actaId: null }, 5), true)
  assert.equal(escrituraAlcanzaAlActa({ actaId: 6 }, 5), false)
  for (const malo of [null, undefined, 'x', {}, { actaId: '5' }]) {
    assert.equal(escrituraAlcanzaAlActa(malo, 5), false)
  }
})

test('un 409 con revision es el conflicto de versión; sin revision o con otro código, no', () => {
  assert.equal(esConflictoDeRevision(409, true), true)
  assert.equal(esConflictoDeRevision(409, false), false)
  assert.equal(esConflictoDeRevision(422, true), false)
  assert.equal(esConflictoDeRevision(undefined, true), false)
})

test('el aviso de cambio ajeno aparece solo corrigiendo el original y con la versión distinta', () => {
  const base = { editando: true, esTraduccion: false, conflicto: false, revisionBase: 'v1', revisionActual: 'v1' }

  assert.equal(hayCambioAjeno(base), false)
  assert.equal(hayCambioAjeno({ ...base, revisionActual: 'v2' }), true)
  assert.equal(hayCambioAjeno({ ...base, conflicto: true }), true)
  assert.equal(hayCambioAjeno({ ...base, editando: false, revisionActual: 'v2' }), false)
  assert.equal(hayCambioAjeno({ ...base, esTraduccion: true, revisionActual: 'v2', conflicto: true }), false)
  assert.equal(hayCambioAjeno({ ...base, revisionBase: null, revisionActual: 'v2' }), false)
  assert.equal(hayCambioAjeno({ ...base, revisionActual: null }), false)
})

test('el texto del conflicto nombra al asistente, al Meeting Paper y que el texto queda en el editor', () => {
  const guardando = textoDeCambioAjeno(true)
  const corrigiendo = textoDeCambioAjeno(false)

  for (const texto of [guardando, corrigiendo]) {
    assert.match(texto, /Thinking Orb u otra persona/)
    assert.match(texto, /Meeting Paper/)
    assert.match(texto, /Tu texto sigue en el editor/)
  }
  assert.match(guardando, /no se guardó nada/)
  assert.doesNotMatch(corrigiendo, /no se guardó/)
})

test('el aviso en vivo `acta` revalida la lista solo si es del Espacio (o no dice cuál)', () => {
  assert.equal(debeRevalidarListaDeActas({ id: 5, espacio_id: 3 }, 3), true)
  assert.equal(debeRevalidarListaDeActas({ id: null, espacio_id: 3 }, 3), true)
  assert.equal(debeRevalidarListaDeActas({ id: 5, espacio_id: null }, 3), true)
  assert.equal(debeRevalidarListaDeActas({ id: 5, espacio_id: 4 }, 3), false)
})

test('el aviso en vivo `acta` revalida el detalle abierto solo si es ese acta y no se edita en conjunto', () => {
  const pantalla = { espacioId: 3, actaAbiertaId: 5, conjunta: false }

  assert.equal(debeRevalidarActaAbierta({ id: 5, espacio_id: 3 }, pantalla), true)
  assert.equal(debeRevalidarActaAbierta({ id: null, espacio_id: 3 }, pantalla), true, 'sin id puede ser esta')
  assert.equal(debeRevalidarActaAbierta({ id: 6, espacio_id: 3 }, pantalla), false, 'otra acta del Espacio')
  assert.equal(debeRevalidarActaAbierta({ id: 5, espacio_id: 4 }, pantalla), false, 'otro Espacio')
  assert.equal(debeRevalidarActaAbierta({ id: 5, espacio_id: 3 }, { ...pantalla, conjunta: true }), false, 'el servicio ya fusiona')
  assert.equal(debeRevalidarActaAbierta({ id: 5, espacio_id: 3 }, { ...pantalla, actaAbiertaId: null }), false, 'sin detalle abierto')
})

test('con el editor normal abierto el aviso revalida y la revisión nueva enciende el aviso de cambio ajeno', () => {
  const cambio = { id: 5, espacio_id: 3 }

  assert.equal(debeRevalidarActaAbierta(cambio, { espacioId: 3, actaAbiertaId: 5, conjunta: false }), true)
  assert.equal(hayCambioAjeno({
    editando: true,
    esTraduccion: false,
    conflicto: false,
    revisionBase: '2026-10-16 10:00:00',
    revisionActual: '2026-10-16 10:05:00'
  }), true)
})
