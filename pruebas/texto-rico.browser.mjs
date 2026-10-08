import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica el editor de texto enriquecido y el presentador `Contenido` contra el taller de un Next
 * local ya construido (`/taller` no pide sesion). Se corre a mano, como el resto de los
 * `.browser.mjs`:
 *
 * ```bash
 * pnpm build && pnpm exec next start -p 3321 &
 * TEXTO_RICO_TEST_URL=http://localhost:3321 node pruebas/texto-rico.browser.mjs
 * ```
 *
 * Contra el build y no contra `next dev`: en desarrollo la pagina no hidrata a tiempo.
 *
 * Lo que comprueba es lo que no se puede ver desde `node --test`:
 *
 *   1. La barra tiene `role="toolbar"`, y negrita/lista marcan `aria-pressed` y salen en el HTML.
 *   2. El enlace se pone con un cuadro propio (sin `prompt()`), y `javascript:` se rechaza con aviso.
 *   3. Lo escrito se lee abajo con `Contenido`: enlaces con `rel="noopener noreferrer"` y sin
 *      etiquetas que la lista blanca no conoce.
 *   4. El contador de caracteres cuenta texto visible y marca el exceso con `aria-invalid`.
 *   5. Vaciar el editor vuelve a mostrar el estado vacio del presentador.
 */
const destino = new URL(process.env.TEXTO_RICO_TEST_URL ?? 'http://localhost:3321')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1100 } })
  const pagina = await contexto.newPage()
  const dialogos = []
  pagina.on('dialog', async (dialogo) => { dialogos.push(dialogo.type()); await dialogo.dismiss() })

  await pagina.goto(new URL('/taller', destino).href, { waitUntil: 'networkidle' })

  const barra = pagina.getByRole('toolbar', { name: 'Formato del texto' })
  await barra.waitFor({ state: 'visible', timeout: 15000 })
  const editor = pagina.getByRole('textbox', { name: 'Mensaje' })
  await editor.click()

  // 1. Formato por botones.
  await editor.pressSequentially('Hola ')
  await barra.getByRole('button', { name: 'Negrita' }).click()
  assert.equal(await barra.getByRole('button', { name: 'Negrita' }).getAttribute('aria-pressed'), 'true')
  await editor.pressSequentially('mundo')
  await barra.getByRole('button', { name: 'Negrita' }).click()
  assert.equal(await barra.getByRole('button', { name: 'Negrita' }).getAttribute('aria-pressed'), 'false')
  await editor.press('Enter')
  await barra.getByRole('button', { name: 'Lista con viñetas' }).click()
  await editor.pressSequentially('uno')
  await editor.press('Enter')
  await editor.pressSequentially('dos')
  assert.equal(await editor.locator('ul > li').count(), 2, 'Dos items de lista.')
  assert.equal(await editor.locator('strong').first().textContent(), 'mundo')

  // 2. Enlace con cuadro propio: una direccion peligrosa se rechaza, una valida se aplica.
  await editor.press('Enter')
  await editor.press('Enter')
  await barra.getByRole('button', { name: 'Enlace' }).click()
  const direccion = pagina.getByLabel('Dirección del enlace')
  await direccion.waitFor({ state: 'visible' })
  await direccion.fill('javascript:alert(1)')
  await direccion.press('Enter')
  assert.match(await pagina.getByRole('alert').filter({ hasText: 'http, https o mailto' }).textContent(), /http/)
  await direccion.fill('wiwo.me/ayuda')
  await direccion.press('Enter')
  await direccion.waitFor({ state: 'detached' })
  assert.equal(await editor.locator('a').first().getAttribute('href'), 'https://wiwo.me/ayuda')
  assert.deepEqual(dialogos, [], 'No debe abrirse prompt() ni alert().')

  // 3. Lo que ve quien lo recibe.
  const vista = pagina.locator('.texto-rico').filter({ hasText: 'Hola mundo' }).last()
  assert.equal(await vista.locator('a[href="https://wiwo.me/ayuda"]').getAttribute('rel'), 'noopener noreferrer')
  assert.equal(await vista.locator('a').first().getAttribute('target'), '_blank')
  assert.equal(await vista.locator('strong').first().textContent(), 'mundo')
  assert.equal(await vista.locator('li').count(), 2)
  assert.equal(await vista.locator('script, iframe, img').count(), 0)

  // 4. Contador: texto visible, no HTML; el exceso marca el campo.
  const contador = pagina.getByText(/\/ 500$/)
  assert.match(await contador.textContent(), /^\d+ \/ 500$/)
  await editor.press('Control+A')
  // `insertText` es un solo evento de entrada: 520 pulsaciones sueltas tardan mas que la prueba.
  await pagina.keyboard.insertText('x'.repeat(520))
  assert.equal(await editor.getAttribute('aria-invalid'), 'true')
  assert.match(await contador.textContent(), /^520 \/ 500$/)

  // 5. Vaciar devuelve el estado vacio del presentador.
  await editor.press('Control+A')
  await editor.press('Delete')
  await pagina.locator('[data-vista-previa]').waitFor({ state: 'visible' })
  assert.equal(await editor.getAttribute('aria-invalid'), null)

  console.log('texto-rico.browser: OK')
} finally {
  await navegador.close()
}
