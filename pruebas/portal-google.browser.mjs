import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica en navegador el acceso con Google al portal de clientes: el portal de siempre con el
 * interruptor global apagado, el flujo correo → botón de Google → sesión, la contraseña como
 * alternativa, el cierre con «exigir Google» y la configuración en la ficha del cliente.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita el mock y un Next servido:
 *
 * ```bash
 * PORT=3482 node mock/servidor.js &
 * API_BASE=http://localhost:3482/api/v1 SESION_CLAVE=<64 hex> pnpm exec next dev -p 3492 &
 * URL_BASE=http://localhost:3492 URL_MOCK=http://localhost:3482 node pruebas/portal-google.browser.mjs
 * ```
 *
 * ## Límites
 *
 * El script de Google Identity Services se reemplaza por un doble que entrega la credencial
 * `mock:<correo>` (el atajo del mock): sin red a Google no hay forma de obtener un ID token real, así
 * que esto prueba nuestro lado —los pasos, el BFF, la sesión— y no el diálogo de Google. El botón real
 * y un `hd` real hay que probarlos a mano con un Client ID de prueba.
 */
const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3492'
const URL_MOCK = process.env.URL_MOCK ?? 'http://localhost:3482'
const SALIDA = process.env.SALIDA ?? '/tmp'
const CLIENT_ID = 'mock-1234567890-abc.apps.googleusercontent.com'

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

/** Doble de Google Identity Services: dibuja un botón que entrega `mock:<login_hint>`. */
const GIS_DOBLE = `
window.google = { accounts: { id: {
  initialize: (opciones) => { window.__gis = opciones },
  renderButton: (elemento) => {
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.textContent = 'Iniciar sesión con Google'
    boton.onclick = () => window.__gis.callback({ credential: 'mock:' + window.__gis.login_hint })
    elemento.appendChild(boton)
  }
} } }
`

const staff = await mock('/auth/login', { metodo: 'POST', cuerpo: { email: 'ana@wiwo.me', password: 'mock1234' } })

/** Deja el estado del mock como lo pide cada paso. */
async function preparar ({ global, exigir = false, configurado = true }) {
  // El cliente 2 lo usa el paso del conflicto: se vacía para que la corrida se pueda repetir.
  await mock('/clients/2/portal-google', {
    token: staff.access_token,
    metodo: 'PUT',
    cuerpo: { google_client_id: '', exigir_google: false, dominios: [] }
  })
  await mock('/settings', { token: staff.access_token, metodo: 'PATCH', cuerpo: { wiwo_portal_google_enabled: global } })
  await mock('/clients/1/portal-google', {
    token: staff.access_token,
    metodo: 'PUT',
    cuerpo: configurado
      ? { google_client_id: CLIENT_ID, exigir_google: exigir, dominios: [{ dominio: 'acme.com', incluir_subdominios: true }] }
      : { google_client_id: '', exigir_google: false, dominios: [] }
  })
}

const navegador = await chromium.launch()
const errores = []

/** Abre una pestaña nueva y sin sesión, con el doble de Google puesto. */
async function pestana () {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 1000 } })

  await contexto.route('https://accounts.google.com/gsi/client', (ruta) =>
    ruta.fulfill({ contentType: 'text/javascript', body: GIS_DOBLE }))

  const pagina = await contexto.newPage()

  pagina.on('console', (mensaje) => { if (mensaje.type() === 'error') errores.push(mensaje.text()) })
  pagina.on('pageerror', (error) => errores.push(String(error)))

  return pagina
}

