import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/**
 * Verifica el asistente que redacta la descripcion de una Tarea, contra un Next local ya levantado.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita servidor y sesion:
 *
 * ```bash
 * DESCRIPCION_TEST_URL=http://localhost:3011 \
 * DESCRIPCION_TEST_EMAIL=ana@wiwo.me DESCRIPCION_TEST_PASSWORD=mock1234 \
 *   node pruebas/descripcion-ia.browser.mjs
 * ```
 *
 * Lo que comprueba es lo que no se puede comprobar sin navegador, y que falla en silencio:
 *
 *   1. **Con la capa de IA apagada el boton no se dibuja.** La API contesta 404 a todo `/ia/*`; un
 *      boton que falla al apretarlo es peor que no tenerlo.
 *   2. **Los tres finales de la llamada existen.** Texto, error con su motivo, y una llamada que no
 *      vuelve nunca de la que igual se sale.
 *   3. **Aceptar el borrador no pisa lo escrito sin preguntar.** Con el campo escrito hay que elegir
 *      entre agregar y reemplazar; cerrar el dialogo deja el campo intacto.
 *
 * Contra el build, no contra `next dev`: en desarrollo la pagina no hidrata a tiempo y los clics no
 * responden, asi que daria un falso negativo.
 */
const destino = new URL(process.env.DESCRIPCION_TEST_URL ?? 'http://localhost:3011')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')
assert.ok(
  process.env.DESCRIPCION_TEST_EMAIL && process.env.DESCRIPCION_TEST_PASSWORD,
  'Falta sesión local de prueba.'
)

const ESCRITO_A_MANO = 'Lo que ya venía escrito a mano.'
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/** Como contesta la ruta del asistente en cada momento. Lo mueve cada caso antes de disparar. */
let modo = 'apagada'

