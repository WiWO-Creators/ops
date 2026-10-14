import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica las imagenes del texto enriquecido y los archivos del alta, en un navegador, contra un Next
 * ya construido (`next start`) conectado a una API local con la migracion 1560. Se corre a mano, como
 * el resto de los `.browser.mjs`:
 *
 * ```bash
 * API_BASE=http://127.0.0.1:8095/api/v1 pnpm build && pnpm exec next start -p 3327 &
 * IMAGENES_TEST_URL=http://127.0.0.1:3327 \
 * IMAGENES_PORTAL_EMAIL=... IMAGENES_PORTAL_CLAVE=... IMAGENES_PROYECTO_ID=114 \
 * IMAGENES_STAFF_EMAIL=... IMAGENES_STAFF_CLAVE=... \
 * node pruebas/imagenes-ricas.browser.mjs
 * ```
 *
 * Contra el build y no contra `next dev`: en desarrollo la pagina no hidrata a tiempo. Deja filas en
 * la base a la que apunte la API: usar solo una de desarrollo. El Proyecto tiene que ser del cliente
 * del contacto, con pestañas Tareas y Tickets visibles y `portal-crea-tareas` encendido.
 *
 * Lo que comprueba, y que `node --test` no puede ver:
 *
 *   1. Portal, nueva Tarea: pegar y soltar una imagen en el editor la sube, la inserta como `<img>` de
 *      la ruta propia y se ve (`naturalWidth > 0`); adjuntar con el boton, soltar sobre el formulario
 *      y pegar fuera del editor agregan archivos; la Tarea se crea y su descripcion muestra la imagen.
 *   2. Portal, nuevo ticket: lo mismo en el mensaje, y la ficha del ticket muestra la imagen.
 *   3. Panel: el equipo ve la imagen del contacto en la descripcion de la Tarea, ve el archivo adjunto
 *      y comenta con una imagen pegada que se dibuja en el hilo.
 *   4. Una imagen que no es de formato aceptado se rechaza con aviso, sin romper el editor.
 */
const destino = new URL(process.env.IMAGENES_TEST_URL ?? 'http://127.0.0.1:3327')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const entorno = (nombre) => {
  const valor = process.env[nombre]
  assert.ok(valor, `Falta ${nombre}`)

  return valor
}
const proyecto = entorno('IMAGENES_PROYECTO_ID')
const url = (ruta) => new URL(ruta, destino).href

/** Inserta en `localizador` un evento de pegado con una imagen PNG generada en el navegador. */
async function pegarImagen (localizador, nombre = 'image.png') {
  await localizador.evaluate(async (elemento, nombreDelArchivo) => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 24
    lienzo.height = 16
    const contexto = lienzo.getContext('2d')
    contexto.fillStyle = '#c22'
    contexto.fillRect(0, 0, 24, 16)
    const blob = await new Promise((resolver) => { lienzo.toBlob(resolver, 'image/png') })
    const datos = new DataTransfer()
    datos.items.add(new File([blob], nombreDelArchivo, { type: 'image/png' }))
    elemento.dispatchEvent(new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }))
  }, nombre)
}

/** Suelta archivos sobre `localizador`: una imagen PNG o un PDF, segun `tipo`. */
async function soltar (localizador, tipo = 'imagen') {
  await localizador.evaluate(async (elemento, que) => {
    const datos = new DataTransfer()
    if (que === 'imagen') {
      const lienzo = document.createElement('canvas')
      lienzo.width = 20
      lienzo.height = 20
      lienzo.getContext('2d').fillRect(0, 0, 20, 20)
      const blob = await new Promise((resolver) => { lienzo.toBlob(resolver, 'image/png') })
      datos.items.add(new File([blob], 'soltada.png', { type: 'image/png' }))
    } else {
      datos.items.add(new File(['%PDF-1.4 prueba'], 'informe.pdf', { type: 'application/pdf' }))
    }
    const caja = elemento.getBoundingClientRect()
    const campos = { dataTransfer: datos, bubbles: true, cancelable: true, clientX: caja.left + 10, clientY: caja.top + 10 }
    elemento.dispatchEvent(new DragEvent('dragover', campos))
    elemento.dispatchEvent(new DragEvent('drop', campos))
  }, tipo)
}

/** Cuantas `<img>` de la ruta propia hay en `localizador` y cuantas se dibujaron de verdad. */
async function imagenesDe (localizador) {
  return await localizador.evaluate(async (raiz) => {
    const imagenes = Array.from(raiz.querySelectorAll('img[src^="/api/bff/files/texto-rico/"]'))
    await Promise.all(imagenes.map(async (imagen) => { await imagen.decode().catch(() => {}) }))

    return { total: imagenes.length, dibujadas: imagenes.filter((imagen) => imagen.naturalWidth > 0).length }
  })
}

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
const sufijo = String(Date.now()).slice(-6)
let tareaId = null

