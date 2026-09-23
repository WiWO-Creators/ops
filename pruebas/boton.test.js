/**
 * Regresion del doble envio: `cargando` deshabilita el boton aunque `disabled` venga explicito.
 *
 * Con `disabled ?? cargando`, un `disabled={mensaje.trim() === ''}` —que vale `false` con el
 * formulario completo— anulaba el bloqueo mientras la peticion seguia en curso, y un doble clic
 * mandaba dos respuestas o abria dos tickets. Se transpila el componente real y se mira la prop.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const fuente = ts.transpileModule(readFileSync(new URL('../src/componentes/formularios/Boton.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText

/** El componente con dobles de sus dependencias: `jsx` devuelve el elemento como dato. */
function cargarBoton () {
  const jsx = (type, props) => ({ type, props })
  const sandbox = {
    exports: {},
    require: (nombre) => ({
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'class-variance-authority': { cva: () => () => '' },
      '@/componentes/estado/Orbe': { Orbe: () => null },
      '@/lib/clases': { cn: (...clases) => clases.filter(Boolean).join(' ') }
    })[nombre]
  }
  vm.runInNewContext(fuente, sandbox)
  return sandbox.exports.Boton
}

const Boton = cargarBoton()

test('cargando deshabilita aunque disabled venga en false', () => {
  const elemento = Boton({ cargando: true, disabled: false, children: 'Responder' })

  assert.equal(elemento.type, 'button')
  assert.equal(elemento.props.disabled, true)
  assert.equal(elemento.props['aria-busy'], true)
})

test('sin cargando manda disabled; y los dos se suman', () => {
  assert.equal(Boton({ disabled: false, children: 'x' }).props.disabled, false)
  assert.equal(Boton({ disabled: true, children: 'x' }).props.disabled, true)
  assert.equal(Boton({ children: 'x' }).props.disabled, false)
  assert.equal(Boton({ cargando: true, children: 'x' }).props.disabled, true)
  assert.equal(Boton({ cargando: true, disabled: true, children: 'x' }).props.disabled, true)
})
