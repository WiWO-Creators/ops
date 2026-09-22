import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica que la ficha de un Proyecto en el portal del cliente este armada como la del colaborador.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita el mock y un Next servido:
 *
 * ```bash
 * node mock/servidor.js &                      # API falsa en el 3001
 * pnpm build && PORT=3101 pnpm start &         # contra el build: en `next dev` la pagina no hidrata
 * URL_BASE=http://localhost:3101 node pruebas/ficha-del-cliente.browser.mjs
 * ```
 *
 * Lo que comprueba es lo que no se ve en una prueba de nodo: que las tarjetas de contadores por
 * estado se pinten de verdad —con su numero y SIN el renglon "Mis tareas", que no le corresponde a
 * un contacto— y que la tabla traiga las columnas que la API del portal si manda. Las dos cosas
 * fallan en silencio: el componente se monta igual y la pantalla se ve entera.
 *
 * La cookie se inyecta con `secure: false` porque el servidor local habla http y la API la emite
 * `Secure`; sin eso el navegador la descarta y la pagina redirige a la entrada.
 */
const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3100'
const PROYECTO = process.env.PROYECTO ?? '1'
const SALIDA = process.env.SALIDA ?? '/tmp/claude-1000/-home-wiwo-ops-wiwo/5a321109-cf62-469d-8e33-ec8b32cf50c8/scratchpad'

const respuesta = await fetch(`${URL_BASE}/api/sesion`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ portal: true, email: 'clienta@acme.com', password: 'portal1234' })
})

if (!respuesta.ok) throw new Error(`No se pudo entrar al portal: ${respuesta.status}`)

const cookie = (respuesta.headers.getSetCookie?.() ?? [])
  .map((linea) => linea.split(';')[0])
  .find((par) => par.startsWith('ops_portal='))

if (cookie === undefined) throw new Error('El login no devolvio la cookie del portal.')

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1600, height: 1100 } })

await contexto.addCookies([{
  name: 'ops_portal',
  value: cookie.slice('ops_portal='.length),
  domain: 'localhost',
  path: '/',
  httpOnly: true,
  secure: false,
  sameSite: 'Lax'
}])

const pagina = await contexto.newPage()
const errores = []

const fallidas = []

pagina.on('response', (r) => { if (r.status() >= 400) fallidas.push(`${r.status()} ${r.url()}`) })
pagina.on('console', (mensaje) => { if (mensaje.type() === 'error') errores.push(mensaje.text()) })
pagina.on('pageerror', (error) => errores.push(String(error)))

await pagina.goto(`${URL_BASE}/portal/proyectos/${PROYECTO}?tab=tasks`, { waitUntil: 'networkidle' })
// Las tablas del portal son de cliente: piden lo suyo al montarse, asi que hay que esperarlas.
await pagina.waitForTimeout(2500)

await pagina.screenshot({ path: `${SALIDA}/ficha-cliente.png`, fullPage: false })

const contadores = await pagina.$$eval(
  'button[aria-pressed]',
  (nodos) => nodos.map((n) => n.innerText.replace(/\n+/g, ' | ')).filter((t) => t.length > 0)
)
const encabezados = await pagina.$$eval('table th', (nodos) => nodos.map((n) => n.innerText.trim()))
const pestanias = await pagina.$$eval('[role="tab"], nav a', (nodos) => nodos.map((n) => n.innerText.trim()))

assert.ok(contadores.length >= 6, `Faltan las tarjetas de estado: ${JSON.stringify(contadores)}`)
assert.ok(
  !contadores.some((texto) => texto.includes('Mis tareas')),
  'Las tarjetas del cliente no pueden decir "Mis tareas": un contacto no tiene Tareas asignadas.'
)
for (const columna of ['Tipo', 'Hito', 'Aprobación']) {
  assert.ok(encabezados.includes(columna), `Falta la columna ${columna}: ${JSON.stringify(encabezados)}`)
}
assert.deepEqual(fallidas, [], 'La pantalla pidio algo que la API no tiene.')
assert.deepEqual(errores, [], 'La pantalla dejo errores en la consola.')

console.log('URL:', pagina.url())
console.log('CONTADORES:', JSON.stringify(contadores, null, 1))
console.log('COLUMNAS:', JSON.stringify(encabezados))
console.log('PESTANIAS:', JSON.stringify([...new Set(pestanias)].filter(Boolean)))
console.log('PETICIONES FALLIDAS:', fallidas)
console.log('ERRORES DE CONSOLA:', errores.length === 0 ? 'ninguno' : errores.slice(0, 5))

await navegador.close()
