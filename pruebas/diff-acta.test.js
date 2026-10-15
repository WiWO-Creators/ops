/**
 * Pruebas del diff del Meeting Paper y del guion con que se reproduce cuando el Thinking Orb lo edita.
 *
 * Todo es lógica pura: se prueba el HTML a bloques, el LCS de bloques, el diff por palabras y el
 * guion (tope de bloques animados, duración acotada, resumen). La capa que anima el DOM no se prueba
 * acá: necesita un navegador.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITES_REPRODUCCION,
  armarGuion,
  bloquesDeActa,
  diferenciasDePalabras,
  diferenciasDeUnidades,
  duracionDePaso,
  resumenDeCambios,
  unidadesDeBloques
} from '../src/dominio/diff-acta.ts'

/** Diff de dos HTML a nivel de unidades, sin pasar por el guion. */
function diff (antes, despues) {
  return diferenciasDeUnidades(unidadesDeBloques(bloquesDeActa(antes)), unidadesDeBloques(bloquesDeActa(despues)))
}

/** Los tipos de cambio en orden, para leer el resultado de un vistazo. */
const tipos = (cambios) => cambios.map((c) => c.tipo)

test('bloquesDeActa lee títulos, párrafos, listas y citas con su texto', () => {
  const bloques = bloquesDeActa(
    '<h1>Acta</h1><h2>Temas</h2><p>Hola <strong>mundo</strong></p>'
    + '<ul><li>Uno</li><li>Dos</li></ul><ol><li>Primero</li></ol><blockquote>Cita</blockquote>'
  )

  assert.deepEqual(bloques.map((b) => b.etiqueta), ['h1', 'h2', 'p', 'ul', 'ol', 'blockquote'])
  assert.equal(bloques[2].texto, 'Hola mundo')
  assert.deepEqual(bloques[3].items, ['Uno', 'Dos'])
  assert.equal(bloques[3].texto, 'Uno\nDos')
  assert.equal(bloques[5].texto, 'Cita')
})

test('bloquesDeActa decodifica entidades, colapsa espacios y mapea h4 a h3', () => {
  const bloques = bloquesDeActa('<h4>  Plazos &amp;   metas </h4><p>a&nbsp;b &#233; &#x41; &desconocida;</p>')

  assert.equal(bloques[0].etiqueta, 'h3')
  assert.equal(bloques[0].texto, 'Plazos & metas')
  assert.equal(bloques[1].texto, 'a b é A &desconocida;')
})

test('bloquesDeActa trata lo que no conoce como texto, no como etiquetas ni scripts', () => {
  const bloques = bloquesDeActa(
    '<script>alert(1)</script><style>p{}</style><!-- nota --><div>Suelto</div><p onclick="x()">Dentro <a href="javascript:x()">enlace</a></p>'
  )

  assert.deepEqual(bloques.map((b) => b.texto), ['Suelto', 'Dentro enlace'])
  assert.ok(bloques.every((b) => !b.texto.includes('<') && !b.texto.includes('alert')))
})

test('bloquesDeActa aplana lo anidado: párrafos en una cita, listas dentro de listas', () => {
  const bloques = bloquesDeActa('<blockquote><p>Uno</p><p>Dos</p></blockquote><ul><li>A<ul><li>B</li></ul></li><li>C</li></ul>')

  assert.equal(bloques[0].texto, 'Uno Dos')
  assert.deepEqual(bloques[1].items, ['A', 'B', 'C'])
})

test('bloquesDeActa cierra el bloque abierto cuando empieza otro y descarta los vacíos', () => {
  const bloques = bloquesDeActa('<p>Uno<p>Dos<p></p><h2></h2><ul><li></li></ul>')

  assert.deepEqual(bloques.map((b) => b.texto), ['Uno', 'Dos'])
})

test('bloquesDeActa devuelve una lista vacía con HTML vacío, roto o que no es texto', () => {
  assert.deepEqual(bloquesDeActa(''), [])
  assert.deepEqual(bloquesDeActa('   \n '), [])
  assert.deepEqual(bloquesDeActa(null), [])
  assert.deepEqual(bloquesDeActa(undefined), [])
  assert.deepEqual(bloquesDeActa('<p'), [{ etiqueta: 'p', texto: '<p', items: [] }])
  assert.deepEqual(bloquesDeActa('<p class="a>b">ok</p>'), [{ etiqueta: 'p', texto: 'ok', items: [] }])
  assert.deepEqual(bloquesDeActa('<p>ok</p'), [{ etiqueta: 'p', texto: 'ok</p', items: [] }])
  assert.deepEqual(bloquesDeActa('<<<>>>'), [{ etiqueta: 'p', texto: '<<<>>>', items: [] }])
})

