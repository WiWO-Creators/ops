import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Recorre el ciclo de la jornada contra Next y la API **real** del board.
 *
 * No usa el mock: `me/jornada`, `live` y `projects/{id}/timer` no existen ahí, y lo que esta prueba
 * comprueba —que abrir jornada exija Proyecto y que cerrarla pase por el modal— vive justamente en
 * esas rutas.
 *
 * Requiere el build de producción servido (`pnpm build && pnpm start --port 3011`) y la API en
 * `API_BASE`. Con `pnpm dev` no sirve: varios chunks se sirven con 403, la página no hidrata y
 * ningún clic responde, lo que da un falso negativo que parece un bug del componente.
 *
 * `JORNADA_TEST_URL`, `JORNADA_TEST_EMAIL` y `JORNADA_TEST_PASSWORD` cambian origen y sesión.
 */
const destino = new URL(process.env.JORNADA_TEST_URL ?? 'http://localhost:3011')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/** Clic por `evaluate`: `locator.click()` se cuelga en este entorno. */
async function clicPorTexto (pagina, texto) {
  const encontrado = await pagina.evaluate((buscado) => {
    const nodos = [...document.querySelectorAll('button, a, [role="radio"], [role="option"]')]
    const objetivo = nodos.find((n) => (n.textContent ?? '').trim().includes(buscado))
    if (objetivo === undefined) return false
    objetivo.click()

    return true
  }, texto)

  assert.ok(encontrado, `No se encontró nada que dijera "${texto}"`)
}

/** El texto de la página, para afirmar sobre lo que se ve y no sobre la maqueta. */
const texto = async (pagina) => await pagina.evaluate(() => document.body.innerText)

