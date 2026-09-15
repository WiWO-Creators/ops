import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const fuente = ts.transpileModule(readFileSync(new URL('../src/componentes/ia/TextoChat.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText
const sandbox = {
  exports: {},
  require: nombre => ({
    'react/jsx-runtime': jsxRuntime,
    'react-markdown': markdown,
    'remark-gfm': { default: remarkGfm }
  })[nombre]
}
vm.runInNewContext(fuente, sandbox)

/** Renderiza el componente real con el parser Markdown real, sin sustituir su sanitización. */
function render (texto, extra = {}) {
  return renderToStaticMarkup(createElement(sandbox.exports.TextoChat, { texto, ...extra }))
}

test('plan con énfasis, listas anidadas y párrafos produce estructura semántica', () => {
  const html = render('Proyecto **Skydive**\n\n* **Hitos semanales**\n  * Semana 1\n  * Semana 2\n\n1. Diseño\n2. Producción')
  assert.match(html, /<strong[^>]*>Skydive<\/strong>/)
  assert.equal((html.match(/<ul /g) ?? []).length, 2)
  assert.match(html, /<ol /)
  assert.doesNotMatch(html, /\*\*/)
})

test('HTML crudo, JavaScript, datos e imágenes no crean contenido ejecutable ni peticiones', () => {
  const html = render('<script>alert(1)</script>\n\n<img src="https://tracker.example/pixel" onerror="alert(1)">\n\n[mal](javascript:alert%281%29) [datos](data:text/html,attack) ![pixel](https://tracker.example/pixel)')
  assert.doesNotMatch(html, /<script|<img|onerror=|href="(?:javascript|data):|tracker\.example/)
  assert.match(html, />mal<\/span>/)
})

test('enlaces HTTP y navegación interna conservan destino y citas verificadas', () => {
  const html = render('[Proyecto](/proyectos/42) [Docs](https://example.com) [1](#fuente-1)', {
    marcadores: { '#fuente-1': createElement('a', { href: '/tareas/7', 'aria-label': 'Ver tarea' }, createElement('sup', null, '[1]')) }
  })
  assert.match(html, /href="\/proyectos\/42"/)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /aria-label="Ver tarea"><sup>\[1\]<\/sup>/)
  assert.doesNotMatch(html, /href="#fuente-1"/)
})

test('tablas GFM y código preservan contenido con desplazamiento horizontal local', () => {
  const html = render('| Hito | Fecha |\n| --- | --- |\n| Semana 1 | Lunes |\n\n```js\nconst valor = "<script>";\n```')
  assert.match(html, /overflow-x-auto[^>]*><table/)
  assert.match(html, /<th /)
  assert.match(html, /<pre[^>]*overflow-x-auto/)
  assert.match(html, /&lt;script&gt;/)
})

test('contenido vacío y Markdown parcial del stream no fallan', () => {
  assert.doesNotThrow(() => render(''))
  assert.match(render('Preparando **Skydive'), /Preparando \*\*Skydive/)
  assert.match(render('Texto', { className: 'text-texto-sutil' }), /text-texto-sutil/)
})