try {
  const contexto = await navegador.newContext({ timezoneId: 'UTC', viewport: { width: 1440, height: 1100 } })
  const respuesta = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email: process.env.DESCRIPCION_TEST_EMAIL, password: process.env.DESCRIPCION_TEST_PASSWORD }
  })
  assert.ok(respuesta.ok(), `Login: HTTP ${respuesta.status()}`)

  await contexto.route('**/api/bff/ia/tareas/describir', async (ruta) => {
    const metodo = ruta.request().method()

    // El 404 es el de la puerta comun de `/ia/*`: no distingue GET de POST, igual que la API.
    if (modo === 'apagada') {
      return await ruta.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Recurso desconocido: "ia".' } } })
    }

    if (metodo === 'GET') return await ruta.fulfill({ json: { data: { disponible: true } } })

    if (modo === 'falla') {
      return await ruta.fulfill({
        status: 502,
        json: { error: { code: 'provider_error', message: 'El proveedor de IA no respondió.' } }
      })
    }

    // Una peticion que nunca se contesta: es la unica forma de ver si el "Redactando…" tiene salida.
    if (modo === 'cuelga') return await new Promise(() => {})

    return await ruta.fulfill({ json: { data: { descripcion: 'Borrador del asistente.' } } })
  })

  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(8000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))

  /** Abre el formulario de alta de Tarea y devuelve su dialogo. */
  async function abrirFormulario () {
    await pagina.goto(new URL('/procesos', destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })

    const nueva = pagina.getByRole('button', { name: 'Nueva tarea', exact: true })
    await nueva.waitFor({ timeout: 60000 })

    // El panel saluda con "Abre tu jornada", que tapa la pantalla entera. No es parte de esta prueba:
    // se cierra y se sigue. Por `evaluate` y no con `click()`, porque el velo del dialogo se come el
    // puntero y el clic normal se queda reintentando hasta agotar el tiempo.
    const jornada = pagina.getByRole('dialog').filter({ hasText: 'Abre tu jornada' })
    await jornada.waitFor({ timeout: 10000 }).catch(() => {})

    if (await jornada.count() > 0) {
      await jornada.getByRole('button', { name: 'Cerrar', exact: true })
        .evaluate((boton) => { boton.click() })
      await jornada.waitFor({ state: 'hidden' })
    }

    await nueva.evaluate((boton) => { boton.click() })

    const dialogo = pagina.getByRole('dialog').first()
    await dialogo.waitFor()

    return dialogo
  }

  /** Contesta las tres preguntas y aprieta "Redactar". El dialogo del asistente queda abierto. */
  async function contestarYRedactar (asistente) {
    await asistente.getByRole('textbox').fill('Armar la grilla de contenidos de septiembre para el cliente')
    await asistente.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await asistente.getByRole('textbox').fill('Para Colbún, lo pidió la contraparte de marketing')
    await asistente.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await asistente.getByRole('textbox').fill('Cuando la grilla está aprobada y cargada en el calendario')
    await asistente.getByRole('button', { name: 'Redactar', exact: true }).click()
  }

  // === 1. Capa apagada: el boton no existe =========================================================
  let dialogo = await abrirFormulario()
  await dialogo.getByLabel(/^Descripción/).waitFor()
  await pagina.waitForTimeout(500)
  assert.equal(
    await dialogo.getByRole('button', { name: 'Redactar con IA', exact: true }).count(),
    0,
    'Con la IA apagada el boton no debe dibujarse.'
  )

  // === 2. Capa encendida: el boton aparece =========================================================
  modo = 'normal'
  dialogo = await abrirFormulario()
  const campoDescripcion = dialogo.getByLabel(/^Descripción/)
  await campoDescripcion.fill(ESCRITO_A_MANO)

  const boton = dialogo.getByRole('button', { name: 'Redactar con IA', exact: true })
  await boton.waitFor()

  // === 3. La llamada falla: mensaje claro, sin spinner colgado =====================================
  modo = 'falla'
  // El dialogo del asistente se identifica por su texto y no por `.last()`: al cerrarse, `.last()`
  // pasa a resolver el formulario, que sigue abierto, y la espera de "oculto" no terminaria nunca.
  const asistente = pagina.getByRole('dialog').filter({ hasText: 'Contesta lo que puedas' })
  await boton.evaluate((elemento) => { elemento.click() })
  await asistente.getByRole('button', { name: 'Siguiente', exact: true }).waitFor()
  await contestarYRedactar(asistente)

  await asistente.getByRole('alert').waitFor()
  assert.match(await asistente.getByRole('alert').innerText(), /proveedor/i, 'El error debe decir qué pasó.')
  assert.equal(await asistente.getByRole('status').count(), 0, 'El "Redactando…" no puede quedar colgado.')
  assert.equal(
    await asistente.getByRole('textbox').inputValue(),
    'Cuando la grilla está aprobada y cargada en el calendario',
    'Un fallo no puede llevarse lo contestado.'
  )

  // === 4. La llamada no vuelve: se puede cancelar ==================================================
  modo = 'cuelga'
  await asistente.getByRole('button', { name: 'Redactar', exact: true }).click()
  await asistente.getByRole('status').waitFor()

  const cancelar = asistente.getByRole('button', { name: 'Cancelar la redacción', exact: true })
  await cancelar.click()
  await asistente.getByRole('status').waitFor({ state: 'hidden' })
  assert.equal(
    await asistente.getByRole('textbox').inputValue(),
    'Cuando la grilla está aprobada y cargada en el calendario',
    'Cancelar no puede llevarse lo contestado.'
  )

  // === 5. Descartar el borrador deja el campo como estaba ==========================================
  modo = 'normal'
  await asistente.getByRole('button', { name: 'Redactar', exact: true }).click()
  await asistente.getByRole('button', { name: 'Agregar al final', exact: true }).waitFor()
  await asistente.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await asistente.waitFor({ state: 'hidden' })
  assert.equal(
    await campoDescripcion.inputValue(),
    ESCRITO_A_MANO,
    'Cerrar el asistente no puede tocar la descripción.'
  )

  // === 6. Con texto escrito, aceptar pregunta y "Agregar al final" conserva lo de la persona =======
  await boton.evaluate((elemento) => { elemento.click() })
  await asistente.getByRole('button', { name: 'Siguiente', exact: true }).waitFor()
  await contestarYRedactar(asistente)
  await asistente.getByRole('button', { name: 'Agregar al final', exact: true }).waitFor()
  assert.equal(
    await asistente.getByRole('button', { name: 'Reemplazar lo escrito', exact: true }).count(),
    1,
    'Con el campo escrito tienen que ofrecerse los dos modos.'
  )
  await asistente.getByRole('button', { name: 'Agregar al final', exact: true }).click()
  await asistente.waitFor({ state: 'hidden' })
  assert.equal(
    await campoDescripcion.inputValue(),
    `${ESCRITO_A_MANO}\n\nBorrador del asistente.`,
    'Agregar al final conserva entero lo escrito.'
  )

  // === 7. Con el campo vacio no se pregunta nada ===================================================
  await campoDescripcion.fill('')
  await boton.evaluate((elemento) => { elemento.click() })
  await asistente.getByRole('button', { name: 'Siguiente', exact: true }).waitFor()
  await contestarYRedactar(asistente)
  await asistente.getByRole('button', { name: 'Usar esta descripción', exact: true }).waitFor()
  assert.equal(
    await asistente.getByRole('button', { name: 'Agregar al final', exact: true }).count(),
    0,
    'Sin nada que perder no se pregunta.'
  )
  await asistente.getByRole('button', { name: 'Usar esta descripción', exact: true }).click()
  await asistente.waitFor({ state: 'hidden' })
  assert.equal(await campoDescripcion.inputValue(), 'Borrador del asistente.')

  assert.deepEqual(errores, [], 'No debe haber errores de JavaScript.')
  console.info('Asistente de descripción: apagado invisible, error claro, cancelación viva y nada pisado.')
} catch (fallo) {
  await mkdir('output/playwright', { recursive: true })
  const paginas = navegador.contexts().flatMap((contexto) => contexto.pages())

  if (paginas.length > 0) {
    await paginas[0].screenshot({ path: 'output/playwright/descripcion-ia-debug.png', fullPage: true })
  }

  throw fallo
} finally {
  await navegador.close()
}
