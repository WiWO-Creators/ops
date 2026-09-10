import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Recorre el diálogo "Importar tareas de otro proyecto" contra Next y la API **real** (no el mock).
 *
 * El mock no hace escritura sobre Espacios, así que esta pantalla solo se puede recorrer contra un
 * backend de verdad. Se configura con variables de entorno para no atar la prueba a una base:
 *
 *   IMPORTAR_TEST_URL       origen de Next (por defecto http://localhost:3097)
 *   IMPORTAR_TEST_EMAIL     correo de la sesión
 *   IMPORTAR_TEST_PASSWORD  contraseña
 *   IMPORTAR_TEST_DESTINO   id del Espacio que recibe; tiene que tener al menos un Hito
 *
 * Los clics van por `evaluate` y no con `locator.click()`, que en este entorno se cuelga.
 *
 * NO importa nada: se queda en la previsualización. Ejecutar la copia dejaría filas en la base de
 * quien corra la prueba, y limpiarlas desde acá es más frágil que no crearlas.
 */
const destino = new URL(process.env.IMPORTAR_TEST_URL ?? 'http://localhost:3097')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const espacioDestino = process.env.IMPORTAR_TEST_DESTINO ?? '32'

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/**
 * Abre un disparador de Radix.
 *
 * Un `click()` a secas NO lo abre: Radix escucha `pointerdown`, que jsdom-less Chromium no sintetiza
 * al invocar `click()` por script. Hay que despachar el evento de puntero a mano.
 */
async function abrirRadix (pagina, texto) {
  const encontrado = await pagina.evaluate((buscado) => {
    const nodos = [...document.querySelectorAll('button')]
    const objetivo = nodos.find((n) => (n.textContent ?? '').trim() === buscado)
    if (objetivo === undefined) return false

    objetivo.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    objetivo.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
    objetivo.click()

    return true
  }, texto)

  assert.ok(encontrado, `No se encontró el disparador "${texto}"`)
}

/** Clic por `evaluate`: `locator.click()` se cuelga en este entorno. */
async function clicPorTexto (pagina, texto) {
  const encontrado = await pagina.evaluate((buscado) => {
    const nodos = [...document.querySelectorAll('button, a, [role="menuitem"], [role="option"]')]
    const objetivo = nodos.find((n) => (n.textContent ?? '').trim().includes(buscado))
    if (objetivo === undefined) return false
    objetivo.click()

    return true
  }, texto)

  assert.ok(encontrado, `No se encontró nada que decir "${texto}"`)
}

try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1100 } })

  const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: {
      email: process.env.IMPORTAR_TEST_EMAIL ?? 'dev@wiwo.local',
      password: process.env.IMPORTAR_TEST_PASSWORD ?? 'Prueba123!'
    }
  })
  assert.equal(respuesta.status(), 200, 'No se pudo iniciar sesión')

  const pagina = await contexto.newPage()
  // `domcontentloaded` y no `networkidle`: el latido de presencia mantiene la red ocupada para
  // siempre, así que esperar a que se calme no termina nunca.
  await pagina.goto(new URL(`/espacios/${espacioDestino}`, destino).href, { waitUntil: 'domcontentloaded' })
  await pagina.waitForFunction(() => document.querySelector('h1') !== null, { timeout: 30000 })

  // --- El item vive en el menú "Más" de la cabecera.
  await abrirRadix(pagina, 'Más')
  await pagina.waitForFunction(
    () => document.body.textContent?.includes('Importar tareas de otro proyecto'),
    { timeout: 10000 }
  )

  await clicPorTexto(pagina, 'Importar tareas de otro proyecto')

  // --- El diálogo trae la lista de origenes y el selector de hito.
  await pagina.waitForFunction(
    () => document.querySelector('[role="dialog"]')?.textContent?.includes('Buscar el proyecto de origen') === true,
    { timeout: 15000 }
  )

  const origenes = await pagina.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] li button')].map((b) => (b.textContent ?? '').trim())
  )
  assert.ok(origenes.length > 0, 'La lista de proyectos de origen llegó vacía')

  // El Espacio que se está mirando NO puede ofrecerse como origen: el backend responde 422.
  const titulo = await pagina.evaluate(() => document.querySelector('h1')?.textContent?.trim() ?? '')
  assert.ok(!origenes.includes(titulo), `El proyecto actual no debe estar en la lista: ${titulo}`)

  // --- Sin elegir nada, el botón avisa qué falta en vez de disparar la llamada.
  await clicPorTexto(pagina, 'Ver qué se va a copiar')
  await pagina.waitForFunction(
    () => document.querySelector('[role="alert"]')?.textContent?.includes('Elegí de qué proyecto') === true,
    { timeout: 10000 }
  )

  // --- Con origen y hito elegidos, llega el informe del backend.
  await pagina.evaluate(() => { document.querySelector('[role="dialog"] li button')?.click() })
  await pagina.evaluate(() => {
    const disparador = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.getAttribute('role') === 'combobox' || b.hasAttribute('aria-haspopup'))
    disparador?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    disparador?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
    disparador?.click()
  })
  await pagina.waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, { timeout: 10000 })
  await pagina.evaluate(() => { document.querySelector('[role="option"]')?.click() })

  await clicPorTexto(pagina, 'Ver qué se va a copiar')
  await pagina.waitForFunction(
    () => document.querySelector('[role="dialog"] [role="status"]') !== null,
    { timeout: 15000 }
  )

  const resumen = await pagina.evaluate(() =>
    document.querySelector('[role="dialog"] [role="status"]')?.textContent?.trim() ?? ''
  )
  assert.match(resumen, /copiar|no tiene tareas|ya están/, `Resumen inesperado: "${resumen}"`)

  // --- Archivar sigue deshabilitado mientras el informe no diga que está listo.
  const archivarActivo = await pagina.evaluate(() => {
    const boton = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => (b.textContent ?? '').startsWith('Archivar'))

    return boton === undefined ? null : !boton.disabled
  })
  assert.equal(archivarActivo, false, 'Archivar no puede estar habilitado antes de importar')

  console.log(`Importar tareas: menú, diálogo, validación e informe OK — "${resumen}"`)
} finally {
  await navegador.close()
}
