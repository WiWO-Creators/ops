import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica que las vistas de tablero del portal no le pidan a la API nada que un contacto no tenga.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita el mock y un Next servido:
 *
 * ```bash
 * PORT=3481 node mock/servidor.js &
 * API_BASE=http://localhost:3481/api/v1 PORT=3491 pnpm start &
 * URL_BASE=http://localhost:3491 node pruebas/kanban-del-contacto.browser.mjs
 * ```
 *
 * ## Qué cubre y por qué
 *
 * El kanban de Hitos del cliente entró con tres fallos que ni el typecheck ni las ~2000 pruebas de
 * nodo vieron, y los tres tumbaban la pestaña entera con «Esto no se pudo cargar»:
 *
 *  1. Un `board` fijo hacía que el kanban del contacto pidiera `filter-presets`, que es ruta del
 *     equipo. El 401 no degradaba a un tablero sin presets: se caía todo.
 *  2. La tarjeta leía `tarea.assignees.length` y la forma del contacto no publica asignados.
 *  3. `total_logged_seconds` tampoco viaja sin `view_task_total_logged_time`, y se pintaba `00:00`,
 *     que le dice al cliente que nadie trabajó.
 *
 * Los tres son el MISMO patrón, que es el que se repitió cuatro veces en un día: la forma del
 * contacto publica menos, y el código del equipo asume que está todo. Por eso la comprobación
 * central de acá no es sobre esta pantalla sino sobre cualquiera: **desde el portal, toda petición
 * al BFF tiene que empezar con `portal/`.** Esa sola frase cubre los tres y los que vengan.
 *
 * ## Límites conocidos
 *
 * - **No cubre la ficha de una tarjeta ni el arrastre**: el portal es de solo lectura y el tablero
 *   del contacto no mueve nada, así que no hay arrastre que probar; la ficha ya la cubre
 *   `ficha-del-cliente.browser.mjs`.
 * - **El `00:00` se comprueba de forma indirecta**, por la ausencia de la clave en la respuesta del
 *   mock y por que la pantalla no reviente. Que el número pintado sea el correcto cuando el Proyecto
 *   SÍ comparte las horas necesita un fixture con cronómetros de verdad, y eso no está acá.
 * - **Esto corre contra el mock, no contra la API.** Si el mock publicara una clave que la API
 *   poda, la pantalla pasaría acá y se caería en producción. Lo que evita esa deriva es que el mock
 *   pode con los mismos flags que `FormasDelPortal`, no esta prueba.
 */
const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3491'
const PROYECTO = process.env.PROYECTO ?? '1'
const SALIDA = process.env.SALIDA ?? '/tmp'

/** Las vistas de tablero que el contacto puede abrir, con la pestaña de la que cuelgan. */
const TABLEROS = [
  { tab: 'tasks', etiqueta: 'Tareas' },
  { tab: 'milestones', etiqueta: 'Hitos' }
]

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

/** Lo que la pantalla le pidió al BFF, sea cual sea el resultado. */
let pedidas = []
let fallidas = []
let errores = []

pagina.on('request', (peticion) => {
  const ruta = new URL(peticion.url()).pathname

  if (ruta.startsWith('/api/bff/')) pedidas.push(ruta.slice('/api/bff/'.length))
})
pagina.on('response', (r) => { if (r.status() >= 400) fallidas.push(`${r.status()} ${new URL(r.url()).pathname}`) })
pagina.on('console', (mensaje) => { if (mensaje.type() === 'error') errores.push(mensaje.text()) })
pagina.on('pageerror', (error) => errores.push(String(error)))

const resumen = []

for (const { tab, etiqueta } of TABLEROS) {
  pedidas = []
  fallidas = []
  errores = []

  await pagina.goto(`${URL_BASE}/portal/proyectos/${PROYECTO}?tab=${tab}&vista=tablero`, { waitUntil: 'networkidle' })
  // Los paneles del portal son de cliente: piden lo suyo al montarse, asi que hay que esperarlos.
  await pagina.waitForTimeout(2500)

  const cuerpo = await pagina.$eval('body', (b) => b.innerText)

  // 1. La comprobacion que vale por las tres: nada fuera del contrato del contacto.
  const ajenas = pedidas.filter((ruta) => !ruta.startsWith('portal/'))

  assert.deepEqual(
    ajenas,
    [],
    `El tablero de ${etiqueta} pidio rutas del equipo: ${JSON.stringify(ajenas)}.\n`
    + 'Un contacto no las tiene, la API contesta 401 y la pestaña entera se cae. Si el componente\n'
    + 'necesita ese recurso, tiene que colgar de la fuente y llegar en null para el portal.'
  )

  // 2. La pantalla se dibujo de verdad. Sin esto, una pagina en blanco pasaria las demas.
  assert.ok(
    !cuerpo.includes('Esto no se pudo cargar'),
    `El tablero de ${etiqueta} se cayo entero.`
  )
  assert.ok(
    cuerpo.includes(etiqueta),
    `El tablero de ${etiqueta} no llego a dibujarse: ${JSON.stringify(cuerpo.slice(0, 160))}`
  )

  // 3. Ningun 401/403: si el contacto pidio algo suyo y se lo negaron, es otro agujero.
  assert.deepEqual(
    fallidas,
    [],
    `El tablero de ${etiqueta} pidio algo que la API le nego: ${JSON.stringify(fallidas)}`
  )

  // 4. Nada reventado. `undefined.length` sobre una clave que la forma no publica sale por acá.
  assert.deepEqual(
    errores,
    [],
    `El tablero de ${etiqueta} dejo errores en la consola: ${JSON.stringify(errores.slice(0, 3))}`
  )

  await pagina.screenshot({ path: `${SALIDA}/kanban-contacto-${tab}.png`, fullPage: false })

  resumen.push({ tablero: etiqueta, peticiones: pedidas.length, ajenas: ajenas.length })
}

console.log('TABLEROS:', JSON.stringify(resumen, null, 1))
console.log('Todas las peticiones del portal empiezan con portal/.')

await navegador.close()