test('bloquesDeActa acota el HTML que lee', () => {
  const enorme = `<p>${'a '.repeat(LIMITES_REPRODUCCION.maxCaracteresHtml)}</p>`
  const [bloque] = bloquesDeActa(enorme)

  assert.ok(bloque.texto.length <= LIMITES_REPRODUCCION.maxCaracteresHtml)
})

test('bloquesDeActa cuenta el filete como bloque sin texto, y el de dentro de un bloque no', () => {
  const bloques = bloquesDeActa('<h1>Acta</h1><hr /><p>Uno</p><blockquote>a<hr>b</blockquote>')

  assert.deepEqual(bloques.map((b) => b.etiqueta), ['h1', 'hr', 'p', 'blockquote'])
  assert.equal(bloques[1].texto, '')
  assert.equal(bloques[3].texto, 'a b')
})

test('guion: un filete que cambia entra con el fundido y no con cursor', () => {
  const guion = armarGuion('<h1>Acta</h1><p>Uno</p>', '<h1>Acta</h1><hr><p>Uno</p>')

  assert.equal(guion.hayCambios, true)
  assert.equal(guion.pasos.length, 0)
  assert.equal(guion.hayFundido, true)
  assert.deepEqual(guion.entradas.map((e) => e.cambio.tipo), ['igual', 'insertado', 'igual'])
})

test('diff: bloques iguales no cambian', () => {
  const html = '<h2>Temas</h2><p>Uno</p><ul><li>A</li></ul>'

  assert.deepEqual(tipos(diff(html, html)), ['igual', 'igual', 'igual'])
  assert.equal(armarGuion(html, html).hayCambios, false)
  assert.equal(armarGuion(html, html).pasos.length, 0)
})

test('diff: un bloque insertado queda entre sus vecinos', () => {
  const cambios = diff('<p>Uno</p><p>Tres</p>', '<p>Uno</p><p>Dos</p><p>Tres</p>')

  assert.deepEqual(tipos(cambios), ['igual', 'insertado', 'igual'])
  assert.equal(cambios[1].nuevo.texto, 'Dos')
  assert.equal(cambios[1].anterior, null)
})

test('diff: un bloque eliminado se marca con su texto viejo', () => {
  const cambios = diff('<p>Uno</p><p>Dos</p><p>Tres</p>', '<p>Uno</p><p>Tres</p>')

  assert.deepEqual(tipos(cambios), ['igual', 'eliminado', 'igual'])
  assert.equal(cambios[1].anterior.texto, 'Dos')
  assert.equal(cambios[1].nuevo, null)
})

test('diff: un bloque editado es modificado y trae el diff por palabras', () => {
  const cambios = diff(
    '<p>Entregar el informe el viernes por la tarde</p>',
    '<p>Entregar el informe final el lunes por la tarde</p>'
  )

  assert.deepEqual(tipos(cambios), ['modificado'])
  assert.deepEqual(cambios[0].segmentos, [
    { tipo: 'igual', palabras: ['Entregar', 'el', 'informe'] },
    { tipo: 'insertado', palabras: ['final'] },
    { tipo: 'igual', palabras: ['el'] },
    { tipo: 'borrado', palabras: ['viernes'] },
    { tipo: 'insertado', palabras: ['lunes'] },
    { tipo: 'igual', palabras: ['por', 'la', 'tarde'] }
  ])
})

test('diff: dos bloques editados entre dos iguales se emparejan por similitud y en orden', () => {
  const cambios = diff(
    '<h2>A</h2><p>revisar el presupuesto con finanzas</p><p>enviar la propuesta al cliente nuevo</p><h2>B</h2>',
    '<h2>A</h2><p>revisar el presupuesto con finanzas hoy</p><p>enviar la propuesta al cliente antiguo</p><h2>B</h2>'
  )

  assert.deepEqual(tipos(cambios), ['igual', 'modificado', 'modificado', 'igual'])
  assert.equal(cambios[1].nuevo.texto, 'revisar el presupuesto con finanzas hoy')
  assert.equal(cambios[2].anterior.texto, 'enviar la propuesta al cliente nuevo')
})

