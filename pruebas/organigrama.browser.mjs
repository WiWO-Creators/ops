import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Recorre el organigrama en un servidor local: el mapa, la entrada a un área, el árbol y una
 * reasignación real.
 *
 * Configuración: ORG_TEST_URL, ORG_TEST_EMAIL/PASSWORD o ORG_TEST_STORAGE_STATE y
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE. Requiere una sesión de superadministración —sin ella no hay
 * edición que probar— contra un mock o una base de prueba: **escribe**, así que no se apunta a
 * producción. Termina con código distinto de cero ante errores de React o comportamiento incorrecto.
 *
 * Reemplaza a `jerarquia.browser.mjs`, que recorría la pantalla de áreas que este organigrama
 * sustituyó.
 */
const destino = new URL(process.env.ORG_TEST_URL ?? 'http://localhost:3121/equipo/jerarquia')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo se permite un servidor local de prueba.')
assert.ok(['http:', 'https:'].includes(destino.protocol), 'La URL debe usar HTTP o HTTPS.')
if (destino.pathname === '/') destino.pathname = '/equipo/jerarquia'
const correo = process.env.ORG_TEST_EMAIL
const clave = process.env.ORG_TEST_PASSWORD
assert.equal(Boolean(correo), Boolean(clave), 'Configura ORG_TEST_EMAIL y ORG_TEST_PASSWORD juntos.')

