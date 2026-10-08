/**
 * Pruebas del texto enriquecido: el tokenizador con lista blanca y las conversiones a texto.
 *
 * Lo que se verifica es lo que no puede fallar: que nada fuera de la lista llegue al arbol que
 * `Contenido` convierte en elementos, que un enlace solo sobreviva con un protocolo seguro y que lo
 * "vacio" signifique lo mismo en el navegador y en la API.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  direccionDeEnlace,
  esHtml,
  esSoloEspacios,
  hrefSeguro,
  htmlVacio,
  nodosDeHtml,
  textoAHtml,
  textoPlano
} from '../src/dominio/texto-rico.ts'

/** Serializa el arbol a una cadena corta para comparar: `p(texto)`, `a[href](...)`. */
function forma (nodos) {
  return nodos.map((nodo) => {
    if (nodo.tipo === 'texto') return JSON.stringify(nodo.texto)
    const href = nodo.href === undefined ? '' : `[${nodo.href}]`

    return nodo.hijos.length === 0
      ? `${nodo.etiqueta}${href}`
      : `${nodo.etiqueta}${href}(${forma(nodo.hijos)})`
  }).join(' ')
}

test('esHtml: solo cuenta una etiqueta conocida completa', () => {
  assert.equal(esHtml('<p>hola</p>'), true)
  assert.equal(esHtml('linea<br />otra'), true)
  assert.equal(esHtml('a < b y c > d'), false)
  assert.equal(esHtml('texto <foo> raro'), false)
  assert.equal(esHtml(''), false)
  assert.equal(esHtml(null), false)
})

test('textoAHtml: escapa, un parrafo por bloque y un br por salto', () => {
  assert.equal(textoAHtml('uno\ndos\n\ntres'), '<p>uno<br>dos</p><p>tres</p>')
  assert.equal(textoAHtml('a <b> & "c"'), '<p>a &lt;b&gt; &amp; &quot;c&quot;</p>')
  assert.equal(textoAHtml('a\r\n\r\nb'), '<p>a</p><p>b</p>')
  assert.equal(textoAHtml('   '), '')
  assert.equal(textoAHtml(null), '')
})

test('textoAHtml: lo que parece marcado queda como texto, no como etiquetas', () => {
  assert.ok(!textoAHtml('<script>alert(1)</script>').includes('<script'))
  assert.equal(textoPlano(textoAHtml('<script>alert(1)</script>')), '<script>alert(1)</script>')
})

test('nodosDeHtml: borra script y style con todo lo que traen', () => {
  assert.equal(forma(nodosDeHtml('<p>a</p><script>alert(1)</script><style>p{}</style><p>b</p>')), 'p("a") p("b")')
  assert.equal(forma(nodosDeHtml('<p>a</p><script>sin cierre <p>b</p>')), 'p("a")')
  assert.equal(forma(nodosDeHtml('<SCRIPT >x</SCRIPT ><p>ok</p>')), 'p("ok")')
})

test('nodosDeHtml: desenvuelve lo que no esta en la lista y quita atributos', () => {
  assert.equal(forma(nodosDeHtml('<div class="x"><span style="color:red">hola</span></div>')), '"hola"')
  assert.equal(forma(nodosDeHtml('<img src=x onerror="alert(1)">texto')), '"texto"')
  assert.equal(forma(nodosDeHtml('<p onclick="x()" style="a:b">hola</p>')), 'p("hola")')
  assert.equal(forma(nodosDeHtml('<iframe src="//x">dentro</iframe>')), '"dentro"')
})

test('nodosDeHtml: el href se valida y el resto de atributos se pierde', () => {
  assert.equal(
    forma(nodosDeHtml('<a href="https://wiwo.me/x?a=1&amp;b=2" onclick="x()" target="_self">ir</a>')),
    'a[https://wiwo.me/x?a=1&b=2]("ir")'
  )
  assert.equal(forma(nodosDeHtml('<a href="mailto:ana@wiwo.me">escribir</a>')), 'a[mailto:ana@wiwo.me]("escribir")')
  assert.equal(forma(nodosDeHtml("<a href='http://a.cl'>x</a>")), 'a[http://a.cl]("x")')
})

test('nodosDeHtml: un enlace con protocolo peligroso queda como texto', () => {
  assert.equal(forma(nodosDeHtml('<a href="javascript:alert(1)">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a href=" JaVaScRiPt:alert(1)">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a href="java&#10;script:alert(1)">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a href="java\tscript:alert(1)">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a href="data:text/html,<script>1</script>">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a href="vbscript:x">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a href="/relativo">clic</a>')), '"clic"')
  assert.equal(forma(nodosDeHtml('<a>sin href</a>')), '"sin href"')
})

test('hrefSeguro: acepta los tres protocolos y nada mas', () => {
  assert.equal(hrefSeguro('https://wiwo.me'), 'https://wiwo.me')
  assert.equal(hrefSeguro('  http://wiwo.me '), 'http://wiwo.me')
  assert.equal(hrefSeguro('mailto:a@b.cl'), 'mailto:a@b.cl')
  assert.equal(hrefSeguro('ftp://x'), null)
  assert.equal(hrefSeguro('javascript:1'), null)
  assert.equal(hrefSeguro(''), null)
  assert.equal(hrefSeguro('https://'), null)
})