try {
  // 1. Con el global apagado el portal es el de siempre: correo y contraseña juntos, sin "Continuar".
  await preparar({ global: false })

  let pagina = await pestana()

  await pagina.goto(`${URL_BASE}/`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('Correo').waitFor()
  await pagina.getByLabel('Contraseña').waitFor()
  assert.equal(await pagina.getByRole('button', { name: 'Continuar' }).count(), 0, 'Con Google apagado no hay paso de correo.')
  assert.equal(await pagina.getByRole('button', { name: 'Entrar', exact: true }).count(), 1)
  await pagina.screenshot({ path: `${SALIDA}/portal-google-1-apagado.png` })

  // 2. Encendido: primero el correo.
  await preparar({ global: true })
  pagina = await pestana()
  await pagina.goto(`${URL_BASE}/`, { waitUntil: 'networkidle' })
  assert.equal(await pagina.getByLabel('Contraseña').count(), 0, 'El primer paso no pide contraseña.')
  await pagina.screenshot({ path: `${SALIDA}/portal-google-2-correo.png` })

  // 3. Un dominio con Google (subdominio incluido): botón de Google y contraseña como alternativa.
  await pagina.getByLabel('Correo').fill('clienta@acme.com')
  await pagina.getByRole('button', { name: 'Continuar' }).click()
  await pagina.getByRole('button', { name: 'Iniciar sesión con Google' }).waitFor()
  await pagina.getByRole('button', { name: 'Entrar con contraseña' }).waitFor()
  await pagina.screenshot({ path: `${SALIDA}/portal-google-3-boton.png` })

  // 3b. La contraseña como alternativa lleva al formulario con el correo fijo, y se puede volver.
  await pagina.getByRole('button', { name: 'Entrar con contraseña' }).click()
  await pagina.getByLabel('Contraseña').waitFor()
  assert.equal(await pagina.getByLabel('Correo').inputValue(), 'clienta@acme.com')
  await pagina.getByRole('button', { name: 'Entrar con Google' }).click()
  await pagina.getByRole('button', { name: 'Iniciar sesión con Google' }).waitFor()

  // 4. Google abre la sesión y lleva al portal.
  await pagina.getByRole('button', { name: 'Iniciar sesión con Google' }).click()
  await pagina.waitForURL(/\/portal/, { timeout: 15000 })
  await pagina.screenshot({ path: `${SALIDA}/portal-google-4-adentro.png` })

  // 5. Un dominio sin Google va directo a la contraseña.
  pagina = await pestana()
  await pagina.goto(`${URL_BASE}/`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('Correo').fill('ivo@nordelta.com')
  await pagina.getByRole('button', { name: 'Continuar' }).click()
  await pagina.getByLabel('Contraseña').waitFor()
  assert.equal(await pagina.getByRole('button', { name: 'Iniciar sesión con Google' }).count(), 0)

  // 6. Con «exigir Google» no se ofrece la contraseña.
  await preparar({ global: true, exigir: true })
  pagina = await pestana()
  await pagina.goto(`${URL_BASE}/`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('Correo').fill('clienta@acme.com')
  await pagina.getByRole('button', { name: 'Continuar' }).click()
  await pagina.getByRole('button', { name: 'Iniciar sesión con Google' }).waitFor()
  assert.equal(await pagina.getByRole('button', { name: 'Entrar con contraseña' }).count(), 0, 'Exigido: sin alternativa.')
  assert.ok((await pagina.innerText('main')).includes('entra al portal con su cuenta de Google'))
  await pagina.screenshot({ path: `${SALIDA}/portal-google-6-exigido.png` })

  // 7. La ficha del cliente: se ve la sección y se guarda.
  await preparar({ global: false, configurado: false })
  pagina = await pestana()

  const sesion = await fetch(`${URL_BASE}/api/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
  })

  assert.ok(sesion.ok, `No se pudo entrar al panel: ${sesion.status}`)

  const cookie = (sesion.headers.getSetCookie?.() ?? []).map((linea) => linea.split(';')[0]).find((par) => par.startsWith('ops_sesion='))

  assert.ok(cookie !== undefined, 'El login no devolvio la cookie del panel.')
  await pagina.context().addCookies([{
    name: 'ops_sesion', value: cookie.slice('ops_sesion='.length), domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax'
  }])

  await pagina.goto(`${URL_BASE}/clientes/1?tab=proyectos`, { waitUntil: 'networkidle' })
  // El panel pregunta por la jornada al entrar; ese diálogo tapa la ficha.
  const jornada = pagina.getByRole('dialog', { name: /Abre tu jornada/ })

  if (await jornada.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    await pagina.keyboard.press('Escape')
    await jornada.waitFor({ state: 'hidden' })
  }

  const seccion = pagina.locator('section.rounded-tarjeta', { hasText: 'Portal: acceso con Google' })

  await seccion.getByLabel('Client ID de Google').waitFor()
  assert.ok((await seccion.innerText()).includes('apagado para todos los clientes'), 'Debe avisar que el global esta apagado.')
  await seccion.getByLabel('Client ID de Google').fill(CLIENT_ID)
  await seccion.getByLabel('Agregar dominio').fill('acme.com')
  await seccion.getByLabel('Incluir subdominios').first().check()
  await seccion.getByRole('button', { name: 'Agregar', exact: true }).click()
  await seccion.getByRole('button', { name: 'Guardar acceso con Google' }).click()
  await pagina.getByText('Acceso con Google guardado.').waitFor()
  await seccion.screenshot({ path: `${SALIDA}/portal-google-7-ficha.png` })

  const guardada = await mock('/clients/1/portal-google', { token: staff.access_token })

  assert.equal(guardada.google_client_id, CLIENT_ID)
  assert.deepEqual(guardada.dominios, [{ dominio: 'acme.com', incluir_subdominios: true }])

  // 8. Un conflicto del servidor se muestra tal cual en la ficha.
  await mock('/clients/2/portal-google', {
    token: staff.access_token,
    metodo: 'PUT',
    cuerpo: { google_client_id: 'otro-1.apps.googleusercontent.com', exigir_google: false, dominios: [{ dominio: 'nordelta.com', incluir_subdominios: false }] }
  })
  await seccion.getByLabel('Agregar dominio').fill('nordelta.com')
  await seccion.getByRole('button', { name: 'Agregar', exact: true }).click()
  await seccion.getByRole('button', { name: 'Guardar acceso con Google' }).click()
  await seccion.getByText(/ya lo usa otro cliente/).waitFor()
  await seccion.screenshot({ path: `${SALIDA}/portal-google-8-conflicto.png` })

  assert.deepEqual(errores.filter((e) => !/favicon|Failed to load resource|hydrated but some attributes/.test(e)), [], 'Hubo errores en la consola.')
  console.log('Acceso con Google al portal y su configuración: bien.')
} finally {
  await navegador.close()
}
