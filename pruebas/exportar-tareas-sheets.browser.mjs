import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { STAFF } from '../mock/datos.js'

/** Verifica el formulario con API mock y exportaciones interceptadas; nunca crea archivos de Google. */
const destino = new URL(process.env.SHEETS_TEST_URL ?? 'http://localhost:3131')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Solo admite una vista local.')
const navegador = await chromium.launch()
try {
  for (const movil of [false, true]) {
    const contexto = await navegador.newContext({ viewport: movil ? { width: 390, height: 844 } : { width: 1440, height: 1000 } })
    const login = await contexto.request.post(new URL('/api/sesion', destino).href, { data: { email: STAFF[0].email, password: STAFF[0].password } })
    assert.ok(login.ok())
    const pagina = await contexto.newPage()
    const errores = []
    pagina.on('pageerror', error => errores.push(error.message))
    let llamadas = 0
    let fallar = false
    const folderId = 'carpeta_exportacion_123'
    await pagina.route('**/api/bff/staff/1/tasks/export-sheet', async ruta => {
      llamadas++
      assert.equal(ruta.request().method(), 'POST')
      assert.deepEqual(ruta.request().postDataJSON(), { folder_id: folderId, compartir_con_persona: true, ops_origin: destino.origin })
      if (fallar) return ruta.fulfill({ status: 503, json: { error: { code: 'service_unavailable', message: 'Google Drive no está disponible.' } } })
      return ruta.fulfill({ json: { data: { id: 'hoja_prueba', url: 'https://docs.google.com/spreadsheets/d/hoja_prueba/edit', name: 'Tareas de Ana', total: 125, compartida: false, advertencia: 'Hoja creada. No se pudo dar acceso a la persona; puedes compartirla desde Google Sheets.' } } })
    })
    await pagina.goto(new URL('/equipo/1', destino).href)
    await pagina.getByRole('button', { name: 'Exportar tareas a Sheets' }).click()
    const dialogo = pagina.getByRole('dialog')
    const crear = dialogo.getByRole('button', { name: 'Crear Google Sheets', exact: true })
    assert.equal(await crear.isDisabled(), true)
    await dialogo.getByLabel('Carpeta de Drive').fill('https://ejemplo.com/drive/folders/invalid')
    assert.equal(await crear.isDisabled(), true)
    assert.equal(llamadas, 0)
    await dialogo.getByLabel('Carpeta de Drive').fill(`https://drive.google.com/drive/folders/${folderId}`)
    await dialogo.getByRole('checkbox').check()
    await mkdir('output/playwright/sheets', { recursive: true })
    await pagina.screenshot({ path: `output/playwright/sheets/${movil ? 'movil' : 'escritorio'}-formulario.png` })
    await crear.click()
    await dialogo.getByRole('link', { name: 'Abrir Google Sheets' }).waitFor()
    assert.match(await dialogo.textContent(), /125 tareas/)
    assert.match(await dialogo.getByRole('alert').textContent(), /No se pudo dar acceso/)
    assert.equal(llamadas, 1)
    assert.equal(await dialogo.getByRole('link', { name: 'Abrir Google Sheets' }).getAttribute('rel'), 'noopener noreferrer')
    await pagina.screenshot({ path: `output/playwright/sheets/${movil ? 'movil' : 'escritorio'}-resultado.png` })
    await dialogo.getByRole('button', { name: 'Crear otra exportación' }).click()
    fallar = true
    await crear.click()
    await dialogo.getByRole('alert').waitFor()
    assert.match(await dialogo.getByRole('alert').textContent(), /Google Drive no está disponible/)
    assert.equal(await dialogo.getByLabel('Carpeta de Drive').inputValue(), `https://drive.google.com/drive/folders/${folderId}`)
    assert.equal(await crear.isEnabled(), true)
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errores, [])
    await contexto.close()
  }
  console.log('Sheets: formulario, destino inválido, exportación, fallo parcial y error recuperable OK en escritorio y móvil.')
} finally {
  await navegador.close()
}
