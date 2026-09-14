import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const fuente = ts.transpileModule(readFileSync(new URL('../src/componentes/presentadores/Avatar.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText

/** Simula estado persistente y dependencias de callbacks entre renders del mismo avatar. */
function montarAvatar () {
  const hooks = []
  let indice = 0
  const jsx = (type, props) => ({ type, props })
  const sandbox = {
    exports: {},
    require: nombre => ({
      'react/jsx-runtime': { jsx, jsxs: jsx },
      react: {
        useState: inicial => {
          const posicion = indice++
          if (!(posicion in hooks)) hooks[posicion] = inicial
          return [hooks[posicion], valor => {
            hooks[posicion] = typeof valor === 'function' ? valor(hooks[posicion]) : valor
          }]
        },
        useCallback: (callback, dependencias) => {
          const posicion = indice++
          const anterior = hooks[posicion]
          if (!anterior || dependencias.some((valor, i) => !Object.is(valor, anterior.dependencias[i]))) {
            hooks[posicion] = { callback, dependencias }
          }
          return hooks[posicion].callback
        }
      },
      '@/lib/clases': { cn: (...clases) => clases.filter(Boolean).join(' ') },
      '@/lib/personas': { coloresAvatar: () => ({ fondo: 'white', texto: 'black' }), iniciales: () => 'JA' }
    })[nombre]
  }
  vm.runInNewContext(fuente, sandbox)
  return imagen => {
    indice = 0
    return sandbox.exports.Avatar({ nombre: 'Jean Andrade', imagen }).props.children
  }
}

test('un avatar con foto fallida vuelve a mostrar la nueva URL', () => {
  const render = montarAvatar()
  render('/foto-anterior.png').props.onError()
  assert.equal(render('/foto-anterior.png'), 'JA')
  const nueva = render('/foto-nueva.png')
  assert.equal(nueva.type, 'img')
  assert.equal(nueva.props.src, '/foto-nueva.png')
  assert.equal(render(null), 'JA')
  assert.equal(render(''), 'JA')
})

test('un error tardío de la foto anterior no oculta la nueva', () => {
  const render = montarAvatar()
  const anterior = render('/foto-anterior.png')
  render('/foto-nueva.png')
  anterior.props.onError()
  assert.equal(render('/foto-nueva.png').type, 'img')
})

test('detecta fallos previos a hidratación y conserva la URL de cada ref', () => {
  const render = montarAvatar()
  const anterior = render('/foto-anterior.png')
  anterior.props.ref({ complete: true, naturalWidth: 0 })
  assert.equal(render('/foto-anterior.png'), 'JA')
  const nueva = render('/foto-nueva.png')
  assert.equal(nueva.type, 'img')
  nueva.props.ref(null)
  nueva.props.ref({ complete: false, naturalWidth: 0 })
  nueva.props.ref({ complete: true, naturalWidth: 100 })
  anterior.props.ref({ complete: true, naturalWidth: 0 })
  assert.equal(render('/foto-nueva.png').type, 'img')
  nueva.props.ref({ complete: true, naturalWidth: 0 })
  assert.equal(render('/foto-nueva.png'), 'JA')
})
