import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { arbolDePresencia } from '../src/componentes/auditoria/presentacion.ts'

test('árbol mantiene cliente → proyecto → tarea, actividad general y relaciones ausentes', () => {
  const client = { id: 1, name: 'Cliente' }
  const project = { id: 2, name: 'Proyecto' }
  const task = { id: 3, name: 'Tarea' }
  const personas = [
    { staff: { id: 1 }, context: { client, project, task } },
    { staff: { id: 2 }, context: { client, project, task } },
    { staff: { id: 3 }, context: { client, project, task: null } },
    { staff: { id: 4 } },
    { staff: { id: 5 }, context: { client: null, project: null, task } }
  ]
  const arbol = arbolDePresencia(personas)
  assert.equal(arbol[0].total, 3)
  assert.equal(arbol[0].ramas[0].nombre, 'Proyecto')
  assert.equal(arbol[0].ramas[0].personas[0].staff.id, 3)
  assert.deepEqual(arbol[0].ramas[0].ramas[0].personas.map(p => p.staff.id), [1, 2])
  assert.equal(arbol[1].total, 2)
  assert.equal(arbol[1].personas[0].staff.id, 4)
  assert.equal(arbol[1].ramas[0].nombre, 'Sin proyecto')
  assert.equal(arbol[1].ramas[0].ramas[0].personas[0].staff.id, 5)
  assert.deepEqual(arbolDePresencia([]), [])
})

test('latido detecta interacciones globales, limita envíos y no renueva una pestaña inactiva', async () => {
  const eventos = new Map()
  const envios = []
  let reloj = 100_000
  let intervalo
  let cerrar
  let contexto
  let tarea = null
  const documento = {
    hidden: false,
    addEventListener: (tipo, funcion) => eventos.set(tipo, funcion),
    removeEventListener: tipo => eventos.delete(tipo)
  }
  const fuente = ts.transpileModule(readFileSync(new URL('../src/componentes/auditoria/Latido.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const sandbox = {
    exports: {}, document: documento, AbortController, Date: { now: () => reloj },
    fetch: async (_, opciones) => { envios.push(JSON.parse(opciones.body)); return { ok: true } },
    setInterval: funcion => { intervalo = funcion; return 1 }, clearInterval: () => {},
    require: nombre => ({
      'next/navigation': { usePathname: () => '/espacios/2' },
      react: { useEffect: funcion => { cerrar = funcion() } },
      './accion': {
        accionEnCurso: () => null, rutaDeTarea: () => tarea,
        escucharAccion: funcion => { contexto = funcion; return () => {} }
      }
    })[nombre]
  }
  vm.runInNewContext(fuente, sandbox)
  sandbox.exports.Latido({ segundos: 45 })
  assert.equal(envios.length, 1)
  reloj += 45_000
  intervalo()
  assert.equal(envios.length, 1, 'un intervalo sin interacción no debe mantener presencia')
  for (const evento of ['pointerdown', 'pointermove', 'keydown', 'input', 'change', 'submit', 'scroll', 'wheel', 'touchstart', 'focusin']) {
    reloj += 45_000
    eventos.get(evento)({ target: { value: 'secreto' }, key: 'x' })
  }
  assert.equal(envios.length, 11)
  eventos.get('input')({ target: { value: 'otro secreto' } })
  assert.equal(envios.length, 11, 'no se envía una petición por tecla')
  reloj += 45_000
  intervalo()
  assert.equal(envios.length, 12)
  assert.deepEqual(envios[11], { route: '/espacios/2', action: null })
  intervalo()
  assert.equal(envios.length, 12)
  tarea = '/procesos/3'
  contexto()
  assert.equal(envios[12].route, '/procesos/3')
  documento.hidden = true
  reloj += 45_000
  eventos.get('pointermove')()
  intervalo()
  assert.equal(envios.length, 13)
  cerrar()
  assert.equal(eventos.size, 0)
  await Promise.resolve()
})
