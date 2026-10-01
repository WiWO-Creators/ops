/**
 * Prueba de navegador del modo especial. Requiere el mock con `MOCK_MODO=halloween:2026-09-01:2026-11-30`
 * y Next apuntando a el:
 *   BASE=http://localhost:3410 node pruebas/modo-especial.browser.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const fallos = []
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FALLA'}  ${msg}`); if (!cond) fallos.push(msg) }

async function cookieDe (email, password) {
  const r = await fetch(`${BASE}/api/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  return r.headers.getSetCookie().find((c) => c.startsWith('ops_sesion=')).split(';')[0].slice('ops_sesion='.length)
}

// Calienta la ruta: la primera compilacion de `next dev` puede pasarse de la espera maxima de la
// lectura del modo, y esa primera pagina saldria sin modo (a proposito: la pagina vale mas que el adorno).
for (let i = 0; i < 2; i++) await fetch(`${BASE}/clave`)

const navegador = await chromium.launch()
const atributo = (pagina, nombre) => pagina.evaluate((n) => document.documentElement.getAttribute(n), nombre)
const apagar = (pagina) => pagina.locator('button[aria-label^="Apagar el modo"]')
const prender = (pagina) => pagina.locator('button[aria-label^="Prender el modo"]')

/** Cierra el aviso de "Abre tu jornada", que tapa la pagina y deja el resto fuera del arbol de accesibilidad. */
async function despejar (pagina) {
  await pagina.waitForTimeout(1500)
  if (await pagina.locator('[role=dialog]').count() > 0) {
    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(300)
  }
}
const marca = (pagina) => pagina.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--marca').trim())

async function contexto (opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 }, ...opciones })
  await ctx.addCookies([{ name: 'ops_sesion', value: await cookieDe('ana@wiwo.me', 'mock1234'), domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
  return ctx
}

// --- 1. Pagina publica de acceso: el modo se ve sin sesion ---
{
  const ctx = await navegador.newContext()
  const p = await ctx.newPage()
  await p.goto(`${BASE}/clave`, { waitUntil: 'domcontentloaded' })
  ok(await atributo(p, 'data-modo') === 'halloween', 'la pantalla de acceso lleva data-modo=halloween')
  ok(await atributo(p, 'data-modo-hasta') === '2026-11-30', 'publica el ultimo dia vigente')
  await ctx.close()
}

// --- 2. Panel: paleta, decoracion, entrada, interruptor ---
{
  const ctx = await contexto()
  const p = await ctx.newPage()
  await p.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-entrada-modo="telon"]', { timeout: 5000 })
  ok(true, 'la primera visita del dia muestra la entrada de Halloween')
  await p.waitForSelector('[data-entrada-modo="telon"]', { state: 'detached', timeout: 5000 })
  ok(true, 'la entrada se retira sola (<= 2 s)')

  ok(await p.locator('.decoracion-modo').isVisible(), 'la decoracion esta visible')
  ok(await p.locator('[data-murcielago]').count() === 3, 'hay tres murcielagos en la oleada')
  ok(await p.locator('[data-murcielago-colgado]').count() === 3, 'y tres colgados de la cabecera')
  ok(await p.locator('.decoracion-modo-tela').count() === 4, 'hay cuatro telarañas')
  ok(await p.locator('.decoracion-modo-arana').count() === 1, 'hay una araña colgando')
  ok(await p.locator('[data-brasa]').count() === 16, 'hay brasas')
  ok(await p.locator('[data-luz]').count() === 2, 'y dos calabazas con vela')
  // anime.js marca cada hilo con `pathLength` y le va moviendo el `stroke-dasharray` al dibujarlo.
  await p.waitForTimeout(500)
  const hilos = await p.evaluate(() => [...document.querySelectorAll('[data-hilo]')].filter((e) => e.getAttribute('pathLength') === '1000').length)
  ok(hilos === 44, `anime.js dibuja los 44 hilos de las telarañas (vio ${hilos})`)
  ok((await marca(p)).toLowerCase().includes('#5b2a86') || (await marca(p)).toLowerCase().includes('#ffb067'), 'la marca usa la paleta de Halloween')

  await p.reload({ waitUntil: 'domcontentloaded' })
  await despejar(p)
  ok(await p.locator('[data-entrada-modo="telon"]').count() === 0, 'la entrada no se repite el mismo dia')

  // Opt-out por persona
  const boton = apagar(p)
  ok(await boton.isVisible(), 'el selector ofrece apagar el modo')
  await boton.click()
  ok(await atributo(p, 'data-modo') === null, 'apagarlo quita data-modo')
  ok(!(await p.locator('.decoracion-modo').count()), 'apagarlo desmonta la decoracion')
  ok(await prender(p).isVisible(), 'queda el boton para prenderlo de nuevo')

  await p.reload({ waitUntil: 'domcontentloaded' })
  ok(await atributo(p, 'data-modo') === null, 'la preferencia sobrevive a la recarga, sin destello')
  await despejar(p)
  ok(await atributo(p, 'data-modo-vigente') === 'halloween', 'el modo sigue vigente para el resto')

  await prender(p).click()
  ok(await atributo(p, 'data-modo') === 'halloween', 'volver a prenderlo lo restaura')
  await ctx.close()
}

// --- 3. Menos movimiento: sin entrada y murcielagos quietos ---
{
  const ctx = await contexto({ reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-murcielago-colgado]', { state: 'attached', timeout: 8000 })
  await p.waitForTimeout(600)
  ok(await p.locator('[data-entrada-modo="telon"]').count() === 0, 'con menos movimiento no hay entrada')
  ok(await p.locator('[data-murcielago-colgado]').count() === 3, 'los murcielagos colgados estan')
  const quieto = await p.evaluate(() => getComputedStyle(document.querySelector('[data-murcielago-colgado]')).transform)
  ok(!quieto.includes('NaN') && quieto !== '', 'quietos, sin animar')
  ok(!(await p.locator('[data-murcielago]').first().isVisible()), 'la oleada de vuelo no se muestra')
  ok(!(await p.locator('[data-brasa]').first().isVisible()), 'ni las brasas')
  await ctx.close()
}

// --- 4. Huevo de pascua ---
{
  const ctx = await contexto()
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('wiwo-modo-entrada', new Date().toLocaleDateString('sv')))
  await p.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-logo]')
  await despejar(p)
  for (let i = 0; i < 5; i++) await p.locator('[data-logo]').first().click()
  await p.waitForSelector('[data-calabaza-lluvia]', { timeout: 2000 })
  ok(true, 'cinco clics en el logo hacen llover calabazas')
  await p.waitForSelector('[data-calabaza-lluvia]', { state: 'detached', timeout: 8000 })
  ok(true, 'la lluvia se retira sola')
  await ctx.close()
}