/** Clic por `evaluate`: `locator.click()` se cuelga en este panel por las capas de superposición. */
async function clicar (locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 15000 })
  await locator.first().evaluate((elemento) => { elemento.click() })
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: process.env.ORG_TEST_STORAGE_STATE
  })
  // Sólo el propio servidor: la prueba escribe, y una navegación fuera de origen sería otra cosa.
  await contexto.route('**/*', async (ruta) => {
    const peticion = ruta.request()

    if (peticion.isNavigationRequest() && new URL(peticion.url()).origin !== destino.origin) {
      await ruta.abort()

      return
    }

    await ruta.continue()
  })

  if (correo && clave) {
    const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
      data: { email: correo, password: clave },
      maxRedirects: 0
    })
    assert.ok(respuesta.ok(), `Falló la sesión local de prueba: HTTP ${respuesta.status()}.`)
  }

  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error' && /react|hydration|hydrating|unique.*key/i.test(mensaje.text())) {
      errores.push(mensaje.text())
    }
  })

  await pagina.goto(destino.href)

  // Al entrar, el panel abre solo el diálogo de la jornada. Es un modal de verdad: mientras esté
  // abierto marca el resto de la página con `aria-hidden`, así que sin cerrarlo ninguna consulta por
  // rol encuentra nada — y eso es correcto, no un fallo del organigrama.
  //
  // Se ESPERA a que aparezca en vez de mirar si ya está: monta después de la primera pintura, y
  // preguntar de inmediato daba siempre cero y dejaba el modal abierto encima de todo lo que sigue.
  const jornada = pagina.getByRole('dialog').filter({ hasText: 'jornada' })
  await jornada.first().waitFor({ timeout: 15000 }).catch(() => {})
  if (await jornada.count()) {
    await pagina.keyboard.press('Escape')
    await jornada.first().waitFor({ state: 'detached', timeout: 15000 })
  }

  // --- 1. El mapa pinta ---------------------------------------------------
  const tarjetaSinArea = pagina.getByRole('button').filter({ hasText: 'Sin área' })
  await tarjetaSinArea.first().waitFor({ timeout: 20000 })

  const tarjetas = pagina.getByRole('listitem')
  assert.ok(await tarjetas.count() > 1, 'El mapa tiene que traer varias áreas más la de "Sin área".')

  const analytics = pagina.getByRole('button').filter({ hasText: 'Analytics' }).first()
  assert.ok(await analytics.count(), 'Falta el área Analytics del fixture.')
  assert.match(await analytics.innerText(), /Dirige /, 'La tarjeta tiene que decir quién dirige.')
  assert.match(await analytics.innerText(), /leads?$/m, 'La tarjeta tiene que decir cuántos leads.')

  // --- 2. Se entra a un área y el árbol se dibuja -------------------------
  await clicar(analytics)
  const volver = pagina.getByRole('button', { name: 'Todas las áreas' })
  await volver.waitFor({ timeout: 15000 })

  const cajas = pagina.locator('li button[draggable="true"]')
  const cuantas = await cajas.count()
  assert.ok(cuantas > 0, 'El árbol del área tiene que dibujar al menos una caja.')

  // El color del borde es el del área, y no el mismo para todas: es la pieza que hace visible que
  // una caja cuelga de un jefe de otra área.
  const bordes = new Set(await cajas.evaluateAll(
    (nodos) => nodos.map((nodo) => getComputedStyle(nodo).borderTopColor)
  ))
  assert.ok(bordes.size > 1, 'Con gente de dos áreas en el árbol, los bordes no pueden ser todos iguales.')

  // Las líneas son pseudo-elementos del módulo CSS: si no llegaron, el árbol se ve como una lista.
  const hayLineas = await pagina.locator('li').first().evaluate(
    (nodo) => getComputedStyle(nodo, '::after').content !== 'none' ||
      getComputedStyle(nodo, '::before').content !== 'none'
  )
  assert.ok(hayLineas, 'Faltan los conectores del árbol.')

  // --- 3. Volver al mapa sin recargar -------------------------------------
  const antes = await pagina.evaluate(() => performance.getEntriesByType('navigation').length)
  await clicar(volver)
  await tarjetaSinArea.first().waitFor({ timeout: 15000 })
  assert.equal(
    await pagina.evaluate(() => performance.getEntriesByType('navigation').length), antes,
    'Volver al mapa no puede recargar la página.'
  )

  // --- 4. Una reasignación escribe, y sólo con el teclado ------------------
  await clicar(analytics)
  await volver.waitFor({ timeout: 15000 })
  // La última caja es una hoja: la raíz ya está sin jefe y ahí "Sin jefe" no cambiaría nada.
  await clicar(cajas.last())

  const panel = pagina.getByRole('dialog')
  await panel.waitFor({ timeout: 15000 })
  assert.ok(await panel.getByText('Depende de').count(), 'El panel tiene que ofrecer el jefe de una lista.')
  assert.ok(await panel.getByText('Escalón').count(), 'El panel tiene que ofrecer el escalón.')
  assert.ok(await panel.getByText('Área').count(), 'El panel tiene que ofrecer el área.')

  const escritas = []
  pagina.on('response', (respuesta) => {
    if (respuesta.request().method() === 'PUT' && respuesta.url().includes('/api/bff/accesos/personas/')) {
      escritas.push(respuesta.status())
    }
  })

  // Se le cambia el jefe. Se elige la primera opción distinta de la que ya tiene —y no una fija—
  // para que la prueba se pueda correr dos veces seguidas: con el valor que ya está puesto no hay
  // cambio que guardar y el botón queda deshabilitado, que es lo correcto pero no lo que se prueba.
  // Todo el recorrido va con teclado a propósito: es la prueba de que arrastrar no es la única vía.
  const jefe = panel.getByRole('combobox').nth(1)
  const puesto = (await jefe.innerText()).trim()
  await jefe.focus()
  await pagina.keyboard.press('Enter')

  const opciones = pagina.getByRole('option')
  await opciones.first().waitFor({ timeout: 15000 })
  const textos = await opciones.allInnerTexts()
  const otra = textos.findIndex((texto) => texto.trim() !== puesto)
  assert.ok(otra >= 0, `El selector de jefe sólo ofrece lo que ya está puesto: ${textos.join(' / ')}.`)
  await clicar(opciones.nth(otra))

  const guardar = panel.getByRole('button', { name: 'Guardar' })
  assert.equal(await guardar.isDisabled(), false, 'Con un cambio puesto, Guardar tiene que habilitarse.')
  await guardar.focus()
  await pagina.keyboard.press('Enter')

  await panel.waitFor({ state: 'detached', timeout: 20000 })
  assert.deepEqual(escritas, [200], `La reasignación tenía que escribir un PUT con 200; fue ${escritas.join(', ') || 'ninguno'}.`)

  // --- 5. En pantalla angosta el layout no se rompe -----------------------
  await pagina.setViewportSize({ width: 390, height: 844 })
  await clicar(volver)
  await tarjetaSinArea.first().waitFor({ timeout: 15000 })
  const desborde = await pagina.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  assert.ok(desborde <= 1, `El mapa desborda ${desborde}px a lo ancho en 390px.`)

  assert.deepEqual(errores, [], `Errores en el navegador:\n${errores.join('\n')}`)
  console.log(`Organigrama verificado: ${cuantas} cajas, ${bordes.size} colores de borde, 1 reasignación escrita.`)
} finally {
  await navegador.close()
}