test('diff: un bloque reescrito del todo en el mismo lugar sigue siendo uno modificado', () => {
  const cambios = diff('<p>Texto viejo</p>', '<p>Algo completamente distinto</p>')

  assert.deepEqual(tipos(cambios), ['modificado'])
  assert.deepEqual(cambios[0].segmentos.map((s) => s.tipo), ['borrado', 'insertado'])
})

test('diff: bloques distintos sin parecido son eliminado e insertado, lo borrado primero', () => {
  const cambios = diff('<h2>Uno</h2><p>alfa beta gamma</p>', '<h2>Uno</h2><p>zeta eta theta</p><h3>Nuevo</h3>')

  assert.deepEqual(tipos(cambios), ['igual', 'eliminado', 'insertado', 'insertado'])
})

test('diff: un título y un párrafo con el mismo texto no son el mismo bloque', () => {
  const cambios = diff('<p>Acuerdos</p>', '<h2>Acuerdos</h2>')

  assert.deepEqual(tipos(cambios), ['eliminado', 'insertado'])
})

test('diff: en una lista cada punto es una unidad y se cuenta una sola sección', () => {
  const antes = '<p>Intro</p><ul><li>Comprar café</li><li>Llamar al cliente</li><li>Cerrar el mes</li></ul>'
  const despues = '<p>Intro</p><ul><li>Comprar café</li><li>Llamar al cliente hoy</li><li>Cerrar el mes</li><li>Enviar el acta</li></ul>'
  const cambios = diff(antes, despues)

  assert.deepEqual(tipos(cambios), ['igual', 'igual', 'modificado', 'igual', 'insertado'])
  assert.equal(cambios[4].nuevo.etiqueta, 'li')
  assert.equal(cambios[4].nuevo.lista, 'ul')

  const guion = armarGuion(antes, despues)

  assert.equal(guion.unidadesCambiadas, 2)
  assert.equal(guion.secciones, 1)
})

test('diff: HTML vacío contra uno con contenido es todo insertado, y al revés todo eliminado', () => {
  assert.deepEqual(tipos(diff('', '<p>Uno</p><p>Dos</p>')), ['insertado', 'insertado'])
  assert.deepEqual(tipos(diff('<p>Uno</p>', '')), ['eliminado'])
  assert.deepEqual(diff('', ''), [])
  assert.deepEqual(tipos(diff('<<<', '<h2>Uno</h2>')), ['eliminado', 'insertado'])
})

test('diferenciasDePalabras: borrado antes que escrito, y tramos contiguos unidos', () => {
  assert.deepEqual(diferenciasDePalabras('a b c', 'a x y c'), [
    { tipo: 'igual', palabras: ['a'] },
    { tipo: 'borrado', palabras: ['b'] },
    { tipo: 'insertado', palabras: ['x', 'y'] },
    { tipo: 'igual', palabras: ['c'] }
  ])
  assert.deepEqual(diferenciasDePalabras('', ''), [])
  assert.deepEqual(diferenciasDePalabras('', 'hola mundo'), [{ tipo: 'insertado', palabras: ['hola', 'mundo'] }])
  assert.deepEqual(diferenciasDePalabras('hola', ''), [{ tipo: 'borrado', palabras: ['hola'] }])
})

test('guion: un cambio chico se anima completo, con pasos ordenados y duración dentro del rango', () => {
  const guion = armarGuion(
    '<h2>Temas</h2><p>Uno</p><p>Tres</p>',
    '<h2>Temas</h2><p>Uno</p><p>Dos</p><p>Tres</p>'
  )

  assert.equal(guion.hayCambios, true)
  assert.equal(guion.hayFundido, false)
  assert.equal(guion.pasos.length, 1)
  assert.equal(guion.pasos[0].accion, 'insertar')
  assert.equal(guion.entradas[guion.pasos[0].indice].cambio.nuevo.texto, 'Dos')
  assert.ok(guion.duracionMs >= LIMITES_REPRODUCCION.duracionMinMs)
  assert.ok(guion.duracionMs <= LIMITES_REPRODUCCION.duracionMaxMs)
})