// --- 4b. Huevos de pascua: palabras secretas y piezas tocables ---
{
  const ctx = await contexto()
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('wiwo-modo-entrada', new Date().toLocaleDateString('sv')))
  await p.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-logo]')
  await despejar(p)

  // Con un campo de texto enfocado las letras no cuentan.
  await p.evaluate(() => { const i = document.createElement('input'); i.id = 'prueba'; document.body.appendChild(i); i.focus() })
  await p.keyboard.type('boo')
  ok(await p.locator('[data-susto]').count() === 0, 'escribir «boo» en un campo de texto no dispara nada')
  await p.evaluate(() => { document.getElementById('prueba')?.remove(); document.body.focus() })

  await p.keyboard.type('boo')
  await p.waitForSelector('[data-susto="fantasma"]', { timeout: 2000 })
  ok(true, '«boo» hace saltar al fantasma')
  await p.waitForSelector('[data-susto="fantasma"]', { state: 'detached', timeout: 4000 })

  await p.keyboard.type('murcielago')
  await p.waitForSelector('[data-enjambre]', { timeout: 2000 })
  ok(await p.locator('[data-enjambre]').count() === 22, '«murcielago» suelta un enjambre de 22')
  await p.waitForSelector('[data-enjambre]', { state: 'detached', timeout: 5000 })

  await p.keyboard.type('bruja')
  await p.waitForSelector('[data-escoba="bruja"]', { timeout: 2000 })
  ok(true, '«bruja» cruza la pantalla en su escoba')
  await p.waitForSelector('[data-escoba="bruja"]', { state: 'detached', timeout: 6000 })

  await p.keyboard.type('calabaza')
  await p.waitForSelector('[data-calabaza-lluvia]', { timeout: 2000 })
  ok(true, '«calabaza» hace llover calabazas')
  await p.waitForSelector('[data-calabaza-lluvia]', { state: 'detached', timeout: 8000 })

  // Calabaza con vela: al tocarla habla.
  await p.locator('[data-luz] + button').first().dispatchEvent('click')
  await p.waitForSelector('.decoracion-modo-globo', { timeout: 1500 })
  ok((await p.locator('.decoracion-modo-globo').innerText()).trim() !== '', 'tocar una calabaza la hace decir una frase')

  // Murcielago colgado: al tocarlo huye.
  const colgado = p.locator('[data-murcielago-colgado]').first()
  await colgado.click({ force: true })
  await p.waitForTimeout(1300)
  ok(Number(await colgado.evaluate((e) => getComputedStyle(e).opacity)) < 0.1, 'tocar un murcielago colgado lo hace huir')

  // Arana: tres clics seguidos la hacen bailar y salen las crias.
  const arana = p.locator('.decoracion-modo-arana').first()
  for (let i = 0; i < 3; i++) await arana.click({ force: true })
  await p.waitForSelector('[data-cria]', { timeout: 1500 })
  ok(await p.locator('[data-cria]').count() === 6, 'tres clics a la araña sueltan a sus seis crias')
  await ctx.close()
}

