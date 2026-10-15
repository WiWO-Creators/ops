import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Presencia en recursos con «Ops en vivo» encendido: dos personas del equipo miran el mismo Proyecto,
 * Tarea y Ticket y se ven entre sí; quien escribe la respuesta de un Ticket aparece como «está
 * respondiendo»; al irse una, la otra deja de verla.
 *
 * Requiere, todo local (igual que `en-vivo-dos-sesiones.browser.mjs`):
 *   - `MOCK_EN_VIVO=1 PORT=3001 pnpm mock` (maestro y presencia encendidos),
 *   - `pnpm dev -p 3010` con `API_BASE` del mock, `SESION_CLAVE`, `EN_VIVO_BOLETO_SECRETO` y
 *     `NEXT_PUBLIC_EN_VIVO_URL=ws://localhost:4010/en-vivo`,
 *   - `pnpm en-vivo` con `EN_VIVO_SECRETO`, `EN_VIVO_BOLETO_SECRETO`, `API_BASE` y
 *     `EN_VIVO_ORIGENES=http://localhost:3010`.
 * `EN_VIVO_TEST_URL` cambia el origen del panel; `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, el navegador.
 *
 * Los ids (Proyecto 1, Tarea 500, Ticket 40) son los de los datos de ejemplo del mock.
 */
const destino = new URL(process.env.EN_VIVO_TEST_URL ?? 'http://localhost:3010')

assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/** Abre una sesión del panel y anota lo que el servicio le avisa de presencia. */
async function abrirSesion (email) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
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
async function textoVisible (sesion, patron, visible = true, limiteMs = 20000) {
  const fin = Date.now() + limiteMs

  while (Date.now() < fin) {
    const cuerpo = await sesion.pagina.evaluate(() => document.body.innerText)

    if (patron.test(cuerpo) === visible) return
    await new Promise((resolver) => setTimeout(resolver, 150))
  }
  assert.fail(`Tiempo agotado: ${visible ? 'no apareció' : 'no desapareció'} ${patron}`)
}

try {
  const ana = await abrirSesion('ana@wiwo.me')
  // Carla (staff 3): Bruno, el 2, tiene 2FA por correo y pediría un código.
  const carla = await abrirSesion('carla@wiwo.me')

  // --- Proyecto: la cabecera dice que la otra persona lo mira.
  await ir(ana, '/proyectos/1')
  await ir(carla, '/proyectos/1')
  await textoVisible(ana, /1 persona más está viendo esto/)
  await textoVisible(carla, /1 persona más está viendo esto/)
  console.log('OK: la cabecera del Proyecto muestra a la otra persona.')

  // --- Tarea: el detalle (modal) lo muestra.
  await ir(ana, '/tareas?tarea=500')
  await ir(carla, '/tareas?tarea=500')
  await textoVisible(ana, /1 persona más está viendo esto/)
  console.log('OK: el detalle de la Tarea muestra a la otra persona.')

  // --- Ticket: quien escribe la respuesta aparece como «está respondiendo».
  await ir(ana, '/tickets?ticket=40')
  await ir(carla, '/tickets?ticket=40')
  await textoVisible(ana, /1 persona más está viendo esto/)

  const caja = carla.pagina.getByRole('textbox', { name: 'Tu respuesta' })

  await caja.click()
  await carla.pagina.keyboard.type('Revisando el formulario', { delay: 30 })
  await textoVisible(ana, /Carla está respondiendo…/)
  console.log('OK: «Carla está respondiendo…» aparece mientras escribe.')

  // Sin teclear, el aviso se vence solo (5 s).
  await textoVisible(ana, /Carla está respondiendo…/, false, 12000)
  console.log('OK: «escribiendo» se vence solo.')

  // --- Al irse Carla, Ana deja de verla.
  await carla.contexto.close()
  await textoVisible(ana, /persona más está viendo esto/, false)
  console.log('OK: al irse la otra persona, la presencia se limpia.')

  for (const sesion of [ana]) assert.deepEqual(sesion.errores, [], 'La página lanzó errores de JavaScript')
  await ana.contexto.close()
} finally {
  await navegador.close()
}