try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1100 } })

  const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: {
      email: process.env.JORNADA_TEST_EMAIL ?? 'dev@wiwo.local',
      password: process.env.JORNADA_TEST_PASSWORD ?? 'Prueba123!'
    }
  })
  assert.equal(respuesta.status(), 200, `No se pudo iniciar sesión: ${respuesta.status()}`)

  const pagina = await contexto.newPage()

  // --- El título de módulo se pinta con el degradado y su barra.
  await pagina.goto(new URL('/live', destino).href, { waitUntil: 'networkidle' })

  const encabezado = await pagina.evaluate(() => {
    const h1 = document.querySelector('h1')
    const pintado = h1?.querySelector('.texto-gradiente-animado')
    if (pintado === null || pintado === undefined) return null

    const barra = h1?.parentElement?.querySelector('[aria-hidden="true"]')
    const estilo = getComputedStyle(pintado)

    return {
      titulo: (h1?.textContent ?? '').trim(),
      recortado: estilo.webkitBackgroundClip === 'text' || estilo.backgroundClip === 'text',
      degradado: estilo.backgroundImage.includes('gradient'),
      barra: barra === null || barra === undefined ? null : getComputedStyle(barra).backgroundImage
    }
  })

  assert.notEqual(encabezado, null, 'El título de /live no usa el encabezado de módulo')
  assert.equal(encabezado.titulo, 'En vivo')
  assert.ok(encabezado.recortado, 'El degradado no está recortado sobre el texto')
  assert.ok(encabezado.degradado, 'El título no tiene degradado')
  assert.ok(encabezado.barra?.includes('gradient'), `La barra no lleva degradado: ${encabezado.barra}`)

  // --- La prueba parte de cero: si quedó una jornada abierta de antes, se cierra por el modal.
  // Sin esto la prueba depende del estado que dejó la corrida anterior, que es la forma más rápida
  // de tener una prueba que falla sin que nada esté roto.
  if ((await texto(pagina)).includes('Cerrar jornada')) {
    await clicPorTexto(pagina, 'Cerrar jornada')
    await pagina.waitForSelector('[role="dialog"]', { timeout: 10000 })
    await clicPorTexto(pagina, 'Confirmar')
    await pagina.waitForFunction(
      () => document.body.innerText.includes('Abrir jornada'),
      { timeout: 15000 }
    )

    // Recarga tras el cierre: el diálogo deja su portal y su combo en el documento, y el siguiente
    // `[role="option"]` que se busque puede ser el de ese portal muerto y no el del control.
    await pagina.goto(new URL('/live', destino).href, { waitUntil: 'networkidle' })
  }

  // --- Sin jornada abierta, el control no deja abrirla sin elegir Proyecto.
  const sinElegir = await pagina.evaluate(() => {
    const botones = [...document.querySelectorAll('button')]
    const abrir = botones.find((b) => (b.textContent ?? '').includes('Abrir jornada'))

    return abrir === undefined ? null : { texto: abrir.textContent.trim(), inerte: abrir.disabled }
  })

  assert.notEqual(sinElegir, null, `No se encontró el botón de abrir jornada. Pantalla: ${(await texto(pagina)).slice(0, 400)}`)
  assert.ok(sinElegir.inerte, 'Se puede abrir la jornada sin elegir Proyecto: el medidor no es obligatorio')

  // --- Al elegir Proyecto, el botón se habilita y abre jornada + medidor de una vez.
  await clicPorTexto(pagina, 'Elige un proyecto')
  await pagina.waitForSelector('[role="option"]', { timeout: 10000 })
  await pagina.evaluate(() => { document.querySelector('[role="option"]')?.click() })
  await pagina.waitForFunction(() => {
    const abrir = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Abrir jornada'))

    return abrir !== undefined && !abrir.disabled
  }, { timeout: 10000 })

  await clicPorTexto(pagina, 'Abrir jornada')
  await pagina.waitForFunction(
    () => document.body.innerText.includes('Cerrar jornada'),
    { timeout: 15000 }
  )

  // --- Con medidor de Proyecto y sin Tarea, el control lo dice y ofrece elegirla.
  const conJornada = await texto(pagina)
  assert.match(conJornada, /Tarea/, 'El control no menciona la Tarea que falta elegir')

  // --- Cerrar la jornada abre el modal obligatorio, con el resumen.
  await clicPorTexto(pagina, 'Cerrar jornada')
  await pagina.waitForSelector('[role="dialog"]', { timeout: 10000 })

  const modal = await pagina.evaluate(() => {
    const dialogo = document.querySelector('[role="dialog"]')

    return {
      texto: dialogo?.innerText ?? '',
      botones: [...(dialogo?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim())
    }
  })

  assert.ok(modal.botones.some((b) => b.includes('Seguir trabajando')), `Sin salida sin cerrar: ${modal.botones.join(' | ')}`)
  assert.ok(modal.botones.some((b) => b.includes('Confirmar')), `Sin confirmación de cierre: ${modal.botones.join(' | ')}`)

  // --- Obligatorio: `Escape` no lo cierra.
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(400)
  assert.ok(
    await pagina.evaluate(() => document.querySelector('[role="dialog"]') !== null),
    'El modal de cierre se cierra con Escape: no es obligatorio'
  )

  // --- Y cierra de verdad al confirmar.
  await clicPorTexto(pagina, 'Confirmar')
  await pagina.waitForFunction(
    () => document.body.innerText.includes('Sin jornada abierta') || document.body.innerText.includes('Abrir jornada'),
    { timeout: 15000 }
  )

  // --- El Inicio recuerda iniciar la jornada, ahora que no hay ninguna.
  await pagina.goto(new URL('/inicio', destino).href, { waitUntil: 'networkidle' })
  await pagina.waitForFunction(
    () => document.body.innerText.includes('jornada'),
    { timeout: 15000 }
  )
  assert.match(await texto(pagina), /jornada/i, 'El Inicio no recuerda nada sobre la jornada')

  console.log('OK: jornada, medidor obligatorio, modal de cierre y recordatorio del Inicio')
} finally {
  await navegador.close()
}
