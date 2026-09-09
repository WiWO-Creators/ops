import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { STAFF } from '../mock/datos.js'

/** Comprueba proyecto masivo con servidor local; las escrituras quedan interceptadas. */
const destino = new URL(process.env.TAREA_TEST_URL ?? 'http://localhost:3118')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname))
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, storageState: process.env.TAREA_TEST_STORAGE_STATE })
  if (!process.env.TAREA_TEST_STORAGE_STATE) {
    const login = await contexto.request.post(new URL('/api/sesion', destino).href, { data: {
      email: process.env.TAREA_TEST_EMAIL ?? STAFF[0].email, password: process.env.TAREA_TEST_PASSWORD ?? STAFF[0].password
    } })
    assert.ok(login.ok(), `Login: HTTP ${login.status()}`)
  }
  let catalogo = 'normal'
  let fallar = true
  let liberarEnvio
  let liberarCarga
  let demorarCarga = true
  const solicitudes = []
  const paginas = []
  let recargas = 0
  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    if (peticion.method() === 'GET' && url.pathname.endsWith('/projects')) {
      paginas.push(url.searchParams.get('page'))
      if (demorarCarga) {
        demorarCarga = false
        await new Promise((resolver) => { liberarCarga = resolver })
      }
      if (catalogo === 'vacio') return ruta.fulfill({ json: { data: [] } })
      if (catalogo === 'error') return ruta.fulfill({ status: 503, json: { error: { message: 'Catálogo no disponible.' } } })
      const pagina = Number(url.searchParams.get('page') ?? 1)
      return ruta.fulfill({ json: { data: [{ id: pagina, name: `Proyecto página ${pagina}` }], meta: { pagination: { total_pages: 2 } } } })
    }
    if (peticion.method() === 'POST' && url.pathname.endsWith('/tasks/bulk')) {
      solicitudes.push(peticion.postDataJSON())
      if (fallar) {
        fallar = false
        return ruta.fulfill({ status: 503, json: { error: { message: 'Fallo de prueba. Reintenta.' } } })
      }
      await new Promise((resolver) => { liberarEnvio = resolver })
      return ruta.fulfill({ json: { data: { updated: solicitudes.at(-1).ids.length } } })
    }
    if (peticion.method() === 'GET' && url.pathname.endsWith('/tasks')) recargas++
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return ruta.abort()
    return ruta.continue()
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(10000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  await pagina.goto(new URL('/procesos', destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  const filas = pagina.getByRole('checkbox', { name: /^Seleccionar fila / })
  const ids = []
  for (let indice = 0; indice < 2; indice++) {
    ids.push(Number((await filas.nth(indice).getAttribute('aria-label')).split(' ').at(-1)))
    await filas.nth(indice).check()
  }
  const dialogo = pagina.getByRole('dialog', { name: 'Agregar a proyecto', exact: true })
  const boton = dialogo.getByRole('button', { name: 'Agregar a proyecto', exact: true })
  /** Abre la acción desde la barra que conserva las filas seleccionadas. */
  async function abrir () {
    await pagina.getByRole('button', { name: 'Acción masiva', exact: true }).click()
    await pagina.getByRole('menuitem', { name: 'Agregar a proyecto', exact: true }).click()
    await dialogo.waitFor()
  }
  await abrir()
  await dialogo.getByText('Cargando proyectos…').waitFor()
  assert.ok(await boton.isDisabled())
  assert.ok(await dialogo.getByLabel(/^Proyecto destino/).isDisabled())
  assert.equal(typeof liberarCarga, 'function', 'La carga de proyectos está interceptada.')
  liberarCarga()
  await pagina.waitForLoadState('networkidle')
  assert.ok(await boton.isDisabled(), 'Sin proyecto no permite aplicar.')
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.equal(solicitudes.length, 0)
  catalogo = 'vacio'
  await abrir()
  await dialogo.getByText('No hay proyectos disponibles.', { exact: true }).waitFor()
  assert.ok(await boton.isDisabled())
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click()
  catalogo = 'error'
  await abrir()
  await dialogo.getByRole('alert').waitFor()
  assert.ok(await boton.isDisabled())
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click()
  catalogo = 'normal'
  await abrir()
  await pagina.waitForLoadState('networkidle')
  await dialogo.getByLabel(/^Proyecto destino/).click()
  await pagina.getByRole('option', { name: 'Proyecto página 2', exact: true }).click()
  assert.ok(paginas.includes('2'), 'Carga también proyectos posteriores a la primera página.')
  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/proyecto-masivo-desktop.png', fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  const medidas = await dialogo.evaluate((elemento) => ({ ancho: elemento.clientWidth, contenido: elemento.scrollWidth, borde: elemento.getBoundingClientRect().right, ventana: window.innerWidth }))
  assert.ok(medidas.contenido <= medidas.ancho + 1 && medidas.borde <= medidas.ventana, 'Diálogo no desborda en móvil.')
  await pagina.screenshot({ path: 'output/playwright/proyecto-masivo-movil.png', fullPage: true })
  await boton.click()
  await dialogo.getByRole('alert').waitFor()
  assert.equal(await dialogo.getByLabel(/^Proyecto destino/).innerText(), 'Proyecto página 2')
  assert.deepEqual(solicitudes[0], { ids, accion: 'project', valor: 2 })
  const recargasAntes = recargas
  await boton.click()
  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).waitFor()
  assert.ok(await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).isDisabled())
  assert.ok(await dialogo.getByLabel(/^Proyecto destino/).isDisabled())
  await pagina.keyboard.press('Escape')
  assert.ok(await dialogo.isVisible(), 'No cierra mientras aplica.')
  assert.equal(typeof liberarEnvio, 'function', 'El envío está interceptado.')
  liberarEnvio()
  await dialogo.waitFor({ state: 'hidden' })
  await pagina.waitForLoadState('networkidle')
  assert.deepEqual(solicitudes[1], solicitudes[0], 'El reintento conserva todas las filas y el destino.')
  assert.ok(recargas > recargasAntes, 'Recarga las tareas tras el éxito.')
  assert.equal(await pagina.getByRole('button', { name: 'Acción masiva', exact: true }).count(), 0, 'Limpia la selección al guardar.')
  assert.deepEqual(errores, [])
  console.info('Proyecto masivo: dos filas, paginación, cancelación, carga/error/vacío, reintento, bloqueo, refresco y móvil correctos.')
} finally {
  await navegador.close()
}
