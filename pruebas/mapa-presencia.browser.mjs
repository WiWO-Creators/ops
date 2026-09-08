import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Comprueba el selector de actividad, identidades, ramas y desplazamiento móvil en un servidor local.
 * Configuración: MAPA_TEST_URL, MAPA_TEST_EMAIL/PASSWORD o MAPA_TEST_STORAGE_STATE y
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE. Requiere una sesión superadmin y presencia de prueba con ramas.
 * Termina con código distinto de cero ante falta de datos, errores de React o comportamiento incorrecto.
 * No modifica datos: bloquea escrituras del navegador; únicamente permite crear la sesión de prueba.
 */
const destino = new URL(process.env.MAPA_TEST_URL ?? 'http://localhost:3121/auditoria')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo se permite un servidor local de prueba.')
assert.ok(['http:', 'https:'].includes(destino.protocol), 'La URL debe usar HTTP o HTTPS.')
if (destino.pathname === '/') destino.pathname = '/auditoria'
const correo = process.env.MAPA_TEST_EMAIL
const clave = process.env.MAPA_TEST_PASSWORD
assert.equal(Boolean(correo), Boolean(clave), 'Configura MAPA_TEST_EMAIL y MAPA_TEST_PASSWORD juntos.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: process.env.MAPA_TEST_STORAGE_STATE
  })
  await contexto.route('**/*', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method()) ||
      (peticion.isNavigationRequest() && url.origin !== destino.origin)) {
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
  const selector = pagina.getByRole('group', { name: 'Vista de actividad', exact: true })
  await selector.waitFor({ timeout: 15000 }).catch((error) => {
    throw new Error('No aparece el selector: necesita sesión superadmin local y datos de presencia de prueba.', { cause: error })
  })
  const arbol = pagina.getByRole('list', { name: 'Actividad por cliente, proyecto y tarea', exact: true })
  const mapa = pagina.getByRole('region', { name: 'Mapa de actividad por cliente, proyecto y tarea', exact: true })
  assert.ok(await arbol.isVisible(), 'Árbol debe ser la vista inicial.')
  assert.equal(await mapa.isVisible(), false, 'Mapa no debe estar visible inicialmente.')
  const personas = await arbol.locator('[data-persona-id]').evaluateAll((filas) => filas.map((fila) => ({
    id: fila.dataset.personaId,
    nombre: fila.innerText.trim().split('\n')[0]
  })))
  assert.ok(personas.length > 0, 'Faltan datos de prueba: requiere al menos una persona activa.')

  await selector.getByRole('button', { name: 'Mapa', exact: true }).click()
  await mapa.waitFor()
  assert.equal(await arbol.isVisible(), false)
  for (const persona of personas) {
    const fila = mapa.locator(`[data-persona-id="${persona.id}"]`)
    assert.equal(await fila.count(), 1, `Persona ausente o duplicada en mapa: ${persona.nombre}.`)
    assert.ok((await fila.innerText()).includes(persona.nombre), `Nombre perdido: ${persona.nombre}.`)
  }

  const rama = mapa.locator('li[data-nodo-presencia]').filter({
    has: pagina.locator(':scope > ul')
  }).first()
  assert.ok(await rama.count(), 'Faltan datos de prueba: requiere una rama con descendientes.')
  const tarjeta = rama.locator(':scope > article')
  assert.match(await tarjeta.getAttribute('aria-label') ?? '', /^(cliente|proyecto|tarea): .+/i)
  const hijos = rama.locator(':scope > ul')
  const contraer = tarjeta.getByRole('button', { name: /^Contraer / })
  assert.equal(await contraer.getAttribute('aria-expanded'), 'true')
  await contraer.click()
  assert.equal(await hijos.isVisible(), false)
  const expandir = tarjeta.getByRole('button', { name: /^Expandir / })
  assert.equal(await expandir.getAttribute('aria-expanded'), 'false')
  await expandir.click()
  assert.ok(await hijos.isVisible())

  await selector.getByRole('button', { name: 'Árbol', exact: true }).click()
  for (const persona of personas) {
    assert.ok((await arbol.locator(`[data-persona-id="${persona.id}"]`).innerText()).includes(persona.nombre))
  }
  await selector.getByRole('button', { name: 'Mapa', exact: true }).click()
  await pagina.setViewportSize({ width: 390, height: 844 })
  const medidas = await mapa.evaluate((elemento) => {
    const estilo = getComputedStyle(elemento)
    elemento.scrollLeft = elemento.scrollWidth
    return {
      overflow: estilo.overflowX,
      ancho: elemento.clientWidth,
      contenido: elemento.scrollWidth,
      desplazado: elemento.scrollLeft,
      pagina: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }
  })
  assert.ok(['auto', 'scroll'].includes(medidas.overflow), 'El mapa necesita desplazamiento horizontal propio.')
  assert.ok(medidas.contenido > medidas.ancho && medidas.desplazado > 0, 'No se pudo desplazar el mapa móvil.')
  assert.ok(medidas.pagina <= medidas.viewport + 1, 'El mapa desborda el viewport móvil.')
  await pagina.route('**/api/bff/presence', (ruta) => ruta.fulfill({ json: { data: [] } }))
  await pagina.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await pagina.getByText('Nadie conectado en este momento', { exact: true }).waitFor()
  await selector.getByRole('button', { name: 'Mapa', exact: true }).click()
  assert.ok(await pagina.getByText('Nadie conectado en este momento', { exact: true }).isVisible())
  assert.deepEqual(errores, [], 'Errores de JavaScript o React durante la comprobación.')
  console.info('Mapa de presencia: selector, personas, ramas y móvil correctos.')
} finally {
  await navegador.close()
}
