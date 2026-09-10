import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/**
 * Verifica pestañas y alta desde un prospecto local, incluso sin navegación RSC disponible.
 * Requiere Next con API local y un prospecto existente (el mock base no trae prospectos).
 * PESTANAS_TEST_URL/PESTANAS_TEST_PROSPECTO cambian origen e ID; la cuenta necesita projects.create
 * y secciones prospectos/upsells habilitadas. Las escrituras se interceptan, nunca se guardan.
 */
const destino = new URL(process.env.PESTANAS_TEST_URL ?? 'http://localhost:3112')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Solo permite pruebas locales.')
const prospectoId = Number(process.env.PESTANAS_TEST_PROSPECTO ?? 1)
assert.ok(Number.isSafeInteger(prospectoId) && prospectoId > 0)
const rutaProspecto = `/prospectos/${prospectoId}`
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext()
  const sesion = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email: process.env.PESTANAS_TEST_EMAIL ?? 'ana@wiwo.me', password: process.env.PESTANAS_TEST_PASSWORD ?? 'mock1234' }
  })
  assert.equal(sesion.status(), 200)
  const pagina = await contexto.newPage()
  await pagina.goto(new URL(`${rutaProspecto}?tab=contactos&origen=prueba`, destino).href)
  await pagina.locator('#pestana-contactos[aria-selected="true"]').waitFor()
  await pagina.locator('#panel-contactos').waitFor()
  assert.equal(await pagina.locator('a[href="/licitaciones"]').count(), 0)
  assert.ok(await pagina.locator('a[href="/upsells"] svg.lucide-trending-up').count() > 0)
  let navegaciones = 0
  await pagina.route(`**${rutaProspecto}?**`, async (ruta) => {
    if (ruta.request().headers().rsc === '1') { navegaciones++; await new Promise((resolver) => setTimeout(resolver, 10000)); await ruta.abort(); return }
    await ruta.continue()
  })
  await pagina.locator('#pestana-licitaciones').click()
  await pagina.locator('#pestana-licitaciones[aria-selected="true"]').waitFor({ timeout: 5000 })
  await pagina.locator('#panel-licitaciones').waitFor()
  assert.equal(navegaciones, 0, 'Cambiar pestaña no debe volver a pedir la página al servidor.')
  assert.equal(new URL(pagina.url()).searchParams.get('origen'), 'prueba')
  await pagina.getByRole('button', { name: 'Nueva licitación', exact: true }).waitFor()
  const historial = await pagina.evaluate(() => history.length)
  await pagina.locator('#pestana-ficha').click()
  await pagina.locator('#panel-ficha').waitFor()
  assert.equal(await pagina.evaluate(() => history.length), historial)
  await pagina.evaluate(() => history.pushState(null, '', '?tab=invalida&origen=prueba'))
  await pagina.locator('#pestana-ficha[aria-selected="true"]').waitFor()
  await pagina.evaluate(() => history.pushState(null, '', '?tab=licitaciones&origen=prueba'))
  await pagina.locator('#panel-licitaciones').waitFor()
  await pagina.goBack()
  await pagina.locator('#panel-ficha').waitFor()
  await pagina.unroute(`**${rutaProspecto}?**`)
  await pagina.goto(new URL(`${rutaProspecto}?tab=licitaciones`, destino).href)
  await pagina.locator('#panel-licitaciones').waitFor()
  const empresa = await pagina.locator('h1').innerText()
  await pagina.getByRole('button', { name: 'Nueva licitación', exact: true }).click()
  const dialogo = pagina.getByRole('dialog')
  assert.equal(await dialogo.getByLabel('Prospecto', { exact: false }).innerText(), empresa)
  await dialogo.getByLabel('Nombre del proyecto', { exact: false }).fill('Licitación de prueba local')
  await dialogo.getByLabel('Fecha de inicio', { exact: false }).fill('2026-09-09')
  let cuerpo
  await pagina.route('**/api/**', async (ruta) => {
    if (ruta.request().method() !== 'POST') { await ruta.continue(); return }
    assert.ok(new URL(ruta.request().url()).pathname.endsWith('/licitaciones'))
    cuerpo = ruta.request().postDataJSON()
    await ruta.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 999 } }) })
  })
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await dialogo.waitFor({ state: 'hidden' })
  assert.equal(cuerpo.prospecto_id, prospectoId)
  assert.equal(cuerpo.espacio.name, 'Licitación de prueba local')
  await mkdir('output/pestanas', { recursive: true })
  await pagina.screenshot({ path: 'output/pestanas/escritorio.png', fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  await pagina.screenshot({ path: 'output/pestanas/movil.png', fullPage: true })
  console.log('Pestañas: clic sin RSC, parámetros, historial, valor inválido y enlace directo correctos.')
} finally {
  await navegador.close()
}
