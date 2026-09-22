import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { LICITACIONES } from '../mock/datos.js'

/**
 * Verifica que una Tarea se pueda crear en una Licitación desde el alta rápida.
 *
 * El Espacio de una licitación abierta **no** sale en `GET /projects` —la API lo esconde mientras la
 * oportunidad no se gane—, así que esto comprueba lo único que el navegador puede comprobar: que el
 * selector la ofrece bajo su propio rótulo y que el `POST /tasks` sale con ese id y con
 * `rel_type: project`, que es como una Licitación recibe trabajo.
 *
 * Requiere la app compilada (`pnpm build && pnpm start`) contra el mock, y
 * TAREA_LICITACION_EMAIL/PASSWORD; TAREA_LICITACION_URL cambia el origen.
 */
const destino = new URL(process.env.TAREA_LICITACION_URL ?? 'http://localhost:3110')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const licitacion = LICITACIONES.find((fila) => fila.estado === 'abierta')
const perdida = LICITACIONES.find((fila) => fila.estado === 'perdida')
const nombreVisible = `${licitacion.company} — ${licitacion.espacio.name}`

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ timezoneId: 'UTC', viewport: { width: 1440, height: 1100 } })
  const login = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email: process.env.TAREA_LICITACION_EMAIL, password: process.env.TAREA_LICITACION_PASSWORD }
  })
  assert.ok(login.ok(), `Login: HTTP ${login.status()}`)

  const creadas = []
  await contexto.route('**/api/bff/tasks', async (ruta) => {
    if (ruta.request().method() !== 'POST') return await ruta.continue()
    creadas.push(ruta.request().postDataJSON())

    return await ruta.fulfill({ json: { data: { id: 9901 } } })
  })

  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(8000)
  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))

  await pagina.goto(new URL('/procesos', destino).href, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await pagina.waitForLoadState('networkidle')

  // El aviso de jornada se pinta encima del panel y se come el primer clic.
  await pagina.keyboard.press('Escape')

  await pagina.getByRole('button', { name: 'Nueva tarea', exact: true }).click()
  const dialogo = pagina.getByRole('dialog')
  await dialogo.waitFor()
  await dialogo.getByLabel(/^Nombre/).fill('Tarea de prueba en licitación')

  await dialogo.getByLabel('Proyectos', { exact: true }).click()
  const menu = pagina.getByRole('menu')
  await menu.getByRole('menuitemcheckbox').first().waitFor()

  const rotulos = await menu.locator('p').allInnerTexts()
  assert.deepEqual(rotulos, ['PROYECTOS', 'LICITACIONES'], `Rótulos del menú: ${JSON.stringify(rotulos)}`)

  const filas = await menu.getByRole('menuitemcheckbox').allInnerTexts()
  assert.ok(filas.includes(nombreVisible), `La licitación abierta no está en el menú: ${JSON.stringify(filas)}`)
  assert.ok(
    !filas.some((fila) => fila.includes(perdida.espacio.name)),
    'Una licitación perdida no puede ofrecerse como destino.'
  )

  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/tarea-en-licitacion-menu.png' })

  await menu.getByRole('menuitemcheckbox', { name: nombreVisible, exact: true }).click()
  await pagina.keyboard.press('Escape')

  const chip = dialogo.getByRole('button', { name: `Sacar ${nombreVisible}` })
  await chip.waitFor()
  assert.match(await chip.innerText(), /Licitación/, 'El chip tiene que decir de qué clase es el destino.')

  // Los dos obligatorios del alta, que no tienen nada que ver con el destino pero sin ellos no hay POST.
  await dialogo.getByLabel(/^Descripción/).fill('Propuesta técnica de la licitación.')
  await dialogo.getByLabel(/^Área/).click()
  await pagina.getByRole('option').first().click()

  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/tarea-en-licitacion.png', fullPage: true })

  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  await pagina.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0).catch(() => {})

  assert.equal(
    creadas.length, 1,
    `POST /tasks: ${creadas.length} llamadas. Diálogo: ${await dialogo.innerText().catch(() => 'cerrado')}`
  )
  assert.equal(creadas[0].rel_type, 'project')
  assert.equal(creadas[0].rel_id, licitacion.id)
  assert.deepEqual(errores, [])

  // Segundo camino: desde la ficha de la Licitacion, donde el destino ya viene puesto. Son las
  // mismas pestañas del Espacio, asi que lo que se comprueba es que el id preseleccionado sea el de
  // la licitacion y no quede sin nombre en el selector.
  creadas.length = 0
  await pagina.goto(new URL(`/licitaciones/${licitacion.id}?tab=tareas`, destino).href, { waitUntil: 'domcontentloaded' })
  await pagina.waitForLoadState('networkidle')
  await pagina.getByRole('button', { name: 'Nueva tarea', exact: true }).click()
  await dialogo.waitFor()

  const destinoPuesto = dialogo.getByRole('button', { name: `Sacar ${nombreVisible}` })
  await destinoPuesto.waitFor()

  await dialogo.getByLabel(/^Nombre/).fill('Tarea creada desde la ficha')
  await dialogo.getByLabel(/^Descripción/).fill('Sale de la pestaña Tareas de la licitación.')
  await dialogo.getByLabel(/^Área/).click()
  await pagina.getByRole('option').first().click()
  await dialogo.getByRole('button', { name: 'Crear', exact: true }).click()
  await pagina.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0).catch(() => {})

  assert.equal(
    creadas.length, 1,
    `POST desde la ficha: ${creadas.length}. Diálogo: ${await dialogo.innerText().catch(() => 'cerrado')}`
  )
  assert.equal(creadas[0].rel_id, licitacion.id)
  assert.deepEqual(errores, [])

  // Sin la seccion comercial —403, que es lo que contesta la API a quien no la ve— el alta tiene que
  // seguir sirviendo los Proyectos, sin rotulos y sin aviso de error.
  await contexto.route('**/api/bff/licitaciones**', async (ruta) => (
    await ruta.fulfill({ status: 403, json: { error: { code: 'forbidden', message: 'Sin permiso' } } })
  ))
  await pagina.goto(new URL('/procesos', destino).href, { waitUntil: 'domcontentloaded' })
  await pagina.waitForLoadState('networkidle')
  await pagina.getByRole('button', { name: 'Nueva tarea', exact: true }).click()
  await dialogo.waitFor()
  await dialogo.getByLabel('Proyectos', { exact: true }).click()
  await menu.getByRole('menuitemcheckbox').first().waitFor()

  assert.deepEqual(await menu.locator('p').allInnerTexts(), [], 'Sin licitaciones no hay nada que rotular.')
  const soloProyectos = await menu.getByRole('menuitemcheckbox').allInnerTexts()
  assert.ok(soloProyectos.length > 0, 'Los Proyectos tienen que seguir estando.')
  assert.ok(!soloProyectos.includes(nombreVisible), 'La licitación no puede aparecer sin su listado.')
  await pagina.keyboard.press('Escape')

  console.log(`OK: tarea creada en la licitación ${licitacion.id} (${nombreVisible}), desde el alta rápida y desde su ficha.`)
} finally {
  await navegador.close()
}
