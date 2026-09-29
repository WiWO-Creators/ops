import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Recorre el modo administración de Organización en un servidor local: la redirección desde
 * Accesos, la salud, el filtro de personas, el panel lateral con su "¿Por qué ve esto?", una
 * escritura real y su rastro en el historial.
 *
 * Configuración: ORG_TEST_URL, ORG_TEST_EMAIL/PASSWORD o ORG_TEST_STORAGE_STATE, ORG_TEST_PERSONA y
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE. Requiere
 * una sesión de superadministración contra un mock o una base de prueba: **escribe** (y deshace lo
 * que escribió), así que no se apunta a producción. Termina con código distinto de cero ante errores
 * de React o comportamiento incorrecto.
 */
const base = new URL(process.env.ORG_TEST_URL ?? 'http://localhost:3109')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Solo se permite un servidor local de prueba.')
const estado = process.env.ORG_TEST_STORAGE_STATE
const correo = process.env.ORG_TEST_EMAIL ?? 'ana@wiwo.me'
const clave = process.env.ORG_TEST_PASSWORD ?? 'mock1234'
const buscada = process.env.ORG_TEST_PERSONA ?? 'Carla Méndez'

/** Clic por `evaluate`: `locator.click()` se cuelga en este panel por las capas de superposición. */
async function clicar (locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 15000 })
  await locator.first().evaluate((elemento) => { elemento.click() })
}

/**
 * Espera a que el panel termine de guardar: Guardar vuelve a quedar deshabilitado cuando el
 * formulario coincide con lo guardado y deja de estar ocupado (mientras guarda también está
 * deshabilitado, con `aria-busy`). Mientras guarda, el panel no se deja cerrar.
 */
async function esperarGuardado (boton) {
  const limite = Date.now() + 15000

  await new Promise((resolver) => setTimeout(resolver, 100))

  while (!(await boton.isDisabled()) || await boton.getAttribute('aria-busy') === 'true') {
    assert.ok(Date.now() < limite, 'El guardado no terminó a tiempo')
    await new Promise((resolver) => setTimeout(resolver, 200))
  }
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, storageState: estado })

  if (!estado) {
    const sesion = await contexto.request.post(new URL('/api/sesion', base).href, {
      data: { email: correo, password: clave },
      maxRedirects: 0
    })
    assert.ok(sesion.ok(), `Falló la sesión local de prueba: HTTP ${sesion.status()}.`)
  }

  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error' && /react|hydration|hydrating|unique.*key/i.test(mensaje.text())) {
      errores.push(mensaje.text())
    }
  })

  async function cerrarJornada () {
    const jornada = pagina.getByRole('dialog').filter({ hasText: /jornada/i })
    await pagina.waitForTimeout(800)
    if (await jornada.count()) {
      await pagina.keyboard.press('Escape')
      await jornada.first().waitFor({ state: 'detached', timeout: 15000 })
    }
  }

  // --- 1. Accesos redirige a la pestaña Personas ---------------------------------
  await pagina.goto(new URL('/administracion/accesos', base).href)
  await cerrarJornada()
  assert.equal(new URL(pagina.url()).pathname, '/equipo/jerarquia')
  assert.equal(new URL(pagina.url()).searchParams.get('tab'), 'personas')
  await pagina.getByRole('heading', { name: 'Organización', level: 1 }).waitFor({ timeout: 20000 })
  assert.equal(await pagina.getByRole('tab', { name: 'Personas', selected: true }).count(), 1)
  assert.equal(await pagina.getByRole('region', { name: 'Salud del organigrama' }).count(), 1)

  // --- 2. El filtro recorta en el cliente --------------------------------------
  await pagina.getByRole('searchbox', { name: 'Buscar una persona' }).or(pagina.getByLabel('Buscar una persona')).first().fill(buscada.split(' ')[0])
  const fila = pagina.getByRole('row').filter({ hasText: buscada })
  await fila.first().waitFor({ timeout: 15000 })
  assert.equal(new URL(pagina.url()).searchParams.get('buscar'), null, 'El filtro no viaja a la URL: la re-resolvería en el servidor')

  // --- 3. El panel lateral y el "¿Por qué ve esto?" ----------------------------
  await clicar(fila.getByRole('cell').nth(1))
  const panel = pagina.getByRole('dialog').filter({ hasText: buscada })
  await panel.getByText('¿Por qué ve esto?').waitFor({ timeout: 15000 })
  await panel.getByText('Reporta a').waitFor({ timeout: 15000 })

  // --- 4. Una escritura real, y su rastro en el historial ----------------------
  const interruptor = panel.getByRole('switch', { name: `Coordinación multiárea de ${buscada}` })
  const antes = await interruptor.getAttribute('aria-checked')
  const guardar = panel.getByRole('button', { name: 'Guardar' })

  await clicar(interruptor)
  assert.equal(await guardar.isDisabled(), false, 'Un cambio habilita Guardar')
  await clicar(guardar)
  await esperarGuardado(guardar)
  await pagina.keyboard.press('Escape')

  await clicar(pagina.getByRole('tab', { name: 'Historial' }))
  const historial = pagina.getByRole('tabpanel')
  await historial.getByText(buscada).first().waitFor({ timeout: 15000 })
  await historial.getByText('Coordina varias áreas').first().waitFor({ timeout: 15000 })

  // Deshace lo escrito para no dejar el fixture movido.
  await clicar(pagina.getByRole('tab', { name: 'Personas' }))
  await clicar(pagina.getByRole('row').filter({ hasText: buscada }).getByRole('cell').nth(1))
  const deNuevo = pagina.getByRole('dialog').filter({ hasText: buscada })
  const interruptorDeNuevo = deNuevo.getByRole('switch', { name: `Coordinación multiárea de ${buscada}` })
  await interruptorDeNuevo.waitFor({ timeout: 15000 })
  assert.notEqual(await interruptorDeNuevo.getAttribute('aria-checked'), antes, 'El cambio quedó guardado')
  await clicar(interruptorDeNuevo)
  await clicar(deNuevo.getByRole('button', { name: 'Guardar' }))
  await esperarGuardado(deNuevo.getByRole('button', { name: 'Guardar' }))

  // --- 5. Sistema lista los roles ---------------------------------------------
  await pagina.keyboard.press('Escape')
  await clicar(pagina.getByRole('tab', { name: 'Sistema' }))
  await pagina.getByRole('tabpanel').getByText(/superadmin/i).first().waitFor({ timeout: 15000 })

  assert.deepEqual(errores, [], `Errores en la página:\n${errores.join('\n')}`)
  console.log('organizacion.browser: ok')
} finally {
  await navegador.close()
}
