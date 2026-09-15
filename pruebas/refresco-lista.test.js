import { test } from 'node:test'
import assert from 'node:assert/strict'
import { observarLista, avisarCambioDeTareas, REFRESCO_LISTA_MS } from '../src/datos/refresco-lista.ts'

/** Entorno de navegador mínimo con reloj controlado y limpieza por caso. */
function navegador (t) {
  const anteriorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const anteriorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const ventana = new EventTarget()
  const documento = Object.assign(new EventTarget(), { hidden: false })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: ventana })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documento })
  t.mock.timers.enable({ apis: ['setInterval'] })
  t.after(() => {
    if (anteriorWindow) Object.defineProperty(globalThis, 'window', anteriorWindow)
    else delete globalThis.window
    if (anteriorDocument) Object.defineProperty(globalThis, 'document', anteriorDocument)
    else delete globalThis.document
  })
  return { ventana, documento }
}

/** Deja terminar las continuaciones de las consultas simuladas. */
async function terminar () {
  await Promise.resolve()
  await Promise.resolve()
}

test('una asignación externa aparece en la misma página por refresco periódico', async (t) => {
  navegador(t)
  let filas = []
  let visible
  const solicitudes = []
  const detener = observarLista(async () => {
    solicitudes.push('tasks?assignee=12&page=3')
    return { filas, pagina: 3 }
  }, (datos) => { visible = datos }, assert.fail)
  t.after(detener)
  await terminar()
  assert.deepEqual(visible, { filas: [], pagina: 3 })
  filas = [{ id: 356 }]
  t.mock.timers.tick(REFRESCO_LISTA_MS)
  assert.deepEqual(visible.filas, [], 'no borra el contenido al comenzar el refresco')
  await terminar()
  assert.deepEqual(visible, { filas: [{ id: 356 }], pagina: 3 })
  assert.equal(solicitudes.length, 2)
})

test('fallo de refresco conserva último listado y siguiente consulta recupera', async (t) => {
  const { ventana } = navegador(t)
  let fallar = false
  let visible
  const errores = []
  const detener = observarLista(async () => {
    if (fallar) throw new Error('sin conexión')
    return [356]
  }, (datos) => { visible = datos }, (error) => errores.push(error.message))
  t.after(detener)
  await terminar()
  fallar = true
  ventana.dispatchEvent(new Event('focus'))
  await terminar()
  assert.deepEqual(visible, [356])
  assert.deepEqual(errores, ['sin conexión'])
  fallar = false
  ventana.dispatchEvent(new Event('focus'))
  await terminar()
  assert.deepEqual(visible, [356])
})

test('pestaña oculta pausa consultas y al volver recupera asignaciones', async (t) => {
  const { documento } = navegador(t)
  let consultas = 0
  const detener = observarLista(async () => ++consultas, () => {}, assert.fail)
  t.after(detener)
  await terminar()
  documento.hidden = true
  t.mock.timers.tick(REFRESCO_LISTA_MS * 2)
  assert.equal(consultas, 1)
  documento.hidden = false
  documento.dispatchEvent(new Event('visibilitychange'))
  await terminar()
  assert.equal(consultas, 2)
})

test('fallo inicial se informa y recuperación acepta lista vacía válida', async (t) => {
  const { ventana } = navegador(t)
  let fallar = true
  const errores = []
  const recibidos = []
  const detener = observarLista(async () => {
    if (fallar) throw new Error('respuesta inválida')
    return []
  }, (datos) => recibidos.push(datos), (error) => errores.push(error.message))
  t.after(detener)
  await terminar()
  assert.deepEqual(errores, ['respuesta inválida'])
  assert.deepEqual(recibidos, [])
  fallar = false
  ventana.dispatchEvent(new Event('focus'))
  await terminar()
  assert.deepEqual(recibidos, [[]])
})

test('escritura durante consulta provoca nueva lectura sin peticiones simultáneas', async (t) => {
  navegador(t)
  const resolver = []
  const recibidos = []
  const detener = observarLista(() => new Promise((resolve) => resolver.push(resolve)), (datos) => recibidos.push(datos), assert.fail)
  t.after(detener)
  avisarCambioDeTareas('projects/3')
  avisarCambioDeTareas('tasks/356')
  avisarCambioDeTareas('tasks/356/assignees')
  assert.equal(resolver.length, 1)
  resolver[0]([])
  await terminar()
  assert.equal(resolver.length, 2)
  resolver[1]([356])
  await terminar()
  assert.deepEqual(recibidos, [[], [356]])
})

test('cleanup aborta consulta, ignora respuesta tardía y elimina todos los disparadores', async (t) => {
  const { ventana, documento } = navegador(t)
  let senal
  let resolver
  let consultas = 0
  const recibidos = []
  const detener = observarLista((signal) => {
    senal = signal
    consultas++
    return new Promise((resolve) => { resolver = resolve })
  }, (datos) => recibidos.push(datos), assert.fail)
  detener()
  assert.equal(senal.aborted, true)
  resolver([356])
  await terminar()
  ventana.dispatchEvent(new Event('focus'))
  documento.dispatchEvent(new Event('visibilitychange'))
  avisarCambioDeTareas('tasks/356')
  t.mock.timers.tick(REFRESCO_LISTA_MS * 2)
  assert.equal(consultas, 1)
  assert.deepEqual(recibidos, [])
})