// --- 4c. Escenas de actualizacion de Halloween (laboratorio de animaciones) ---
{
  const ctx = await contexto()
  const p = await ctx.newPage()
  await p.goto(`${BASE}/administracion/animaciones`, { waitUntil: 'domcontentloaded' })
  await despejar(p)
  for (const nombre of ['Calabaza', 'Caldero', 'Fantasma']) {
    ok(await p.getByRole('heading', { name: nombre }).count() === 1, `el laboratorio lista la escena «${nombre}»`)
  }
  await p.getByRole('heading', { name: 'Caldero' }).locator('xpath=ancestor::article').getByRole('button', { name: /Pantalla completa/ }).click()
  await p.waitForSelector('.bienvenida-capa', { timeout: 3000 })
  ok((await p.locator('.bienvenida-capa').innerText()).includes('Cocinando la actualización'), 'la capa de bienvenida muestra la frase de la escena')
  await ctx.close()
}

// --- 5. Administracion: programar y apagar ---
{
  const ctx = await contexto()
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('wiwo-modo-entrada', new Date().toLocaleDateString('sv')))
  await p.goto(`${BASE}/administracion`, { waitUntil: 'domcontentloaded' })
  await despejar(p)
  await p.getByRole('tab', { name: 'Apariencia' }).click()
  ok(await p.getByText('Vigente: se está viendo ahora.').isVisible(), 'la pestaña dice que el modo esta vigente')

  const campos = p.getByPlaceholder('DD/MM/AAAA')
  await campos.nth(0).fill('')
  await campos.nth(0).pressSequentially('10112026')
  await campos.nth(1).fill('')
  await campos.nth(1).pressSequentially('01112026')
  ok(await p.getByText('No puede ser anterior al primer día.').isVisible(), 'rechaza un rango invertido en el cliente')
  ok(await p.getByRole('button', { name: 'Guardar' }).isDisabled(), 'y no deja guardar')

  await campos.nth(0).fill('')
  await campos.nth(0).pressSequentially('01092026')
  await campos.nth(1).fill('')
  await campos.nth(1).pressSequentially('20112026')
  await p.getByRole('button', { name: 'Guardar' }).click()
  await p.waitForSelector('text=Apariencia guardada.', { timeout: 4000 })
  ok(true, 'guarda un rango valido y avisa')

  await p.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  ok(await atributo(p, 'data-modo-hasta') === '2026-11-20', 'el layout ya lee el rango nuevo (cache invalidada)')

  // Apagar desde la administracion
  await p.goto(`${BASE}/administracion`, { waitUntil: 'domcontentloaded' })
  await despejar(p)
  await p.getByRole('tab', { name: 'Apariencia' }).click()
  await p.getByRole('combobox').first().click()
  await p.getByRole('option', { name: 'Ninguno' }).click()
  await p.getByRole('button', { name: 'Guardar' }).click()
  await p.waitForSelector('text=Apariencia guardada.', { timeout: 4000 })
  await p.goto(`${BASE}/inicio`, { waitUntil: 'domcontentloaded' })
  ok(await atributo(p, 'data-modo') === null && await atributo(p, 'data-modo-vigente') === null, 'con modo Ninguno la pagina sale normal')
  ok(await p.locator('.decoracion-modo').count() === 0, 'y sin decoracion')
  await ctx.close()
}

await navegador.close()
console.log(fallos.length === 0 ? '\nTODO OK' : `\n${fallos.length} FALLA(S)`)
process.exit(fallos.length === 0 ? 0 : 1)
