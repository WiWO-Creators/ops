import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica el microfono del Thinking Orb contra un Next local ya levantado.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`:
 *
 * ```bash
 * DICTADO_TEST_URL=http://localhost:3099 \
 * DICTADO_TEST_EMAIL=dev@wiwo.local DICTADO_TEST_PASSWORD='...' \
 *   node pruebas/dictado.browser.mjs
 * ```
 *
 * El Chromium de Playwright declara `webkitSpeechRecognition` pero no puede reconocer nada —el
 * servicio de voz es de Google y los builds abiertos no traen credenciales—, asi que el motor se
 * reemplaza por un doble inyectado antes de que cargue la pagina. Eso es lo que hay que probar aca:
 * que lo parcial se pise en vez de acumularse, que al parar quede en el campo solo lo confirmado y
 * que un fallo del motor se explique. La calidad del reconocimiento no es cosa de esta prueba: la
 * hace el navegador.
 *
 * El caso sin soporte —Firefox, el WebKit de iOS— se fuerza borrando las dos propiedades: no se
 * puede confirmar con este navegador, que si las trae.
 *
 * Contra el build, no contra `next dev`: en desarrollo la pagina no hidrata a tiempo y el clic en el
 * microfono daria un falso negativo.
 */
const origen = new URL(process.env.DICTADO_TEST_URL ?? 'http://localhost:3099')
assert.ok(['localhost', '127.0.0.1'].includes(origen.hostname), 'Solo admite un servidor local.')
assert.ok(process.env.DICTADO_TEST_EMAIL && process.env.DICTADO_TEST_PASSWORD, 'Faltan credenciales de prueba.')

/** El doble del motor: guarda la instancia viva en `window.__motorDictado` para manejarla desde la prueba. */
const MOTOR_FALSO = () => {
  class MotorFalso {
    constructor () {
      this.lang = ''
      this.continuous = false
      this.interimResults = false
      this.onresult = null
      this.onerror = null
      this.onend = null
      window.__motorDictado = this
    }

    start () { this.arrancado = true }
    stop () { this.onend?.() }
    abort () { this.onend?.() }

    /** Emite un evento como el del motor real, con la lista indexada completa. */
    emitir (resultIndex, trozos) {
      const results = trozos.map(([texto, isFinal]) => ({ isFinal, 0: { transcript: texto } }))
      results.length = trozos.length
      this.onresult?.({ resultIndex, results })
    }
  }

  window.SpeechRecognition = MotorFalso
  window.webkitSpeechRecognition = MotorFalso
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
  const entrada = await contexto.request.post(new URL('/api/sesion', origen).href, {
    data: { email: process.env.DICTADO_TEST_EMAIL, password: process.env.DICTADO_TEST_PASSWORD }
  })
  assert.equal(entrada.status(), 200, 'No se pudo entrar con las credenciales de prueba.')

  // === Sin soporte del navegador: el boton no existe ===
  const sinSoporte = await contexto.newPage()
  await sinSoporte.addInitScript(() => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
  })
  await sinSoporte.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  await sinSoporte.waitForTimeout(2500)
  await abrirChat(sinSoporte)
  assert.equal(
    await sinSoporte.locator('button[aria-label="Dictar la pregunta"]').count(), 0,
    'Sin SpeechRecognition el microfono no tiene que dibujarse.'
  )
  await sinSoporte.close()

  // === Con soporte: dicta, corrige el parcial y deja lo confirmado ===
  const pagina = await contexto.newPage()
  await pagina.addInitScript(MOTOR_FALSO)
  await pagina.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(2500)
  await abrirChat(pagina)

  const campo = pagina.locator('textarea[aria-label="Tu pregunta"]')
  await escribir(pagina, 'Revisa el hito')
  assert.equal(await campo.inputValue(), 'Revisa el hito', 'No se pudo escribir a mano en el campo.')

  const microfono = pagina.locator('button[aria-label="Dictar la pregunta"]')
  assert.equal(await microfono.count(), 1, 'El microfono no aparecio con la API disponible.')
  await clicar(pagina, 'button[aria-label="Dictar la pregunta"]')
  await pagina.waitForTimeout(400)

  assert.equal(
    await pagina.evaluate(() => ({ lang: window.__motorDictado.lang, continuo: window.__motorDictado.continuous, parciales: window.__motorDictado.interimResults })).then(JSON.stringify),
    JSON.stringify({ lang: 'es-CL', continuo: true, parciales: true }),
    'El motor no quedo configurado para dictar en español y de corrido.'
  )
  assert.ok(
    (await pagina.locator('[role="status"]').allInnerTexts()).some((t) => t.includes('Escuchando')),
    'No avisa que el microfono esta abierto.'
  )

  // Primero una apuesta, despues la version corregida: la apuesta vieja no puede quedar en el campo.
  await pagina.evaluate(() => { window.__motorDictado.emitir(0, [['de la sema', false]]) })
  await pagina.waitForTimeout(200)
  assert.equal(await campo.inputValue(), 'Revisa el hito de la sema')

  await pagina.evaluate(() => { window.__motorDictado.emitir(0, [['de la semana pasada', false]]) })
  await pagina.waitForTimeout(200)
  assert.equal(await campo.inputValue(), 'Revisa el hito de la semana pasada',
    'El parcial se acumulo en vez de pisarse.')

  await pagina.evaluate(() => { window.__motorDictado.emitir(0, [['de la semana', true]]) })
  await pagina.evaluate(() => { window.__motorDictado.emitir(1, [['de la semana', true], ['y el sigui', false]]) })
  await pagina.waitForTimeout(200)
  assert.equal(await campo.inputValue(), 'Revisa el hito de la semana y el sigui')

  // Al parar, lo parcial muere y queda solo lo confirmado.
  await clicar(pagina, 'button[aria-label="Parar el dictado"]')
  await pagina.waitForTimeout(400)
  assert.equal(await campo.inputValue(), 'Revisa el hito de la semana',
    'Lo parcial quedo en el campo despues de parar.')
  assert.equal(await pagina.locator('button[aria-label="Dictar la pregunta"]').count(), 1,
    'El boton no volvio al estado de reposo.')

  // El permiso denegado se cuenta; parar a mano no.
  await clicar(pagina, 'button[aria-label="Dictar la pregunta"]')
  await pagina.waitForTimeout(300)
  await pagina.evaluate(() => { window.__motorDictado.onerror?.({ error: 'not-allowed' }); window.__motorDictado.onend?.() })
  await pagina.waitForTimeout(300)
  assert.ok(
    (await pagina.locator('[role="alert"]').allInnerTexts()).some((t) => t.includes('bloqueó el micrófono')),
    'El permiso denegado no se avisa.'
  )

  console.log('OK: el dictado del Thinking Orb escribe, corrige y se detiene como debe.')
} finally {
  await navegador.close()
}

/** Abre el panel del chat del orbe, que arranca cerrado en el armazon. */
async function abrirChat (pagina) {
  const abridor = 'button[aria-label="Preguntarle a Thinking Orb"]'
  await pagina.locator(abridor).waitFor({ state: 'attached', timeout: 20000 })
  await clicar(pagina, abridor)
  await pagina.locator('textarea[aria-label="Tu pregunta"]').waitFor({ state: 'attached', timeout: 20000 })
}

/**
 * Escribe en el campo como lo haria una persona.
 *
 * `fill()` asigna `value` por la via del navegador y React no siempre se entera; hay que usar el
 * setter del prototipo y disparar `input` a mano para que el estado del componente cambie.
 */
async function escribir (pagina, texto) {
  await pagina.evaluate((valor) => {
    const campo = document.querySelector('textarea[aria-label="Tu pregunta"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(campo, valor)
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  }, texto)
  await pagina.waitForTimeout(200)
}

/** `locator.click()` se cuelga en este proyecto: el clic va por `evaluate`. */
async function clicar (pagina, selector) {
  await pagina.evaluate((sel) => { document.querySelector(sel)?.click() }, selector)
}
