import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { STAFF } from '../mock/datos.js'

/** Verifica el chat de proyecto contra un frontend local, interceptando toda escritura. */
const destino = new URL(process.env.WIBOT_TEST_URL ?? 'http://localhost:3122')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname))
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
  const login = await contexto.request.post(new URL('/api/sesion', destino).href, { data: { email: STAFF[0].email, password: STAFF[0].password } })
  assert.ok(login.ok(), `Login: HTTP ${login.status()}`)
  const solicitudes = []
  const accion = { id: 71, herramienta: 'actualizar_tarea', resumen: 'Actualizar tarea del proyecto', detalle: [], supuestos: [], estado: 'pendiente', expira_en: new Date(Date.now() + 600000).toISOString() }
  await contexto.route('**/api/bff/**', async ruta => {
    const peticion = ruta.request()
    const path = new URL(peticion.url()).pathname
    if (path.includes('/ia/')) {
      solicitudes.push({ path, metodo: peticion.method(), cuerpo: peticion.postData() ? peticion.postDataJSON() : null })
      const alcance = path.match(/proyectos\/(\d+)/)?.[1] ?? 'global'
      if (peticion.method() === 'GET') return ruta.fulfill({ json: { data: { mensajes: [{ rol: 'ia', texto: `Historial exclusivo ${alcance}` }] } } })
      if (peticion.method() === 'DELETE') return ruta.fulfill({ json: { data: { borrados: 1 } } })
      if (path.includes('/acciones/')) return ruta.fulfill({ json: { data: { ...accion, estado: 'ejecutada', resultado: 'Cambio aplicado al proyecto.' } } })
      return ruta.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ t: `Respuesta exclusiva ${alcance}` })}\n\nevent: propuesta\ndata: ${JSON.stringify(accion)}\n\nevent: navegar\ndata: ${JSON.stringify({ href: '/procesos', etiqueta: 'Tareas globales' })}\n\nevent: fin\ndata: {}\n\n` })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return ruta.abort()
    return ruta.continue()
  })
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(15000)
  const errores = []
  pagina.on('pageerror', error => errores.push(error.message))
  await pagina.goto(new URL('/espacios/1?tab=wibot', destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  await pagina.getByText('Esta conversación solo consulta y modifica este proyecto.', { exact: true }).waitFor()
  await pagina.getByText('Historial exclusivo 1', { exact: true }).waitFor()
  assert.ok(await pagina.getByRole('button', { name: 'Preguntar', exact: true }).isDisabled())
  await pagina.getByRole('textbox', { name: 'Tu pregunta' }).fill('Resume este proyecto')
  await pagina.getByRole('button', { name: 'Preguntar', exact: true }).click()
  await pagina.getByText('Respuesta exclusiva 1', { exact: true }).waitFor()
  await pagina.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await pagina.getByText(/Cambio aplicado al proyecto\./).waitFor()
  assert.equal(new URL(pagina.url()).pathname, '/espacios/1', 'El evento navegar no saca del proyecto.')
  assert.deepEqual(solicitudes.find(s => s.metodo === 'POST' && s.path.endsWith('/chat')), { path: '/api/bff/ia/proyectos/1/chat', metodo: 'POST', cuerpo: { pregunta: 'Resume este proyecto' } })
  assert.deepEqual(solicitudes.find(s => s.path.endsWith('/acciones/71')), { path: '/api/bff/ia/proyectos/1/acciones/71', metodo: 'POST', cuerpo: { decision: 'confirmar' } })
  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/wibot-proyecto-desktop.png', fullPage: true })
  await pagina.getByRole('button', { name: 'Preguntarle a WiBot', exact: true }).click()
  const global = pagina.getByRole('dialog', { name: 'WiBot', exact: true })
  await global.getByText('Historial exclusivo global', { exact: true }).waitFor()
  assert.equal(await global.getByText('Historial exclusivo 1', { exact: true }).count(), 0)
  await global.getByRole('button', { name: 'Cerrar WiBot', exact: true }).click()
  await pagina.getByRole('button', { name: 'Borrar chat', exact: true }).click()
  await pagina.getByRole('button', { name: 'Borrar', exact: true }).click()
  await pagina.getByText('Historial exclusivo 1', { exact: true }).waitFor({ state: 'hidden' })
  assert.ok(solicitudes.some(s => s.metodo === 'DELETE' && s.path === '/api/bff/ia/proyectos/1/chat'))
  assert.ok(!solicitudes.some(s => s.metodo === 'DELETE' && s.path === '/api/bff/ia/chat'))
  await pagina.goto(new URL('/espacios/2?tab=wibot', destino).href, { waitUntil: 'networkidle' })
  await pagina.getByText('Historial exclusivo 2', { exact: true }).waitFor()
  assert.equal(await pagina.getByText('Historial exclusivo 1', { exact: true }).count(), 0)
  assert.equal(await pagina.getByText('Historial exclusivo global', { exact: true }).count(), 0)
  await pagina.setViewportSize({ width: 390, height: 844 })
  const entrada = pagina.getByRole('textbox', { name: 'Tu pregunta' })
  await entrada.scrollIntoViewIfNeeded()
  const caja = await entrada.boundingBox()
  assert.ok(caja && caja.x >= 0 && caja.x + caja.width <= 390, 'Campo de chat dentro del ancho móvil.')
  await pagina.screenshot({ path: 'output/playwright/wibot-proyecto-movil.png', fullPage: true })
  assert.deepEqual(errores, [])
  console.info('WiBot proyecto: alcance visible, envío y confirmación scoped, navegación bloqueada, historial separado de global y otro proyecto, borrado scoped, entrada vacía y móvil correctos.')
} finally {
  await navegador.close()
}
