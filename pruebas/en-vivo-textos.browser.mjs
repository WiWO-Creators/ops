import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Edición conjunta de textos con «Ops en vivo» encendido: dos personas del equipo editan a la vez la
 * descripción de una Tarea y el borrador de respuesta de un Ticket, se ven los cambios y los cursores,
 * el servicio guarda solo y, al enviar la respuesta, la caja queda vacía en las dos.
 *
 * Requiere, todo local (como `en-vivo-presencia.browser.mjs`, con un paso más):
 *   - `MOCK_EN_VIVO=1 PORT=3001 pnpm mock` (maestro y textos encendidos),
 *   - `pnpm dev -p 3010` con `API_BASE` del mock, `SESION_CLAVE`, `EN_VIVO_BOLETO_SECRETO` y
 *     `NEXT_PUBLIC_EN_VIVO_URL=ws://localhost:4010/en-vivo`,
 *   - `node pruebas/apoyo/board-textos-servidor.mjs`: el board falso de textos; imprime su URL,
 *   - `pnpm en-vivo` con `API_BASE=<esa URL>`, `EN_VIVO_SECRETO=secreto-de-prueba-en-vivo-0123456789abcdef`,
 *     `EN_VIVO_BOLETO_SECRETO` (el del panel) y `EN_VIVO_ORIGENES=http://localhost:3010`.
 * `EN_VIVO_TEST_URL` cambia el origen del panel; `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, el navegador.
 *
 * Los ids (Tarea 500, Ticket 40) son los de los datos de ejemplo del mock y del board falso.
 */
const destino = new URL(process.env.EN_VIVO_TEST_URL ?? 'http://localhost:3010')

assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

async function abrirSesion (email) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
  const acceso = await contexto.request.post(new URL('/api/sesion', destino).href, { data: { email, password: 'mock1234' } })

  assert.equal(acceso.status(), 200, `No se pudo iniciar sesión como ${email}`)

  const pagina = await contexto.newPage()
  const sesion = { pagina, contexto, errores: [] }

  pagina.on('pageerror', (fallo) => sesion.errores.push(fallo.message))

  return sesion
}

async function ir (sesion, ruta) {
  await sesion.pagina.goto(new URL(ruta, destino).href, { waitUntil: 'load', timeout: 90000 })
}

/** Espera a que aparezca (o desaparezca) un texto en la página. */
async function textoVisible (sesion, patron, visible = true, limiteMs = 25000) {
  const fin = Date.now() + limiteMs

  while (Date.now() < fin) {
    const cuerpo = await sesion.pagina.evaluate(() => document.body.innerText)

    if (patron.test(cuerpo) === visible) return
    await new Promise((resolver) => setTimeout(resolver, 150))
  }
  assert.fail(`Tiempo agotado: ${visible ? 'no apareció' : 'no desapareció'} ${patron}`)
}

/** El texto del editor con ese nombre accesible, sin las etiquetas con el nombre de quien tiene el cursor ahí. */
async function textoDelEditor (sesion, nombre, limiteMs) {
  return await sesion.pagina.getByRole('textbox', { name: nombre }).evaluate((editor) => {
    const copia = editor.cloneNode(true)

    copia.querySelectorAll('.collaboration-carets__label').forEach((etiqueta) => { etiqueta.remove() })

    return copia.textContent ?? ''
  }, undefined, { timeout: limiteMs })
}

async function esperarEditor (sesion, nombre, patron, limiteMs = 25000) {
  const fin = Date.now() + limiteMs
  let texto = null

  while (Date.now() < fin) {
    texto = await textoDelEditor(sesion, nombre, 500).catch(() => null)

    if (texto !== null && patron.test(texto)) return
    await new Promise((resolver) => setTimeout(resolver, 150))
  }
  assert.fail(`Tiempo agotado: el editor «${nombre}» no mostró ${patron} (tenía ${JSON.stringify(texto)})`)
}

try {
  const ana = await abrirSesion('ana@wiwo.me')
  // Carla (staff 3): Bruno, el 2, tiene 2FA por correo y pediría un código.
  const carla = await abrirSesion('carla@wiwo.me')

  // --- Descripción de la Tarea: las dos abren «Editar» y escriben sobre el mismo texto.
  await ir(ana, '/tareas?tarea=500')
  await ir(carla, '/tareas?tarea=500')
  for (const sesion of [ana, carla]) await sesion.pagina.getByRole('button', { name: 'Editar', exact: true }).first().click()

  await esperarEditor(ana, 'Descripción', /Descripción inicial de la tarea/)
  await esperarEditor(carla, 'Descripción', /Descripción inicial de la tarea/)
  await textoVisible(ana, /Editando contigo/)
  console.log('OK: las dos personas abren la descripción conjunta y se ven.')

  const descripcionAna = ana.pagina.getByRole('textbox', { name: 'Descripción' })

  await descripcionAna.click()
  await ana.pagina.keyboard.press('Control+End')
  await ana.pagina.keyboard.type(' y lo que suma Ana', { delay: 20 })
  await esperarEditor(carla, 'Descripción', /y lo que suma Ana/)
  console.log('OK: lo que escribe Ana aparece en el editor de Carla.')

  await textoVisible(ana, /Guardado \d\d:\d\d/)
  console.log('OK: el servicio guardó la descripción en el board (aviso «Guardado»).')

  // --- Respuesta del Ticket: el borrador compartido.
  await ir(ana, '/tickets?ticket=40')
  await ir(carla, '/tickets?ticket=40')
  await esperarEditor(ana, 'Tu respuesta', /^\s*$/)
  await esperarEditor(carla, 'Tu respuesta', /^\s*$/)
  await textoVisible(ana, /Editando contigo/)

  await carla.pagina.getByRole('textbox', { name: 'Tu respuesta' }).click()
  await carla.pagina.keyboard.type('Ya lo estamos viendo', { delay: 20 })
  await esperarEditor(ana, 'Tu respuesta', /Ya lo estamos viendo/)
  console.log('OK: el borrador de Carla aparece en la caja de Ana.')

  await textoVisible(carla, /Guardado \d\d:\d\d/)
  console.log('OK: el servicio guardó el borrador en el board.')

  // Ana envía la respuesta: la caja queda vacía en las dos. El envío se simula en el navegador porque
  // lo que se prueba es la caja, no el board (el mock todavía no acepta `format: 'html'` en la respuesta).
  await ana.pagina.route('**/api/bff/tickets/40/respuestas', async (ruta) => {
    if (ruta.request().method() === 'POST') await ruta.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    else await ruta.continue()
  })
  await ana.pagina.getByRole('textbox', { name: 'Tu respuesta' }).click()
  await ana.pagina.keyboard.press('Control+Enter')
  await esperarEditor(ana, 'Tu respuesta', /^\s*$/)
  await esperarEditor(carla, 'Tu respuesta', /^\s*$/)
  console.log('OK: al enviar la respuesta, la caja queda vacía en las dos.')

  for (const sesion of [ana, carla]) assert.deepEqual(sesion.errores, [], 'La página lanzó errores de JavaScript')
  await Promise.all([ana.contexto.close(), carla.contexto.close()])
} finally {
  await navegador.close()
}
