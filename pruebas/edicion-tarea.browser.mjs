import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { ESPACIOS, PROCESOS, STAFF } from '../mock/datos.js'

/** Verifica edición contra Next local; intercepta escrituras y simula referencias devueltas por API. */
const destino = new URL(process.env.TAREA_TEST_URL ?? 'http://localhost:3117')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ timezoneId: 'UTC', storageState: process.env.TAREA_TEST_STORAGE_STATE, viewport: { width: 1440, height: 1100 } })
  if (!process.env.TAREA_TEST_STORAGE_STATE) {
    const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
      data: { email: process.env.TAREA_TEST_EMAIL ?? STAFF[0].email, password: process.env.TAREA_TEST_PASSWORD ?? STAFF[0].password }
    })
    assert.ok(respuesta.ok(), `Login: HTTP ${respuesta.status()}`)
  }
  const tarea = { ...PROCESOS[0], rel_type: null, rel_id: null, project: null, milestone: null, task_type: null, status: 1, date_finished: null, billable: false, recurring: false, repeat_every: 0, cycles: 0 }
  const parches = []
  const acciones = []
  const personalizados = []
  let fallarPersonalizados = false
  const campoPersonalizado = { id: 9901, slug: 'prueba', name: 'Referencia de prueba', type: 'input', options: null, required: false, order: 1, default_value: null, only_admin: false, show_on_table: false }
  let fallar = false
  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    const detalle = url.pathname.endsWith(`/tasks/${tarea.id}`)
    if (peticion.method() === 'GET' && detalle) return ruta.fulfill({ json: { data: tarea } })
    if (peticion.method() === 'GET' && url.pathname.endsWith('/custom-fields')) return ruta.fulfill({ json: { data: [campoPersonalizado] } })
    if (peticion.method() === 'GET' && url.pathname.endsWith('/staff/asignables')) return ruta.fulfill({ json: { data: STAFF } })
    if (peticion.method() === 'GET' && /\/projects\/\d+\/milestones$/.test(url.pathname)) {
      const proyecto = Number(url.pathname.split('/').at(-2))
      return ruta.fulfill({ json: { data: [{ id: proyecto * 100, name: `Hito ${proyecto}`, project_id: proyecto }] } })
    }
    if (peticion.method() === 'GET' && url.pathname.endsWith('/task-types')) {
      const proyecto = Number(url.pathname.split('/').at(-2))
      return ruta.fulfill({ json: { data: { task_types: [{ id: proyecto * 1000, name: `Tipo ${proyecto}` }] } } })
    }
    if (peticion.method() === 'PATCH' && url.pathname.endsWith('/custom-fields/values')) {
      const cuerpo = peticion.postDataJSON()
      personalizados.push(cuerpo)
      if (fallarPersonalizados) {
        fallarPersonalizados = false
        return ruta.fulfill({ status: 503, json: { error: { code: 'no_disponible', message: 'Fallo personalizado de prueba.' } } })
      }
      tarea.custom_fields = [{ ...campoPersonalizado, value: cuerpo.values[campoPersonalizado.id] }]
      return ruta.fulfill({ json: { data: tarea.custom_fields } })
    }
    if (peticion.method() === 'PATCH' && detalle) {
      const cuerpo = peticion.postDataJSON()
      parches.push(cuerpo)
      if (fallar) {
        fallar = false
        return ruta.fulfill({ status: 503, json: { error: { code: 'no_disponible', message: 'Fallo de prueba; vuelve a guardar.' } } })
      }
      const { milestone, task_type: tipo, completed_at: cierre, ...resto } = cuerpo
      Object.assign(tarea, resto)
      if ('rel_id' in cuerpo) tarea.project = ESPACIOS.find((espacio) => espacio.id === cuerpo.rel_id) ?? null
      if ('milestone' in cuerpo) tarea.milestone = milestone ? { id: milestone, name: `Hito ${tarea.rel_id}` } : null
      if ('task_type' in cuerpo) tarea.task_type = tipo ? { id: tipo, name: `Tipo ${tarea.rel_id}` } : null
      if ('completed_at' in cuerpo) tarea.date_finished = cierre
      return ruta.fulfill({ json: { data: tarea } })
    }
    if (peticion.method() === 'POST' && url.pathname.includes(`/tasks/${tarea.id}/actions/`)) {
      const accion = url.pathname.split('/').at(-1)
      acciones.push({ accion, cuerpo: peticion.postDataJSON() })
      tarea.status = accion === 'mark-complete' ? 5 : peticion.postDataJSON().status
      tarea.date_finished = accion === 'mark-complete' ? '2026-09-09T12:00:00Z' : null
      return ruta.fulfill({ json: { data: tarea } })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return ruta.abort()
    return ruta.continue()
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(10000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  const dialogo = pagina.getByRole('dialog', { name: 'Editar tarea', exact: true })
  /** Abre el formulario desde el detalle ya refrescado. */
  async function abrir () {
    await pagina.getByRole('button', { name: 'Editar', exact: true }).click()
    await dialogo.waitFor()
    await dialogo.getByLabel(/^Nombre/).waitFor()
    await dialogo.getByLabel('Referencia de prueba', { exact: true }).waitFor()
  }
  /** Selecciona una opción del formulario por su etiqueta accesible. */
  async function elegir (campo, opcion) {
    await dialogo.getByLabel(campo, { exact: true }).click()
    await pagina.getByRole('option', { name: opcion, exact: true }).click()
  }
  /** Guarda y espera el cierre y la actualización del detalle antes del siguiente caso. */
  async function guardar () {
    await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
    await dialogo.waitFor({ state: 'hidden' })
    await pagina.waitForLoadState('networkidle')
  }
  await pagina.goto(new URL(`/procesos?tarea=${tarea.id}`, destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await pagina.waitForLoadState('networkidle')
  await abrir()
  await guardar()
  assert.equal(parches.length, 0, 'Guardar sin cambios no escribe.')
  await abrir()
  await elegir('Relacionada con', 'Proyecto')
  await elegir('Proyecto', ESPACIOS[0].name)
  await elegir('Hito', 'Hito 1')
  await elegir('Tipo', 'Tipo 1')
  await dialogo.getByLabel('Tarifa por hora', { exact: true }).fill('150.50')
  for (const nombre of ['Facturable', 'Pública para el equipo', 'Visible para el cliente', 'Recurrente']) await dialogo.getByLabel(nombre, { exact: true }).check()
  await dialogo.getByLabel('Repetir cada', { exact: true }).fill('2')
  await elegir('Unidad', 'Semanas')
  await dialogo.getByLabel('Ciclos', { exact: true }).fill('4')
  await mkdir('output/playwright', { recursive: true })
  await dialogo.evaluate((elemento) => { elemento.scrollTop = 0 })
  await pagina.screenshot({ path: 'output/playwright/edicion-tarea-desktop.png', fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  const medidas = await dialogo.evaluate((elemento) => ({ ventana: window.innerWidth, pagina: document.documentElement.scrollWidth, visible: elemento.clientWidth, contenido: elemento.scrollWidth }))
  assert.ok(medidas.pagina <= medidas.ventana + 1 && medidas.contenido <= medidas.visible + 1, 'El formulario desborda horizontalmente en móvil.')
  await pagina.screenshot({ path: 'output/playwright/edicion-tarea-movil.png', fullPage: true })
  await pagina.setViewportSize({ width: 1440, height: 1100 })
  fallar = true
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await dialogo.getByText('Fallo de prueba; vuelve a guardar.', { exact: true }).waitFor()
  assert.equal(await dialogo.getByLabel('Tarifa por hora', { exact: true }).inputValue(), '150.50')
  await guardar()
  assert.deepEqual(parches[0], parches[1], 'Reintentar conserva los cambios.')
  assert.deepEqual(parches[1], { rel_type: 'project', rel_id: 1, milestone: 100, task_type: 1000, billable: true, hourly_rate: 150.5, is_public: true, visible_to_client: true, recurring: true, repeat_every: 2, recurring_type: 'week', cycles: 4 })
  await abrir()
  assert.equal(await dialogo.getByLabel('Tipo', { exact: true }).innerText(), 'Tipo 1')
  assert.equal(await dialogo.getByLabel('Ciclos', { exact: true }).inputValue(), '4')
  await elegir('Proyecto', ESPACIOS[1].name)
  assert.equal(await dialogo.getByLabel('Tipo', { exact: true }).innerText(), 'Sin tipo')
  assert.equal(await dialogo.getByLabel('Hito', { exact: true }).innerText(), 'Sin hito')
  await guardar()
  assert.deepEqual(parches.at(-1), { rel_type: 'project', rel_id: 2, milestone: 0, task_type: null })
  await abrir()
  await elegir('Proyecto', 'Sin proyecto')
  await dialogo.getByLabel('Recurrente', { exact: true }).uncheck()
  for (const nombre of ['Facturable', 'Pública para el equipo', 'Visible para el cliente']) await dialogo.getByLabel(nombre, { exact: true }).uncheck()
  await dialogo.getByLabel('Tarifa por hora', { exact: true }).fill('0')
  await guardar()
  assert.deepEqual(parches.at(-1), { rel_type: null, rel_id: null, milestone: 0, task_type: null, recurring: false, billable: false, hourly_rate: 0, is_public: false, visible_to_client: false })
  await abrir()
  await elegir('Estado', 'Completado')
  await dialogo.getByLabel('Fecha de cierre', { exact: true }).fill('2026-09-08')
  await dialogo.getByLabel('Tarifa por hora', { exact: true }).fill('25')
  await dialogo.getByLabel('Referencia de prueba', { exact: true }).fill('Conservar al reintentar')
  fallarPersonalizados = true
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await dialogo.getByText('No se guardaron los campos personalizados: Fallo personalizado de prueba.', { exact: true }).waitFor()
  const parchesAntesDeReintentar = parches.length
  const accionesAntesDeReintentar = acciones.length
  await guardar()
  assert.equal(parches.length, parchesAntesDeReintentar, 'Reintento personalizado no repite tarifa ni cierre ya guardados.')
  assert.equal(acciones.length, accionesAntesDeReintentar, 'Reintento personalizado no repite mark-complete.')
  assert.equal(personalizados.length, 2)
  assert.deepEqual(personalizados[0], personalizados[1])
  assert.equal(tarea.date_finished, '2026-09-08T12:00:00.000Z', 'El cierre histórico sobrevive al reintento.')
  assert.equal(acciones.at(-1).accion, 'mark-complete')
  assert.equal(parches.at(-1).completed_at, '2026-09-08T12:00:00.000Z')
  await abrir()
  assert.equal(await dialogo.getByLabel('Fecha de cierre', { exact: true }).inputValue(), '2026-09-08')
  await dialogo.getByLabel('Fecha de cierre', { exact: true }).fill('')
  await guardar()
  assert.deepEqual(parches.at(-1), { completed_at: null }, 'Vaciar el cierre debe enviar null.')
  assert.equal(tarea.date_finished, null)
  await abrir()
  await elegir('Estado', 'En proceso')
  await guardar()
  assert.deepEqual(acciones.at(-1), { accion: 'reopen', cuerpo: { status: 4 } })
  const cantidad = parches.length
  await abrir()
  await guardar()
  assert.equal(parches.length, cantidad)
  assert.deepEqual(errores, [], 'No debe haber errores de JavaScript.')
  console.info('Edición completa: proyecto, dependencias, flags, recurrencia, estado, cierre, reintento y móvil correctos.')
} finally {
  await navegador.close()
}
