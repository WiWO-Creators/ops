import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { CONTACTOS } from '../mock/datos.js'

/**
 * Verificación mínima del tablero de control de gestión contra el mock del portal.
 *
 * Tres cosas y ninguna más: que la página carga con sus bloques, que el selector de mes cambia la
 * URL, y una captura. Una suite larga de navegador acá no compraría nada: la lógica que se puede
 * romper vive en `dominio/gestion.ts` y ya tiene sus pruebas puras.
 *
 * Se corre contra `pnpm build` + `pnpm start` y NO contra `pnpm dev`: en dev la página no hidrata y
 * el botón del formulario no responde.
 *
 * La sesión no se abre por el formulario de entrada, que no se automatiza: se pide la cookie a
 * `/api/sesion` y se inyecta con `secure: false`, porque el build de producción la marca `secure` y
 * el navegador no la mandaría por `http://localhost`.
 */
const destino = new URL(process.env.GESTION_TEST_URL ?? 'http://localhost:3120')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')

const contacto = CONTACTOS[0]
const salida = new URL('../output/', import.meta.url)
await mkdir(salida, { recursive: true })

const respuesta = await fetch(new URL('/api/sesion', destino), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: contacto.email, password: contacto.password, portal: true })
})
assert.ok(respuesta.ok, `Entrar al portal: HTTP ${respuesta.status}`)

const galletas = respuesta.headers.getSetCookie()
  .map((cruda) => cruda.split(';')[0].split('='))
  .filter(([nombre]) => nombre.startsWith('ops_'))
  .map(([nombre, valor]) => ({
    name: nombre,
    value: valor,
    domain: destino.hostname,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax'
  }))
assert.ok(galletas.length > 0, 'La respuesta de /api/sesion no trajo la cookie del portal.')

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1200 } })
  await contexto.addCookies(galletas)

  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(20000)

  const errores = []
  pagina.on('pageerror', (error) => errores.push(error.message))

  await pagina.goto(new URL('/portal/gestion?mes=2026-08', destino).href, { waitUntil: 'networkidle' })

  // Carga con sus bloques, y con las salvedades escritas y no dibujadas como ceros.
  await pagina.getByRole('heading', { name: 'Control de gestión', level: 1 }).waitFor()
  await pagina.getByRole('heading', { name: 'Trabas y decisiones pendientes' }).waitFor()
  await pagina.getByRole('heading', { name: 'Esperan una decisión de ustedes' }).waitFor()
  await pagina.getByText('Todavía no registramos el tiempo por etapa').first().waitFor()
  await pagina.getByText('Este mes no se resolvió ninguna aprobación', { exact: false }).waitFor()

  const cuerpo = await pagina.locator('body').innerText()
  // La etiqueta llega en mayúsculas porque el `uppercase` es de CSS y `innerText` lo aplica.
  assert.ok(cuerpo.includes('APROBADO A LA PRIMERA\n—'), 'Un porcentaje ausente tiene que salir como guion, no como 0%.')
  assert.ok(cuerpo.includes('muy pocas para una mediana'), 'Con n < 3 hay que decir que no se dibuja la mediana.')

  await pagina.screenshot({ path: new URL('gestion.png', salida).pathname, fullPage: true })

  // El selector de mes cambia la URL: el estado vive ahí y el enlace se comparte.
  await pagina.selectOption('select[name="mes"]', '2026-07')
  await pagina.getByRole('button', { name: 'Ver mes' }).click()
  await pagina.waitForURL(/[?&]mes=2026-07/)
  await pagina.getByRole('heading', { name: 'Control de gestión', level: 1 }).waitFor()
  assert.match(await pagina.locator('header p').first().innerText(), /Julio 2026/)

  assert.deepEqual(errores, [], 'La página no puede tirar errores de JavaScript.')
  console.log('Tablero de gestión: carga, el selector cambia la URL y la captura quedó en output/gestion.png')
} finally {
  await navegador.close()
}