test('guion: la duración de un paso coincide con la suma de sus partes y el total con los pasos', () => {
  const guion = armarGuion(
    '<p>Entregar el informe el viernes</p><p>Dos</p>',
    '<p>Entregar el informe final el lunes</p>'
  )
  const suma = guion.pasos.reduce((total, paso) => total + paso.duracionMs, 0)

  for (const paso of guion.pasos) assert.equal(paso.duracionMs, duracionDePaso(paso, guion.ritmo))
  assert.ok(guion.duracionMs >= suma)
  assert.ok(guion.ritmo.esperaFinalMs >= 0)
})

test('guion: los pasos siguen el orden del documento', () => {
  const guion = armarGuion(
    '<p>a1 a2 a3</p><p>medio igual</p><p>z1 z2 z3</p>',
    '<p>b1 b2 b3</p><p>medio igual</p><p>y1 y2 y3</p>'
  )
  const indices = guion.pasos.map((paso) => paso.indice)

  assert.deepEqual(indices, [...indices].sort((a, b) => a - b))
})

test('guion: con muchos cambios solo se animan los primeros bloques y el resto entra con fundido', () => {
  const antes = Array.from({ length: 30 }, (_, i) => `<p>antes numero ${i} uno dos tres</p>`).join('')
  const despues = Array.from({ length: 30 }, (_, i) => `<p>despues bloque ${i} cuatro cinco seis</p>`).join('')
  const guion = armarGuion(antes, despues)
  const animadas = guion.entradas.filter((e) => e.animada)
  const sinAnimar = guion.entradas.filter((e) => !e.animada && e.cambio.tipo !== 'igual')

  assert.ok(animadas.length > 0)
  assert.ok(animadas.length <= LIMITES_REPRODUCCION.maxBloquesAnimados)
  assert.ok(sinAnimar.length > 0)
  assert.equal(guion.hayFundido, true)
  assert.ok(guion.duracionMs <= LIMITES_REPRODUCCION.duracionMaxMs)
  assert.equal(guion.unidadesCambiadas, animadas.length + sinAnimar.length)
  // Lo animado es siempre lo primero que cambió.
  const primeraSinAnimar = guion.entradas.findIndex((e) => !e.animada && e.cambio.tipo !== 'igual')
  const ultimaAnimada = guion.entradas.map((e) => e.animada).lastIndexOf(true)

  assert.ok(ultimaAnimada < primeraSinAnimar)
})

test('guion: un solo bloque gigante no cabe en el máximo y entra completo con fundido', () => {
  const palabras = Array.from({ length: 3000 }, (_, i) => `palabra${i}`).join(' ')
  const guion = armarGuion('<p>corto</p>', `<p>${palabras}</p>`)

  assert.equal(guion.hayCambios, true)
  assert.equal(guion.pasos.length, 0)
  assert.equal(guion.hayFundido, true)
  assert.ok(guion.duracionMs <= LIMITES_REPRODUCCION.duracionMaxMs)
})

test('guion: la reescritura de un documento grande no se cuelga y respeta los topes', () => {
  const grande = (prefijo) => Array.from({ length: 800 }, (_, i) => `<p>${prefijo} ${i} ${'x'.repeat(i % 7)}</p>`).join('')
  const inicio = Date.now()
  const guion = armarGuion(grande('a'), grande('b'))

  assert.ok(Date.now() - inicio < 5000)
  assert.ok(guion.entradas.filter((e) => e.animada).length <= LIMITES_REPRODUCCION.maxBloquesAnimados)
  assert.ok(guion.duracionMs <= LIMITES_REPRODUCCION.duracionMaxMs)
})

test('guion: un cambio de formato sin cambio de texto no se anima', () => {
  const guion = armarGuion('<p>Hola mundo</p>', '<p>Hola <strong>mundo</strong></p>')

  assert.equal(guion.hayCambios, false)
})

test('resumenDeCambios usa el nombre del asistente y el singular cuando corresponde', () => {
  assert.equal(resumenDeCambios(3), 'Thinking Orb actualizó 3 secciones')
  assert.equal(resumenDeCambios(1), 'Thinking Orb actualizó 1 sección')
  assert.equal(resumenDeCambios(0), 'Thinking Orb actualizó 1 sección')
  assert.equal(resumenDeCambios(2, 'Otro'), 'Otro actualizó 2 secciones')
})
