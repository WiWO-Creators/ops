import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { ESPACIOS, STAFF } from '../mock/datos.js'

/**
 * Verifica el formulario común contra Next y la API mock locales, sin escribir tareas reales.
 * Requiere TAREA_TEST_EMAIL/PASSWORD o TAREA_TEST_STORAGE_STATE; TAREA_TEST_URL cambia el origen.
 * POST /tasks y PATCH de personalizados se interceptan para comprobar payload y reintento.
 */
const destino = new URL(process.env.TAREA_TEST_URL ?? 'http://localhost:3106')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ timezoneId: 'UTC', storageState: process.env.TAREA_TEST_STORAGE_STATE, viewport: { width: 1440, height: 1100 } })
  if (!process.env.TAREA_TEST_STORAGE_STATE) {
    assert.ok(process.env.TAREA_TEST_EMAIL && process.env.TAREA_TEST_PASSWORD, 'Falta sesión local de prueba.')
    const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
      data: { email: process.env.TAREA_TEST_EMAIL, password: process.env.TAREA_TEST_PASSWORD }
    })
    assert.ok(respuesta.ok(), `Login: HTTP ${respuesta.status()}`)
  }
  const creadas = []
  const parches = []
  let fallarParche = true
  let liberarCreacion
  let demorarCreacion = false
  const campo = { id: 9901, slug: 'prueba', name: 'Referencia de prueba', type: 'input', options: null, required: true, order: 1, default_value: null, only_admin: false, show_on_table: false }
  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    if (peticion.method() === 'GET' && url.pathname.endsWith('/custom-fields')) {
      return ruta.fulfill({ json: { data: [campo] } })
    }
    if (peticion.method() === 'GET' && url.pathname.endsWith('/projects/1/milestones') && url.searchParams.get('vista') === 'tablero') {
      return ruta.fulfill({ json: { data: [{ columna: { id: 1, name: 'Entrega inicial', color: null, order: 1 }, tarjetas: [], pagination: { page: 1, per_page: 25, total: 0, total_pages: 1 } }] } })
    }
    if (peticion.method() === 'GET' && url.pathname.endsWith('/staff/asignables')) {
      return ruta.fulfill({ json: { data: STAFF } })
    }
    if (peticion.method() === 'GET' && url.pathname.endsWith('/task-types')) {
      return ruta.fulfill({ json: { data: { task_types: [{ id: 991, name: 'Tipo de prueba' }] } } })
    }
    if (peticion.method() === 'POST' && url.pathname.endsWith('/tasks')) {
      creadas.push(peticion.postDataJSON())
      if (demorarCreacion) await new Promise((resolver) => { liberarCreacion = resolver })
      return ruta.fulfill({ json: { data: { id: 9900 + creadas.length } } })
    }
    if (peticion.method() === 'PATCH' && url.pathname.endsWith('/custom-fields/values')) {
      parches.push(peticion.postDataJSON())
      if (fallarParche) {
        fallarParche = false
        return ruta.fulfill({ status: 503, json: { error: { message: 'Fallo de prueba' } } })
      }
      return ruta.fulfill({ json: { data: {} } })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return ruta.abort()
    return ruta.continue()
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(5000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  const fallosCarga = []
  pagina.on('requestfailed', (peticion) => { if (peticion.resourceType() === 'script') fallosCarga.push(peticion.url()) })
  pagina.on('console', (mensaje) => { if (mensaje.type() === 'error') fallosCarga.push(mensaje.text()) })
  /** Selecciona una opción Radix por las etiquetas visibles de campo y opción. */
  async function elegir (campo, opcion) {
    await pagina.getByRole('dialog').getByLabel(campo, { exact: true }).click()
    await pagina.getByRole('option', { name: opcion, exact: true }).click()
  }
  await pagina.goto(new URL('/procesos', destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await pagina.waitForLoadState('networkidle')
  await pagina.getByRole('button', { name: 'Nueva tarea', exact: true }).click()
  const dialogo = pagina.getByRole('dialog')
  await dialogo.waitFor({ timeout: 5000 }).catch(async (error) => {
    await mkdir('output/playwright', { recursive: true })
    await pagina.screenshot({ path: 'output/playwright/creacion-tarea-debug.png', fullPage: true })
    throw new Error(JSON.stringify({ errores, fallosCarga, boton: await pagina.getByRole('button', { name: 'Nueva tarea', exact: true }).evaluate((boton) => boton.outerHTML) }), { cause: error })
  })
  await dialogo.getByLabel(/^Referencia de prueba/).waitFor({ timeout: 5000 }).catch(async (error) => {
    await pagina.screenshot({ path: 'output/playwright/creacion-tarea-debug.png', fullPage: true })
    throw new Error(JSON.stringify({ contenido: await dialogo.innerText({ timeout: 5000 }), errores, fallosCarga }), { cause: error })
  })
  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/creacion-tarea-desktop.png', fullPage: true })
  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  assert.equal(creadas.length, 0, 'No debe crear una tarea vacía.')
  await dialogo.getByLabel(/^Nombre/).fill('Tarea completa de prueba')
  await elegir('Proyecto', ESPACIOS[0].name)
  await elegir('Prioridad', 'Alta')
  await elegir('Estado', 'Completado')
  await elegir('Hito', 'Entrega inicial')
  await elegir('Tipo', 'Tipo de prueba')
  await dialogo.getByLabel('Fecha real de cierre', { exact: true }).fill('2026-09-08T12:30')
  await dialogo.getByLabel('Fecha de inicio', { exact: true }).fill('2026-09-01')
  await dialogo.getByLabel('Fecha de vencimiento', { exact: true }).fill('2026-08-31')
  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  assert.equal(creadas.length, 0, 'No debe crear con vencimiento anterior al inicio.')
  await dialogo.getByLabel('Fecha de vencimiento', { exact: true }).fill('2026-09-10')
  for (const etiqueta of ['Asignados', 'Seguidores']) {
    await dialogo.getByLabel(etiqueta, { exact: true }).click()
    await pagina.getByRole('menuitemcheckbox').filter({ hasText: STAFF[0].full_name }).click()
    await pagina.keyboard.press('Escape')
  }
  await dialogo.getByLabel('Etiquetas', { exact: true }).fill('etiqueta-prueba')
  await dialogo.getByLabel('Descripción', { exact: true }).fill('Descripción completa')
  await dialogo.getByLabel('Horas estimadas', { exact: true }).fill('2.25')
  await dialogo.getByLabel('Tarifa por hora', { exact: true }).fill('150.50')
  await dialogo.getByLabel('Facturable', { exact: true }).check()
  await dialogo.getByLabel('Pública para el equipo', { exact: true }).check()
  await dialogo.getByLabel('Visible para el cliente', { exact: true }).check()
  await dialogo.getByLabel('Recurrente', { exact: true }).check()
  await dialogo.getByLabel('Repetir cada', { exact: true }).fill('2')
  await elegir('Unidad', 'Semanas')
  await dialogo.getByLabel('Ciclos', { exact: true }).fill('4')
  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  assert.equal(creadas.length, 0, 'Personalizado obligatorio debe validarse antes del POST.')
  await dialogo.getByLabel(/^Referencia de prueba/).fill('valor pendiente')
  await mkdir('output/playwright', { recursive: true })
  await dialogo.evaluate((elemento) => { elemento.scrollTop = 0 })
  await pagina.screenshot({ path: 'output/playwright/creacion-tarea-desktop.png', fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  const medidas = await dialogo.evaluate((elemento) => ({
    ventana: window.innerWidth, pagina: document.documentElement.scrollWidth,
    visible: elemento.clientWidth, contenido: elemento.scrollWidth
  }))
  assert.ok(medidas.pagina <= medidas.ventana + 1 && medidas.contenido <= medidas.visible + 1, 'El formulario desborda horizontalmente en móvil.')
  await pagina.screenshot({ path: 'output/playwright/creacion-tarea-movil.png', fullPage: true })
  await pagina.setViewportSize({ width: 1440, height: 1100 })
  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  await dialogo.getByRole('button', { name: 'Reintentar campos personalizados' }).waitFor()
  assert.equal(await dialogo.getByLabel(/^Referencia de prueba/).inputValue(), 'valor pendiente')
  await dialogo.getByRole('button', { name: 'Reintentar campos personalizados' }).click()
  await dialogo.waitFor({ state: 'hidden' })
  assert.equal(creadas.length, 1, 'El reintento no debe duplicar la tarea.')
  assert.equal(parches.length, 2)
  assert.deepEqual(parches[0], parches[1], 'El reintento conserva los valores personalizados.')
  assert.deepEqual(creadas[0], {
    name: 'Tarea completa de prueba', billable: true, is_public: true, visible_to_client: true,
    status: 5, milestone: 1, hourly_rate: 150.5, recurring: true, repeat_every: 2, recurring_type: 'week', cycles: 4,
    completed_at: '2026-09-08T12:30:00.000Z', rel_type: 'project', rel_id: 1,
    assignees: [STAFF[0].id], followers: [STAFF[0].id], priority: 3, start_date: '2026-09-01',
    due_date: '2026-09-10', tags: ['etiqueta-prueba'], description: 'Descripción completa', estimated_hours: 2.25, task_type: 991
  })
  await pagina.goto(new URL('/espacios/1?tab=hitos', destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await pagina.waitForLoadState('networkidle')
  await pagina.getByRole('button', { name: 'Agregar una tarea a Entrega inicial', exact: true }).click()
  await dialogo.getByLabel(/^Referencia de prueba/).waitFor()
  await dialogo.getByLabel(/^Nombre/).fill('Tarea desde hito')
  await dialogo.getByLabel(/^Referencia de prueba/).fill('hito')
  demorarCreacion = true
  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  await pagina.waitForFunction(() => document.querySelector('form [aria-busy="true"]') !== null)
  await pagina.keyboard.press('Escape')
  assert.ok(await dialogo.isVisible(), 'No debe cerrar mientras crea.')
  assert.ok(await dialogo.getByRole('button', { name: 'Sumar existente', exact: true }).isDisabled(), 'No debe desmontar el formulario mientras crea.')
  assert.equal(typeof liberarCreacion, 'function', 'El POST pendiente debe haberse interceptado.')
  liberarCreacion()
  await dialogo.waitFor({ state: 'hidden' })
  assert.equal(creadas.length, 2)
  assert.equal(creadas[1].rel_id, 1)
  assert.equal(creadas[1].milestone, 1, 'La creación desde hito conserva su hito inicial.')
  await pagina.goto(new URL('/espacios/1?tab=tareas&nuevaTarea=1', destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await dialogo.waitFor({ timeout: 15000 })
  await dialogo.getByLabel(/^Referencia de prueba/).waitFor()
  assert.equal(await dialogo.getByLabel('Proyecto', { exact: true }).innerText(), ESPACIOS[0].name)
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await dialogo.waitFor({ state: 'hidden' })
  await pagina.waitForURL((url) => !url.searchParams.has('nuevaTarea'))
  assert.deepEqual(errores, [], 'No debe haber errores de JavaScript.')
  console.info('Creación común: campos, validación, reintento sin duplicación e hito correctos.')
} finally {
  await navegador.close()
}
