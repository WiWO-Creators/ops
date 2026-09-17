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
 * El caso sin soporte se fuerza borrando lo que haga falta: este navegador trae las dos cosas.
 *
 * La segunda parte prueba el respaldo, que es lo que usan Brave y los Chromium abiertos: el motor
 * falso falla con `network`, y de ahi el hook tiene que grabar, subir el audio a `POST /ia/dictado`
 * y escribir en el campo el texto que vuelve. `MediaRecorder` y `getUserMedia` tambien son dobles
 * —el Chromium de esta maquina ignora `--use-fake-device-for-media-capture`— y la subida se
 * intercepta con `page.route()`, asi la prueba no gasta GPU de Replicate.
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

/** Dobles de `MediaRecorder` y `getUserMedia`: el respaldo necesita grabar y aca no hay microfono. */
const GRABACION_FALSA = () => {
  class GrabadoraFalsa {
    static isTypeSupported () { return true }

    constructor (flujo, opciones) {
      this.mimeType = opciones?.mimeType ?? 'audio/webm'
      this.state = 'inactive'
      this.ondataavailable = null
      this.onstop = null
      window.__grabadoraDictado = this
    }

    start () {
      this.state = 'recording'
      // Un trozo con contenido: el hook descarta la grabacion vacia, y eso ya se prueba aparte.
      this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) })
    }

    stop () {
      this.state = 'inactive'
      this.onstop?.()
    }
  }

  window.MediaRecorder = GrabadoraFalsa
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop () { window.__pistaSoltada = true } }] }) }
  })
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
  const entrada = await contexto.request.post(new URL('/api/sesion', origen).href, {
    data: { email: process.env.DICTADO_TEST_EMAIL, password: process.env.DICTADO_TEST_PASSWORD }
  })
  assert.equal(entrada.status(), 200, 'No se pudo entrar con las credenciales de prueba.')

  // === Sin ningun camino: el boton no existe ===
  // Hay que quitar las dos cosas, no solo el reconocimiento: mientras el navegador pueda grabar,
  // el respaldo sirve y el boton tiene que estar. Solo sin ambas el dictado es imposible.
  const sinSoporte = await contexto.newPage()
  await sinSoporte.addInitScript(() => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    delete window.MediaRecorder
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })
  await sinSoporte.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  await sinSoporte.waitForTimeout(2500)
  await abrirChat(sinSoporte)
  assert.equal(
    await sinSoporte.locator('button[aria-label="Dictar la pregunta"]').count(), 0,
    'Sin reconocimiento y sin grabacion, el microfono no tiene que dibujarse.'
  )

  // Con grabacion pero sin reconocimiento —Firefox, el WebKit de iOS— el boton si esta: dicta por
  // el respaldo desde el primer intento.
  const soloRespaldo = await contexto.newPage()
  await soloRespaldo.addInitScript(() => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
  })
  await soloRespaldo.addInitScript(GRABACION_FALSA)
  await soloRespaldo.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  await abrirChat(soloRespaldo)
  assert.equal(
    await soloRespaldo.locator('button[aria-label="Dictar la pregunta"]').count(), 1,
    'Sin reconocimiento pero con grabacion, el dictado va por el respaldo.'
  )
  await soloRespaldo.close()
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

  await pagina.close()

  // === El respaldo: el motor del navegador no puede y el board transcribe ===
  const conRespaldo = await contexto.newPage()
  await conRespaldo.addInitScript(MOTOR_FALSO)
  await conRespaldo.addInitScript(GRABACION_FALSA)

  let subidas = 0
  await conRespaldo.route('**/api/bff/ia/dictado', async (ruta) => {
    subidas += 1
    const peticion = ruta.request()
    assert.equal(peticion.method(), 'POST', 'El dictado se sube por POST.')
    assert.match(
      peticion.headers()['content-type'] ?? '',
      /multipart\/form-data/,
      'El audio tiene que viajar como multipart, no como JSON.'
    )
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { texto: 'archiva el proyecto de mailings' } })
    })
  })

  await conRespaldo.goto(new URL('/inicio', origen).href, { waitUntil: 'domcontentloaded' })
  await abrirChat(conRespaldo)

  const campoRespaldo = conRespaldo.locator('textarea[aria-label="Tu pregunta"]')
  await escribir(conRespaldo, 'Nota:')

  await clicar(conRespaldo, 'button[aria-label="Dictar la pregunta"]')
  await conRespaldo.waitForTimeout(400)

  // El navegador declara la API pero no puede usarla: el mismo gesto tiene que terminar grabando.
  await conRespaldo.evaluate(() => { window.__motorDictado.onerror?.({ error: 'network' }) })
  await conRespaldo.locator('button[aria-label="Parar el dictado"]').waitFor({ timeout: 10000 })
  assert.ok(
    (await conRespaldo.locator('[role="status"]').allInnerTexts()).some((t) => t.includes('Grabando')),
    'Tras el fallo del motor, el respaldo tiene que estar grabando.'
  )
  // El aviso se cuenta solo dentro de la fila del microfono: el panel tiene otros `role="alert"`
  // que no son de esto.
  assert.equal(
    (await conRespaldo.locator('button[aria-label="Parar el dictado"] ~ [role="alert"]').allInnerTexts()).length, 0,
    'Un fallo que el respaldo resuelve no se le cuenta a la persona.'
  )

  await clicar(conRespaldo, 'button[aria-label="Parar el dictado"]')
  await conRespaldo.waitForFunction(
    () => document.querySelector('textarea[aria-label="Tu pregunta"]')?.value.includes('mailings'),
    null,
    { timeout: 15000 }
  )

  assert.equal(subidas, 1, 'El audio se sube una sola vez.')
  assert.equal(await campoRespaldo.inputValue(), 'Nota: archiva el proyecto de mailings',
    'El texto transcrito se pega despues de lo que ya estaba escrito.')
  assert.ok(await conRespaldo.evaluate(() => window.__pistaSoltada === true),
    'Al terminar hay que soltar el microfono, o queda el punto rojo en la pestaña.')

  // Con el motor ya descartado, el siguiente dictado va directo al respaldo y no reintenta.
  await clicar(conRespaldo, 'button[aria-label="Dictar la pregunta"]')
  await conRespaldo.locator('button[aria-label="Parar el dictado"]').waitFor({ timeout: 10000 })
  assert.ok(
    (await conRespaldo.locator('[role="status"]').allInnerTexts()).some((t) => t.includes('Grabando')),
    'El segundo dictado tiene que arrancar grabando: el motor del navegador ya se descartó.'
  )
  await clicar(conRespaldo, 'button[aria-label="Parar el dictado"]')
  await conRespaldo.waitForTimeout(1500)
  assert.equal(subidas, 2, 'El segundo dictado también se sube.')

  console.log('OK: el dictado escribe con el motor del navegador y, cuando no puede, con el respaldo del board.')
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
