import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { ESPACIOS } from '../mock/datos.js'

/**
 * Recorre la pestaña Meeting Paper contra Next y la API mock locales.
 *
 * Requiere `pnpm mock` y `pnpm dev` levantados. `ACTA_TEST_URL` cambia el origen,
 * `ACTA_TEST_EMAIL`/`ACTA_TEST_PASSWORD` la sesión.
 *
 * Dos cosas son específicas de este entorno y no adornos:
 *   - Los clics van por `evaluate` y no con `locator.click()`, que acá se cuelga.
 *   - El micrófono se inyecta con los flags de dispositivo falso de Chromium; sin eso `getUserMedia`
 *     abre un diálogo del sistema que ninguna prueba puede contestar.
 */
const destino = new URL(process.env.ACTA_TEST_URL ?? 'http://localhost:3010')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
})

/** Clic por `evaluate`: `locator.click()` se cuelga en este entorno. */
async function clicPorTexto (pagina, texto) {
  const encontrado = await pagina.evaluate((buscado) => {
    const nodos = [...document.querySelectorAll('button, a, [role="radio"]')]
    const objetivo = nodos.find((n) => (n.textContent ?? '').trim().includes(buscado))
    if (objetivo === undefined) return false
    objetivo.click()

    return true
  }, texto)

  assert.ok(encontrado, `No se encontró nada que decir "${texto}"`)
}

try {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1100 },
    permissions: ['microphone']
  })

  const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: {
      email: process.env.ACTA_TEST_EMAIL ?? 'ana@wiwo.me',
      password: process.env.ACTA_TEST_PASSWORD ?? 'mock1234'
    }
  })
  assert.equal(respuesta.status(), 200, 'No se pudo iniciar sesión en el mock')

  const pagina = await contexto.newPage()
  const espacio = ESPACIOS[0]

  // --- La pestaña existe, se llama Meeting Paper, y las Notas volvieron a su nombre.
  await pagina.goto(new URL(`/espacios/${espacio.id}?tab=actas`, destino).href, { waitUntil: 'networkidle' })

  const pestanas = await pagina.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((t) => (t.textContent ?? '').trim())
  )
  assert.ok(pestanas.includes('Meeting Paper'), `Falta la pestaña: ${pestanas.join(', ')}`)
  assert.ok(pestanas.includes('Notas'), `Las Notas no volvieron a su nombre: ${pestanas.join(', ')}`)

  // --- Generar un acta, viendo el texto aparecer.
  await clicPorTexto(pagina, 'Nuevo Meeting Paper')
  await pagina.waitForFunction(() => document.body.textContent?.includes('Apuntes de la reunión'), { timeout: 10000 })

  await pagina.evaluate(() => {
    const area = document.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(area, 'Reunión con Acme. Se acordó entregar el sitio el 30 de septiembre.')
    area?.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await clicPorTexto(pagina, 'Escribir el Meeting Paper')

  // Mientras se genera, lo que se ve es TEXTO PLANO: pintar HTML a medias rompería el documento.
  await pagina.waitForFunction(() => document.body.textContent?.includes('Escribiendo el Meeting Paper'), { timeout: 10000 })
  const durante = await pagina.evaluate(() => document.body.innerHTML)
  assert.ok(!durante.includes('&lt;h1&gt;'), 'El avance no debe mostrar etiquetas escapadas')

  // Al terminar, el acta ya está guardada y se abre.
  await pagina.waitForFunction(() => document.body.textContent?.includes('Volver a los Meeting Papers'), { timeout: 30000 })
  assert.match(pagina.url(), /acta=\d+/, 'El acta abierta tiene que quedar en la URL')

  // --- El acta se pinta dentro del iframe aislado, nunca en la página.
  const marco = await pagina.evaluate(() => {
    const iframe = document.querySelector('iframe')

    return iframe === null ? null : { sandbox: iframe.getAttribute('sandbox'), tieneSrcDoc: iframe.hasAttribute('srcdoc') }
  })
  assert.notEqual(marco, null, 'El visor tiene que ser un iframe')
  assert.equal(marco.sandbox, '', 'El iframe tiene que ir con sandbox vacío')
  assert.ok(marco.tieneSrcDoc)

  const html = await pagina.frameLocator('iframe').locator('body').innerHTML()
  assert.ok(html.includes('Meeting Paper'), 'El acta no llegó al iframe')

  // --- El editor se carga recién al corregir: es el chunk de 415 KB que no debe pagar quien solo lee.
  await clicPorTexto(pagina, 'Corregir')
  await pagina.waitForFunction(() => document.querySelector('.ProseMirror') !== null, { timeout: 20000 })

  // --- Volver al listado y ver el acta recién creada.
  await clicPorTexto(pagina, 'Descartar cambios')
  await clicPorTexto(pagina, 'Volver a los Meeting Papers')
  await pagina.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 0, { timeout: 15000 })

  const filas = await pagina.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((f) => (f.textContent ?? '').trim())
  )
  assert.ok(filas.length >= 1, 'El acta generada tiene que aparecer en el listado')

  // --- La grabación suelta el micrófono al cambiar de pestaña.
  //
  // Es el bug portado de MeetingMatico: allá las pistas solo se detienen en `onstop`, así que
  // desmontar el componente grabando deja la luz del micrófono encendida hasta cerrar el navegador.
  // Acá desmontar es cambiar de pestaña, o sea que pasa todo el tiempo.
  await pagina.goto(new URL(`/espacios/${espacio.id}?tab=actas&acta=nuevo`, destino).href, { waitUntil: 'networkidle' })

  // Se envuelve `getUserMedia` para quedarse con las pistas y poder mirar su estado después.
  await pagina.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.__pistas = []
    navigator.mediaDevices.getUserMedia = async (opciones) => {
      const flujo = await original(opciones)
      window.__pistas.push(...flujo.getTracks())

      return flujo
    }
  })

  await clicPorTexto(pagina, 'Grabar')
  await pagina.evaluate(() => { document.querySelector('[data-prueba=grabar]')?.click() })
  await pagina.waitForFunction(() => window.__pistas?.length > 0, { timeout: 15000 })
  await pagina.waitForFunction(() => document.body.textContent?.includes('Detener'), { timeout: 10000 })

  const grabando = await pagina.evaluate(() => window.__pistas.map((p) => p.readyState))
  assert.deepEqual(grabando, ['live'], 'El micrófono tiene que estar tomado mientras se graba')

  // Cambiar de pestaña desmonta la grabadora.
  await pagina.evaluate(() => {
    const tareas = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === 'Tareas')
    tareas?.click()
  })
  await pagina.waitForFunction(
    () => window.__pistas.every((p) => p.readyState === 'ended'),
    { timeout: 10000 }
  )

  const despues = await pagina.evaluate(() => window.__pistas.map((p) => p.readyState))
  assert.deepEqual(despues, ['ended'], 'El micrófono quedó tomado después de cambiar de pestaña')

  console.log('Meeting Paper: pestaña, generación en streaming, visor aislado, editor diferido y listado OK')
  console.log('  el micrófono se suelta al cambiar de pestaña')
  console.log(`  ${filas.length} acta(s) en la lista`)
} finally {
  await navegador.close()
}
