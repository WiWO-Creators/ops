import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { PROCESOS, STAFF } from '../mock/datos.js'

/**
 * Verifica la descripcion de una Tarea con texto enriquecido, de punta a punta, contra el Next local
 * ya construido y la API mock (`pnpm mock`). Las escrituras se interceptan: no toca datos.
 *
 * ```bash
 * API_BASE=http://localhost:3001/api/v1 SESION_CLAVE=<hex> pnpm exec next start -p 3322 &
 * TAREA_TEST_URL=http://localhost:3322 node pruebas/texto-rico-tareas.browser.mjs
 * ```
 *
 * Comprueba lo que no se ve desde `node --test`:
 *
 *   1. El detalle pinta `description_html` con sus marcas (`Contenido`), sin inyectar nada ajeno.
 *   2. Abrir la edicion y guardar sin tocar la descripcion **no** manda un `PATCH`: el editor
 *      reescribe el HTML al montarse y esa diferencia no es un cambio.
 *   3. Editarla manda `description` en HTML con `format: 'html'`.
 *   4. Vaciarla se bloquea con el mensaje junto al campo.
 *   5. Un comentario se escribe con formato, se envia con Ctrl+Enter como HTML con `format: 'html'` y
 *      aparece en el hilo con sus marcas; el cuadro queda vacio y con el foco.
 */
const destino = new URL(process.env.TAREA_TEST_URL ?? 'http://localhost:3322')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ timezoneId: 'UTC', viewport: { width: 1440, height: 1100 } })
  const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email: process.env.TAREA_TEST_EMAIL ?? STAFF[0].email, password: process.env.TAREA_TEST_PASSWORD ?? STAFF[0].password }
  })
  assert.ok(respuesta.ok(), `Login: HTTP ${respuesta.status()}`)

  const tarea = {
    ...PROCESOS[0],
    rel_type: null,
    rel_id: null,
    project: null,
    milestone: null,
    task_type: null,
    status: 1,
    date_finished: null,
    description: 'Armar la grilla con las piezas.',
    description_html: '<p>Armar la <strong>grilla</strong> con las piezas.</p><script>alert(1)</script>'
  }
  const parches = []
  const comentarios = []
  await contexto.route('**/api/bff/**', async (ruta) => {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    const detalle = url.pathname.endsWith(`/tasks/${tarea.id}`)
    if (peticion.method() === 'GET' && detalle) return ruta.fulfill({ json: { data: tarea } })
    if (peticion.method() === 'GET' && url.pathname.endsWith('/custom-fields')) return ruta.fulfill({ json: { data: [] } })
    if (peticion.method() === 'GET' && url.pathname.endsWith('/staff/asignables')) return ruta.fulfill({ json: { data: STAFF } })
    if (url.pathname.endsWith(`/tasks/${tarea.id}/comments`)) {
      if (peticion.method() === 'GET') return ruta.fulfill({ json: { data: [] } })
      if (peticion.method() === 'POST') {
        const cuerpo = peticion.postDataJSON()
        comentarios.push(cuerpo)

        return ruta.fulfill({
          json: { data: { id: 777, task_id: tarea.id, content: cuerpo.content, staff: { id: STAFF[0].id, full_name: STAFF[0].full_name }, date_added: '2026-10-01T12:00:00Z' } }
        })
      }
    }
    if (peticion.method() === 'PATCH' && detalle) {
      const cuerpo = peticion.postDataJSON()
      parches.push(cuerpo)
      Object.assign(tarea, cuerpo, { description_html: cuerpo.description })
      return ruta.fulfill({ json: { data: tarea } })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(peticion.method())) return ruta.abort()
    return ruta.continue()
  })

  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(15000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))
  const dialogo = pagina.getByRole('dialog', { name: 'Editar tarea', exact: true })

  await pagina.goto(new URL(`/tareas?tarea=${tarea.id}`, destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await pagina.waitForLoadState('networkidle')

  // 1. El detalle.
  const lectura = pagina.locator('.texto-rico').filter({ hasText: 'Armar la grilla' }).first()
  await lectura.waitFor()
  assert.equal(await lectura.locator('strong').textContent(), 'grilla')
  assert.equal(await lectura.locator('script').count(), 0)

  // 2. Abrir y guardar sin tocar: ningun PATCH.
  async function abrir () {
    await pagina.getByRole('button', { name: 'Editar', exact: true }).click()
    await dialogo.waitFor()
    await dialogo.getByRole('textbox', { name: 'Descripción' }).waitFor()
  }
  await abrir()
  assert.equal(await dialogo.getByRole('textbox', { name: 'Descripción' }).locator('strong').textContent(), 'grilla')
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await dialogo.waitFor({ state: 'hidden' })
  assert.equal(parches.length, 0, 'Sin cambios en la descripcion no debe haber PATCH.')

  // 3. Editarla.
  await abrir()
  const editor = dialogo.getByRole('textbox', { name: 'Descripción' })
  await editor.click()
  await editor.press('Control+End')
  await editor.pressSequentially(' Y revisar el calendario.')
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await dialogo.waitFor({ state: 'hidden' })
  await pagina.waitForLoadState('networkidle')
  assert.equal(parches.length, 1)
  assert.equal(parches[0].format, 'html')
  assert.match(parches[0].description, /^<p>Armar la <strong>grilla<\/strong> con las piezas\. Y revisar el calendario\.<\/p>$/)

  // 4. Vaciarla se bloquea junto al campo.
  await abrir()
  await dialogo.getByRole('textbox', { name: 'Descripción' }).click()
  await pagina.keyboard.press('Control+A')
  await pagina.keyboard.press('Delete')
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await dialogo.getByRole('alert').filter({ hasText: 'necesita una descripción' }).waitFor()
  assert.equal(parches.length, 1, 'Una descripcion vacia no debe escribir.')

  await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await dialogo.waitFor({ state: 'hidden' })

  // 5. Comentario con formato.
  const cuadro = pagina.getByRole('textbox', { name: /^Comentar en esta/ })
  await cuadro.click()
  await pagina.keyboard.press('Control+B')
  await cuadro.pressSequentially('Urgente')
  await pagina.keyboard.press('Control+B')
  await cuadro.pressSequentially(' revisar hoy')
  await pagina.keyboard.press('Control+Enter')
  await pagina.locator('.texto-rico strong', { hasText: 'Urgente' }).first().waitFor()
  assert.equal(comentarios.length, 1)
  assert.deepEqual(comentarios[0], { content: '<p><strong>Urgente</strong> revisar hoy</p>', format: 'html' })
  // El cuadro se vacia despues de que la API confirma: se espera, no se lee de inmediato.
  await pagina.waitForFunction(() => document.querySelector('[aria-label^="Comentar en esta"]')?.textContent === '')
  await pagina.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Comentar en esta'))

  assert.deepEqual(errores, [], 'No debe haber errores de JavaScript.')
  console.log('texto-rico-tareas.browser: OK')
} finally {
  await navegador.close()
}