try {
  // ===== 1. Portal: nueva Tarea =====================================================================
  const portal = await (await navegador.newContext({ viewport: { width: 1280, height: 1100 } })).newPage()
  const erroresDeConsola = []
  portal.on('pageerror', (error) => { erroresDeConsola.push(error.message) })

  await portal.goto(url('/'), { waitUntil: 'networkidle' })
  await portal.getByLabel('Correo').fill(entorno('IMAGENES_PORTAL_EMAIL'))
  await portal.getByLabel('Contraseña').fill(entorno('IMAGENES_PORTAL_CLAVE'))
  await portal.getByRole('button', { name: 'Entrar' }).first().click()
  await portal.waitForURL(/\/portal/, { timeout: 20000 })

  await portal.goto(url(`/portal/proyectos/${proyecto}`), { waitUntil: 'networkidle' })
  await portal.getByRole('tab', { name: 'Tareas', exact: true }).click()
  await portal.getByRole('button', { name: /Nueva tarea/i }).click()
  const dialogo = portal.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill(`Con imagenes ${sufijo}`)
  await dialogo.getByLabel(/Vence/).fill(manana())

  const editor = dialogo.getByRole('textbox', { name: 'Descripción' })
  await editor.waitFor({ state: 'visible', timeout: 15000 })
  await editor.click()
  await portal.keyboard.type('Mira esta captura: ')
  await pegarImagen(editor)
  await portal.waitForFunction(() => document.querySelectorAll('[role="dialog"] .texto-rico-editor img[src^=\"/api/bff/files/texto-rico/\"]').length === 1, null, { timeout: 15000 })
  await soltar(editor, 'imagen')
  await portal.waitForFunction(() => document.querySelectorAll('[role="dialog"] .texto-rico-editor img[src^=\"/api/bff/files/texto-rico/\"]').length === 2, null, { timeout: 15000 })

  const enEditor = await imagenesDe(editor)
  assert.deepEqual(enEditor, { total: 2, dibujadas: 2 }, 'las dos imagenes se subieron y se dibujan en el editor')
  assert.equal(await dialogo.getByRole('button', { name: 'Insertar imagen' }).count(), 1, 'la barra ofrece el boton de imagen')

  // Archivos: boton, soltar un PDF sobre el formulario y pegar fuera del editor.
  await dialogo.locator('input[aria-label="Elegir archivos para adjuntar"]').setInputFiles({
    name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 nota')
  })
  await soltar(dialogo.getByLabel('Nombre'), 'pdf')
  await pegarImagen(dialogo.getByLabel('Nombre'), 'image.png')
  const lista = dialogo.getByRole('list', { name: 'Archivos por adjuntar' })
  await lista.waitFor({ state: 'visible' })
  const nombres = await lista.locator('li span').allInnerTexts()
  assert.ok(nombres.some((n) => n.startsWith('nota.pdf')), 'el boton adjunta')
  assert.ok(nombres.some((n) => n.startsWith('informe.pdf')), 'soltar sobre el formulario adjunta')
  assert.ok(nombres.some((n) => /^captura-\d{8}-\d{6}\.png/.test(n)), `pegar fuera del editor adjunta con nombre propio: ${nombres.join(' | ')}`)

  // Una imagen de formato no aceptado (SVG) se rechaza con aviso y el editor sigue vivo.
  await dialogo.locator('input[aria-label="Elegir imágenes para insertar"]').setInputFiles({
    name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
  })
  await dialogo.getByRole('alert').filter({ hasText: 'PNG, JPG, GIF o WebP' }).waitFor({ timeout: 5000 })

  const respuestaDeAlta = portal.waitForResponse((r) => r.url().includes(`/api/bff/portal/projects/${proyecto}/tasks`) && r.request().method() === 'POST')
  await dialogo.getByRole('button', { name: /Crear tarea/i }).click()
  const alta = await respuestaDeAlta
  assert.equal(alta.status(), 201, `alta de la tarea: ${alta.status()}`)
  assert.match(alta.request().headers()['content-type'] ?? '', /multipart\/form-data/, 'con archivos el alta viaja como multipart')
  const creada = (await alta.json()).data
  tareaId = creada.id
  assert.equal(creada.counts.attachments, 3, 'la Tarea guardo los tres archivos')
  assert.match(creada.description_html, /api\/bff\/files\/texto-rico\//, 'la descripcion conserva las imagenes')

  // La ficha del portal muestra la imagen con los permisos del contacto.
  await portal.goto(url(`/portal/proyectos/${proyecto}?tab=tasks&tarea=${tareaId}`), { waitUntil: 'networkidle' })
  const fichaDelPortal = portal.getByRole('dialog').first()
  await fichaDelPortal.waitFor({ state: 'visible', timeout: 15000 })
  await portal.waitForFunction(() => document.querySelectorAll('[role="dialog"] .texto-rico img[src^=\"/api/bff/files/texto-rico/\"]').length === 2, null, { timeout: 15000 })
  assert.deepEqual(await imagenesDe(fichaDelPortal), { total: 2, dibujadas: 2 }, 'el contacto ve las imagenes en la ficha de su Tarea')

  // ===== 2. Portal: nuevo ticket ====================================================================
  await portal.goto(url('/portal/soporte'), { waitUntil: 'networkidle' })
  await portal.getByRole('button', { name: 'Nuevo ticket' }).click()
  const solicitud = portal.getByRole('dialog')
  await solicitud.getByLabel(/Asunto/).fill(`Ticket con captura ${sufijo}`)
  const mensaje = solicitud.getByRole('textbox', { name: 'Mensaje' })
  await mensaje.waitFor({ state: 'visible', timeout: 15000 })
  await mensaje.click()
  await portal.keyboard.type('Se ve asi: ')
  await pegarImagen(mensaje)
  await portal.waitForFunction(() => document.querySelectorAll('[role="dialog"] .texto-rico-editor img[src^=\"/api/bff/files/texto-rico/\"]').length === 1, null, { timeout: 15000 })
  const respuestaDelTicket = portal.waitForResponse((r) => r.url().endsWith('/api/bff/portal/tickets') && r.request().method() === 'POST')
  await solicitud.getByRole('button', { name: 'Enviar ticket' }).click()
  const ticket = await respuestaDelTicket
  assert.equal(ticket.status(), 201, `alta del ticket: ${ticket.status()}`)
  const ticketId = (await ticket.json()).data.id

  await portal.goto(url(`/portal/soporte?ticket=${ticketId}`), { waitUntil: 'networkidle' })
  await portal.waitForFunction(() => document.querySelectorAll('[role="dialog"] .texto-rico img[src^=\"/api/bff/files/texto-rico/\"]').length >= 1, null, { timeout: 15000 })
  assert.deepEqual(await imagenesDe(portal.getByRole('dialog').first()), { total: 1, dibujadas: 1 }, 'la ficha del ticket muestra la captura')

  // ===== 3. Panel: el equipo ve y comenta ===========================================================
  const panel = await (await navegador.newContext({ viewport: { width: 1280, height: 1100 } })).newPage()
  panel.on('pageerror', (error) => { erroresDeConsola.push(error.message) })
  await panel.goto(url('/colab'), { waitUntil: 'networkidle' })
  await panel.getByText('Entrar con correo y contraseña').click()
  await panel.getByLabel('Correo').fill(entorno('IMAGENES_STAFF_EMAIL'))
  await panel.getByLabel('Contraseña').fill(entorno('IMAGENES_STAFF_CLAVE'))
  await panel.getByRole('button', { name: /Entrar|Continuar/ }).first().click()
  await panel.waitForURL((u) => !u.pathname.startsWith('/colab'), { timeout: 20000 })

  await panel.goto(url(`/proyectos/${proyecto}?tab=tareas&tarea=${tareaId}`), { waitUntil: 'networkidle' })
  await panel.waitForFunction(() => document.querySelectorAll('[role="dialog"] .texto-rico img[src^=\"/api/bff/files/texto-rico/\"]').length === 2, null, { timeout: 20000 })
  assert.deepEqual(await imagenesDe(panel.getByRole('dialog').first()), { total: 2, dibujadas: 2 }, 'el equipo ve las imagenes del contacto')

  const comentario = panel.getByRole('textbox', { name: /Comentar en esta/ })
  await comentario.scrollIntoViewIfNeeded()
  await comentario.click()
  await panel.keyboard.type('Recibido, adjunto la correccion: ')
  await pegarImagen(comentario)
  await panel.waitForFunction(() => document.querySelectorAll('.texto-rico-editor img[src^=\"/api/bff/files/texto-rico/\"]').length >= 1, null, { timeout: 15000 })
  const respuestaDelComentario = panel.waitForResponse((r) => r.url().includes(`/api/bff/tasks/${tareaId}/comments`) && r.request().method() === 'POST')
  await panel.getByRole('button', { name: 'Comentar' }).click()
  assert.equal((await respuestaDelComentario).status(), 201, 'el comentario con imagen se guarda')
  await panel.waitForFunction(() => document.querySelectorAll('ol .texto-rico img[src^=\"/api/bff/files/texto-rico/\"]').length >= 1, null, { timeout: 15000 })
  const hilo = await imagenesDe(panel.locator('ol .texto-rico').first())
  assert.deepEqual(hilo, { total: 1, dibujadas: 1 }, 'el comentario muestra su imagen en el hilo')

  assert.deepEqual(erroresDeConsola, [], `errores de pagina: ${erroresDeConsola.join(' | ')}`)
  console.log('imagenes-ricas.browser: OK')
} finally {
  await navegador.close()
}

/** Manana como `dd/mm/aaaa`, que es como se escribe la fecha en el formulario. */
function manana () {
  const dia = new Date(Date.now() + 86_400_000 * 2)
  const dos = (n) => String(n).padStart(2, '0')

  return `${dos(dia.getDate())}/${dos(dia.getMonth() + 1)}/${dia.getFullYear()}`
}
