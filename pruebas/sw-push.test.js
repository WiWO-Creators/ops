/**
 * Pruebas de `public/sw-push.js`, el pedazo de service worker que muestra los push.
 *
 * El archivo no pasa por el bundler: se carga en un contexto de `vm` con un `self` falso que junta
 * los listeners, un `fetch` controlado y un `clients` que anota que se enfoco o se abrio.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { rutaDeAviso as rutaDelPanel } from '../src/dominio/enlace-de-aviso.ts'

const codigo = await readFile(new URL('../public/sw-push.js', import.meta.url), 'utf8')

/** Carga el service worker con dobles y devuelve sus piezas. */
function cargar ({ respuesta, ventanas = [], navegarFalla = false } = {}) {
  const oyentes = {}
  const mostradas = []
  const abiertas = []
  const enfocadas = []
  const pedidos = []

  const self = {
    location: { origin: 'https://ops.wiwo.me' },
    addEventListener: (tipo, oyente) => { oyentes[tipo] = oyente },
    registration: { showNotification: async (titulo, opciones) => { mostradas.push({ titulo, ...opciones }) } },
    clients: {
      matchAll: async () => ventanas.map((url) => ({
        url,
        focus: async () => { enfocadas.push(url) },
        navigate: async (destino) => {
          if (navegarFalla) throw new TypeError('no controlada')
          enfocadas.push(destino)
        }
      })),
      openWindow: async (url) => { abiertas.push(url) }
    }
  }

  const fetch = async (url, opciones) => {
    pedidos.push({ url, opciones })
    if (respuesta instanceof Error) throw respuesta

    return { ok: respuesta.ok ?? true, json: async () => respuesta.cuerpo }
  }

  const modulo = { exports: {} }
  vm.runInNewContext(codigo, { self, fetch, URL, module: modulo })

  /** Dispara un evento y espera lo que el listener pidio con `waitUntil`. */
  async function disparar (tipo, evento = {}) {
    let espera = Promise.resolve()
    oyentes[tipo]({ ...evento, waitUntil: (promesa) => { espera = promesa } })
    await espera
  }

  return { ...modulo.exports, disparar, mostradas, abiertas, enfocadas, pedidos }
}

test('rutaDeAviso del service worker dice lo mismo que la del panel', () => {
  const { rutaDeAviso } = cargar({ respuesta: { cuerpo: {} } })

  for (const link of ['#taskid=512', ' #taskid=7 ', '#taskid=0', '#taskid=512&x', '#leadid=3', '', null, undefined, '#taskid=99999999999999999999']) {
    assert.equal(rutaDeAviso(link), rutaDelPanel(link ?? null), `link ${String(link)}`)
  }
})

test('un push muestra el ultimo aviso sin leer, con su autor y su enlace', async () => {
  const sw = cargar({
    respuesta: { cuerpo: { data: [{ id: 1, text: 'Te asignaron la Tarea X.', link: '#taskid=512', from: { id: 2, name: 'Catalina Rojas' } }] } }
  })

  await sw.disparar('push')

  assert.equal(sw.pedidos[0].url, '/api/bff/notifications?per_page=1&filter[unread]=1')
  assert.equal(sw.pedidos[0].opciones.credentials, 'include')
  assert.equal(sw.mostradas.length, 1)
  assert.equal(sw.mostradas[0].titulo, 'Catalina Rojas')
  assert.equal(sw.mostradas[0].body, 'Te asignaron la Tarea X.')
  assert.equal(sw.mostradas[0].tag, 'ops-aviso')
  assert.equal(sw.mostradas[0].data.url, '/procesos?tarea=512')
})

test('sin sesion, sin red o sin avisos, el push igual muestra algo generico', async () => {
  for (const respuesta of [{ ok: false, cuerpo: null }, new Error('sin red'), { cuerpo: { data: [] } }, { cuerpo: 'basura' }]) {
    const sw = cargar({ respuesta })
    await sw.disparar('push')

    assert.equal(sw.mostradas.length, 1)
    assert.equal(sw.mostradas[0].body, 'Tienes un aviso nuevo.')
    assert.equal(sw.mostradas[0].data.url, '/inicio')
  }
})

test('el clic enfoca la pestaña de Ops abierta y la lleva al aviso', async () => {
  const sw = cargar({ respuesta: { cuerpo: {} }, ventanas: ['https://otro.sitio/x', 'https://ops.wiwo.me/inicio'] })
  const notificacion = { data: { url: '/procesos?tarea=512' }, close () { this.cerrada = true } }

  await sw.disparar('notificationclick', { notification: notificacion })

  assert.equal(notificacion.cerrada, true)
  assert.deepEqual(sw.enfocadas, ['https://ops.wiwo.me/inicio', 'https://ops.wiwo.me/procesos?tarea=512'])
  assert.deepEqual(sw.abiertas, [])
})

test('sin pestaña abierta, o con una que no se deja navegar, abre una nueva', async () => {
  const sinVentanas = cargar({ respuesta: { cuerpo: {} } })
  await sinVentanas.disparar('notificationclick', { notification: { data: { url: '/procesos?tarea=3' }, close () {} } })
  assert.deepEqual(sinVentanas.abiertas, ['https://ops.wiwo.me/procesos?tarea=3'])

  const noControlada = cargar({ respuesta: { cuerpo: {} }, ventanas: ['https://ops.wiwo.me/inicio'], navegarFalla: true })
  await noControlada.disparar('notificationclick', { notification: { data: { url: '/inicio' }, close () {} } })
  assert.deepEqual(noControlada.abiertas, ['https://ops.wiwo.me/inicio'])
})

test('una URL de otro origen en los datos no saca a nadie de Ops', async () => {
  const sw = cargar({ respuesta: { cuerpo: {} } })
  await sw.disparar('notificationclick', { notification: { data: { url: 'https://evil.example/x' }, close () {} } })

  assert.deepEqual(sw.abiertas, [])
  assert.deepEqual(sw.enfocadas, [])
})