test('nodosDeHtml: etiquetas sin cerrar se cierran solas y los cierres huerfanos se ignoran', () => {
  assert.equal(forma(nodosDeHtml('<p>uno<strong>dos')), 'p("uno" strong("dos"))')
  assert.equal(forma(nodosDeHtml('</p>suelto</strong>')), '"suelto"')
  assert.equal(forma(nodosDeHtml('<ul><li>a<li>b</ul>')), 'ul(li("a") li("b"))')
  assert.equal(forma(nodosDeHtml('<p>a<p>b')), 'p("a") p("b")')
  assert.equal(forma(nodosDeHtml('<li>sin lista</li>')), '"sin lista"')
})

test('nodosDeHtml: un menor que suelto es texto y las entidades se resuelven una vez', () => {
  assert.equal(forma(nodosDeHtml('<p>a < b y 3 > 2</p>')), 'p("a < b y 3 > 2")')
  assert.equal(forma(nodosDeHtml('<p>Tom &amp; Jerry &lt;3 &#237;</p>')), 'p("Tom & Jerry <3 í")')
  assert.equal(forma(nodosDeHtml('<p>&amp;lt;</p>')), 'p("&lt;")')
  assert.equal(forma(nodosDeHtml('<p>a</p><!-- <script>x</script> --><p>b</p>')), 'p("a") p("b")')
  assert.equal(forma(nodosDeHtml('<!doctype html><p>a</p>')), 'p("a")')
})

test('nodosDeHtml: marcas anidadas y equivalencias b/i', () => {
  assert.equal(
    forma(nodosDeHtml('<p><b>a <i>b</i></b> <u>c</u> <s>d</s></p>')),
    'p(strong("a " em("b")) " " u("c") " " s("d"))'
  )
  assert.equal(forma(nodosDeHtml('<b><i>x</b>y</i>')), 'strong(em("x")) "y"')
  assert.equal(forma(nodosDeHtml('<a href="https://a.cl">uno <a href="https://b.cl">dos</a></a>')),
    'a[https://a.cl]("uno ") a[https://b.cl]("dos")')
})

test('nodosDeHtml: listas, citas, titulos y br', () => {
  assert.equal(
    forma(nodosDeHtml('<h2>T</h2>\n<ul>\n<li><p>a</p></li>\n</ul><blockquote><p>c</p></blockquote><p>x<br>y</p>')),
    'h2("T") ul(li(p("a"))) blockquote(p("c")) p("x" br "y")'
  )
  assert.equal(forma(nodosDeHtml('<h1>no</h1><h2>si</h2>')), '"no" h2("si")')
})

test('nodosDeHtml: un anidado desmesurado no revienta', () => {
  const html = '<blockquote>'.repeat(500) + 'x' + '</blockquote>'.repeat(500)
  assert.ok(nodosDeHtml(html).length > 0)
  assert.equal(nodosDeHtml(null).length, 0)
  assert.equal(nodosDeHtml('').length, 0)
})

test('textoPlano: parrafos, saltos y listas con su marcador', () => {
  assert.equal(textoPlano('<p>uno<br>dos</p><p>tres</p>'), 'uno\ndos\n\ntres')
  assert.equal(textoPlano('<ul><li>a</li><li>b</li></ul>'), '• a\n• b')
  assert.equal(textoPlano('<ol><li>a</li><li>b</li></ol>'), '1. a\n2. b')
  assert.equal(textoPlano('<p>Antes</p><ul><li>a<ul><li>b</li></ul></li></ul><p>Despues</p>'),
    'Antes\n\n• a\n  • b\n\nDespues')
  assert.equal(textoPlano('<h2>Titulo</h2><p>Cuerpo <strong>fuerte</strong></p>'), 'Titulo\n\nCuerpo fuerte')
  assert.equal(textoPlano('<blockquote><p>cita</p></blockquote>'), 'cita')
  assert.equal(textoPlano(null), '')
})

test('textoPlano: ida y vuelta con textoAHtml', () => {
  const original = 'Hola & <chao>\nsegunda linea\n\nOtro parrafo'
  assert.equal(textoPlano(textoAHtml(original)), original)
})

test('htmlVacio: lo que el editor deja cuando no hay nada', () => {
  assert.equal(htmlVacio(''), true)
  assert.equal(htmlVacio('<p></p>'), true)
  assert.equal(htmlVacio('<p><br></p>'), true)
  assert.equal(htmlVacio('<p>&nbsp;</p>'), true)
  assert.equal(htmlVacio('<p> ​</p><p> </p>'), true)
  assert.equal(htmlVacio('<ul><li></li></ul>'), false)
  assert.equal(htmlVacio('<script>alert(1)</script>'), true)
  assert.equal(htmlVacio(null), true)
  assert.equal(htmlVacio('<p>hola</p>'), false)
  assert.equal(htmlVacio('texto plano'), false)
})

test('esSoloEspacios: incluye lo invisible', () => {
  assert.equal(esSoloEspacios(''), true)
  assert.equal(esSoloEspacios('​⁠﻿ \n'), true)
  assert.equal(esSoloEspacios('a'), false)
})

test('direccionDeEnlace: completa el esquema y rechaza lo peligroso', () => {
  assert.equal(direccionDeEnlace('wiwo.me/ayuda'), 'https://wiwo.me/ayuda')
  assert.equal(direccionDeEnlace('  https://wiwo.me '), 'https://wiwo.me')
  assert.equal(direccionDeEnlace('ana@wiwo.me'), 'mailto:ana@wiwo.me')
  assert.equal(direccionDeEnlace('javascript:alert(1)'), null)
  assert.equal(direccionDeEnlace('data:text/html,x'), null)
  assert.equal(direccionDeEnlace('   '), null)
})
