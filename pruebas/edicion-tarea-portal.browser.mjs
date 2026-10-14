import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica en navegador la edicion de una Tarea por el contacto del cliente: editar, cancelar y
 * reabrir desde el detalle, y el editor rico en el alta.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita el mock y un Next servido:
 *
 * ```bash
 * PORT=3481 node mock/servidor.js &
 * API_BASE=http://localhost:3481/api/v1 SESION_CLAVE=<64 hex> pnpm exec next dev -p 3491 &
 * URL_BASE=http://localhost:3491 URL_MOCK=http://localhost:3481 node pruebas/edicion-tarea-portal.browser.mjs
 * ```
 *
 * ## Que cubre
 *
 *  1. El alta usa el editor rico (un `textbox`) y no un `textarea`.
 *  2. El detalle de una Tarea abierta ofrece Editar y Cancelar; guardar cambia el nombre en la ficha.
 *  3. Cancelar pide confirmacion que dice que no se elimina; confirmada, la ficha queda en
 *     «Cancelada» y ofrece Reabrir en vez de Editar.
 *  4. Reabrir devuelve la Tarea a «Por iniciar».
 *
 * ## Limites
 *
 * Corre contra el mock, que simula lo basico del contrato: no replica la deduplicacion ni todos los
 * 422 de la API real. Cuando existe una instalacion con la API nueva hay que repetirlo contra ella.
 */
const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3491'
const URL_MOCK = process.env.URL_MOCK ?? 'http://localhost:3481'
const SALIDA = process.env.SALIDA ?? '/tmp'

/** Hace un `fetch` JSON al mock y devuelve el cuerpo; falla si la respuesta no es 2xx. */
async function mock (ruta, { token, metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`${URL_MOCK}/api/v1${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })

  assert.ok(respuesta.ok, `${metodo} ${ruta}: HTTP ${respuesta.status}`)

  return (await respuesta.json()).data
}

const staff = await mock('/auth/login', { metodo: 'POST', cuerpo: { email: 'ana@wiwo.me', password: 'mock1234' } })
await mock('/clients/1/portal-crea-tareas', { token: staff.access_token, metodo: 'PUT', cuerpo: { habilitado: true } })

const contacto = await mock('/auth/portal/login', { metodo: 'POST', cuerpo: { email: 'clienta@acme.com', password: 'portal1234' } })
const nombre = `Prueba de edicion ${Date.now()}`
const tarea = await mock('/portal/projects/1/tasks', {
  token: contacto.access_token,
  metodo: 'POST',
  cuerpo: { name: nombre, due_date: '2027-03-15', description: '<p>Detalle inicial</p>', format: 'html' }
})

const sesion = await fetch(`${URL_BASE}/api/sesion`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ portal: true, email: 'clienta@acme.com', password: 'portal1234' })
})

assert.ok(sesion.ok, `No se pudo entrar al portal: ${sesion.status}`)

const cookie = (sesion.headers.getSetCookie?.() ?? []).map((linea) => linea.split(';')[0]).find((par) => par.startsWith('ops_portal='))

assert.ok(cookie !== undefined, 'El login no devolvio la cookie del portal.')

const navegador = await chromium.launch()
const errores = []

try {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 1000 } })

  await contexto.addCookies([{
    name: 'ops_portal', value: cookie.slice('ops_portal='.length), domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax'
  }])

  const pagina = await contexto.newPage()

  pagina.on('console', (mensaje) => { if (mensaje.type() === 'error') errores.push(mensaje.text()) })
  pagina.on('pageerror', (error) => errores.push(String(error)))

  // 1. El alta usa el editor rico.
  await pagina.goto(`${URL_BASE}/portal/proyectos/1?tab=tasks`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: /^Nueva tarea$/i }).first().click()
  // El editor carga aparte: mientras tanto hay un marcador, y el `contenteditable` es lo que prueba que llego.
  await pagina.locator('[role="dialog"] [contenteditable="true"]').waitFor()
  assert.equal(await pagina.locator('dialog textarea, [role="dialog"] textarea').count(), 0, 'El alta sigue con un textarea.')
  await pagina.keyboard.press('Escape')

  // 2. Editar desde el detalle.
  await pagina.goto(`${URL_BASE}/portal/proyectos/1?tab=tasks&tarea=${tarea.id}`, { waitUntil: 'networkidle' })

  const detalle = pagina.getByRole('dialog')

  await detalle.getByRole('button', { name: 'Editar', exact: true }).click()
  await detalle.getByRole('button', { name: /^Cancelar tarea$/ }).waitFor({ state: 'detached' })
  await detalle.getByLabel('Nombre').fill(`${nombre} (editada)`)
  await detalle.getByRole('button', { name: 'Guardar cambios' }).click()
  await detalle.getByText(`${nombre} (editada)`).first().waitFor()

  // 3. Cancelar pide confirmacion y no elimina.
  await detalle.getByRole('button', { name: /^Cancelar tarea$/ }).click()
  await detalle.getByText(/No se elimina/).waitFor()
  await detalle.getByRole('button', { name: /^Cancelar tarea$/ }).last().click()
  await detalle.getByRole('button', { name: 'Reabrir' }).waitFor()
  assert.equal(await detalle.getByRole('button', { name: 'Editar', exact: true }).count(), 0, 'Una Cancelada no se edita.')
  assert.ok((await detalle.innerText()).includes('Cancelada'), 'La ficha no muestra el estado Cancelada.')
  await pagina.screenshot({ path: `${SALIDA}/edicion-tarea-portal-cancelada.png` })

  // 4. Reabrir.
  await detalle.getByRole('button', { name: 'Reabrir' }).click()
  await detalle.getByRole('button', { name: 'Editar', exact: true }).waitFor()
  assert.ok((await detalle.innerText()).includes('Por iniciar'), 'Reabrir no devolvio la Tarea a «Por iniciar».')

  assert.deepEqual(errores.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'Hubo errores en la consola.')
  console.log('Edicion, cancelacion y reapertura del portal: bien.')
} finally {
  await navegador.close()
}
