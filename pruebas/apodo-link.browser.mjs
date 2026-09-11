import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { PROCESOS, STAFF } from '../mock/datos.js'

/** Verifica enlaces de tareas en Next local; todas las escrituras quedan interceptadas. */
const destino = new URL(process.env.TAREA_TEST_URL ?? 'http://localhost:3110')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ storageState: process.env.TAREA_TEST_STORAGE_STATE, viewport: { width: 1440, height: 1100 } })
  if (!process.env.TAREA_TEST_STORAGE_STATE) {
    const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
      data: { email: process.env.TAREA_TEST_EMAIL ?? STAFF[0].email, password: process.env.TAREA_TEST_PASSWORD ?? STAFF[0].password }
    })
    assert.ok(respuesta.ok(), `Login: HTTP ${respuesta.status()}`)
  }
  const campo = { id: 9901, slug: 'tasks_drive', name: 'Link de Drive', type: 'link', options: null, required: false, order: 1, default_value: null, only_admin: false, show_on_table: true }
  const urlInicial = 'https://drive.google.com/drive/folders/prueba?usp=sharing'
  const urlNueva = 'https://drive.google.com/drive/folders/otra'
  const tarea = { ...PROCESOS[0], custom_fields: [{ ...campo, value: `<a href="${urlInicial}" target="_blank">Carpeta</a>` }] }
  const insegura = { ...PROCESOS[1], name: 'Enlace inseguro de prueba', custom_fields: [{ ...campo, value: '<a href="javascript:alert(1)">Inseguro</a>' }] }
  const parches = []
  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    if (peticion.method() === 'GET' && url.pathname.endsWith(`/tasks/${tarea.id}`)) return ruta.fulfill({ json: { data: tarea } })
    if (peticion.method() === 'GET' && url.pathname.endsWith('/custom-fields')) return ruta.fulfill({ json: { data: [campo] } })
    if (peticion.method() === 'GET' && url.pathname.endsWith('/projects/1/tasks')) return ruta.fulfill({ json: { data: [tarea, insegura], meta: { pagination: { page: 1, per_page: 25, total: 2, total_pages: 1 } } } })
    if (peticion.method() === 'PATCH' && url.pathname.endsWith('/custom-fields/values')) {
      const cuerpo = peticion.postDataJSON()
      parches.push(cuerpo)
      const valor = cuerpo.values[campo.id]
      // Simula la lectura canónica del backend tras persistir el objeto de escritura.
      tarea.custom_fields = [{ ...campo, value: typeof valor === 'string' ? valor : `<a href="${valor.url}" target="_blank">${valor.apodo_link}</a>` }]
      return ruta.fulfill({ json: { data: tarea.custom_fields } })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return ruta.abort()
    return ruta.continue()
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(15000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  const dialogo = pagina.getByRole('dialog', { name: 'Editar tarea', exact: true })
  /** Abre el formulario y espera el campo personalizado cargado. */
  async function abrir () {
    await pagina.getByRole('button', { name: 'Editar', exact: true }).click()
    await dialogo.getByLabel('Nombre del enlace', { exact: true }).waitFor()
  }
  /** Guarda y espera el detalle actualizado antes de volver a editar. */
  async function guardar () {
    await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
    await dialogo.waitFor({ state: 'hidden' })
    await pagina.waitForLoadState('networkidle')
  }
  await pagina.goto(new URL(`/procesos?tarea=${tarea.id}`, destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  await abrir()
  assert.equal(await dialogo.getByLabel('Link de Drive', { exact: true }).inputValue(), urlInicial)
  assert.equal(await dialogo.getByLabel('Nombre del enlace', { exact: true }).inputValue(), 'Carpeta')
  await dialogo.getByLabel('Nombre del enlace', { exact: true }).fill('Archivos del evento')
  await guardar()
  assert.deepEqual(parches.at(-1).values[campo.id], { url: urlInicial, apodo_link: 'Archivos del evento' })
  await abrir()
  assert.equal(await dialogo.getByLabel('Nombre del enlace', { exact: true }).inputValue(), 'Archivos del evento')
  await dialogo.getByLabel('Link de Drive', { exact: true }).fill(urlNueva)
  await guardar()
  assert.deepEqual(parches.at(-1).values[campo.id], { url: urlNueva, apodo_link: 'Archivos del evento' })
  await abrir()
  await pagina.setViewportSize({ width: 390, height: 844 })
  await dialogo.getByLabel('Nombre del enlace', { exact: true }).scrollIntoViewIfNeeded()
  assert.ok(await dialogo.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth + 1), 'Formulario sin desborde horizontal móvil.')
  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/apodo-link-movil.png', fullPage: true })
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await pagina.setViewportSize({ width: 1440, height: 1100 })
  await pagina.goto(new URL('/espacios/1?tab=tareas', destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  const tabla = pagina.getByRole('table')
  const enlace = tabla.getByRole('link', { name: 'Archivos del evento', exact: true })
  await enlace.waitFor()
  assert.equal(await enlace.getAttribute('href'), urlNueva)
  assert.equal(await enlace.getAttribute('target'), '_blank')
  assert.equal(await tabla.locator('a[href^="javascript:"]').count(), 0)
  assert.ok(!(await tabla.innerText()).includes('<a '), 'Tabla sin etiquetas HTML crudas.')
  await enlace.scrollIntoViewIfNeeded()
  await pagina.screenshot({ path: 'output/playwright/apodo-link-tabla.png', fullPage: true })
  assert.deepEqual(errores, [], 'Sin errores JavaScript.')
  console.info('Apodo de Drive: edición de HTML legado, persistencia, cambio de URL, tabla segura y móvil correctos.')
} finally {
  await navegador.close()
}
