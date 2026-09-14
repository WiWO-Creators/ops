import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Comprueba la barra de filtros de Tareas contra Next y la API mock locales, sin escribir nada.
 *
 * Verifica que el desplegable «Agregar filtro» ofrece todos los campos de la Tarea y se puede buscar
 * en el, que los selectores de catalogo largo traen buscador, y que cada tipo viaja como el backend
 * lo espera: por nombre los de texto (Seguidor) y por id, admitiendo varios, los numericos (Asignado).
 *
 * Configuracion: FILTROS_TEST_URL (por defecto http://localhost:3110), FILTROS_TEST_EMAIL/PASSWORD
 * (por defecto los del mock), FILTROS_TEST_TIROS para guardar capturas y
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE. Termina con codigo distinto de cero ante cualquier fallo.
 */
const BASE = process.env.FILTROS_TEST_URL ?? 'http://localhost:3110'
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'Solo admite un servidor local.')
const TIROS = process.env.FILTROS_TEST_TIROS ?? null
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
const contexto = await navegador.newContext({ viewport: { width: 1500, height: 1000 } })
const pagina = await contexto.newPage()
pagina.on('pageerror', (fallo) => { throw fallo })

const entrada = await contexto.request.post(`${BASE}/api/sesion`, {
  data: {
    email: process.env.FILTROS_TEST_EMAIL ?? 'ana@wiwo.me',
    password: process.env.FILTROS_TEST_PASSWORD ?? 'mock1234'
  }
})
assert.equal(entrada.status(), 200, `login: ${entrada.status()} ${await entrada.text()}`)

/** Guarda una captura solo si se pidio un destino: la prueba corre igual sin el. */
async function retratar (nombre) {
  if (TIROS !== null) await pagina.screenshot({ path: `${TIROS}/${nombre}.png` })
}

/** Abre un desplegable por el texto de su disparador, con el teclado (Radix abre en pointerdown). */
async function abrir (texto) {
  await pagina.waitForFunction(
    (t) => [...document.querySelectorAll('button')].some((n) => (n.textContent ?? '').trim().includes(t)),
    texto,
    { timeout: 8000 }
  ).catch(() => { throw new Error(`no se encontró el disparador "${texto}"`) })
  await pagina.evaluate((t) => {
    [...document.querySelectorAll('button')].find((n) => (n.textContent ?? '').trim().includes(t))?.focus()
  }, texto)
  await pagina.keyboard.press('Enter')
  await pagina.waitForTimeout(500)
}

/** Elige la primera fila del menú abierto, bajando con las flechas desde el buscador. */
async function elegirPrimera () {
  await pagina.keyboard.press('ArrowDown')
  await pagina.waitForTimeout(150)
  await pagina.keyboard.press('Enter')
  await pagina.waitForTimeout(900)
}

const filas = (rol) => pagina.locator(`[role="menu"] [role="${rol}"]`)

await pagina.goto(`${BASE}/procesos`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(800)

// 1. El desplegable de agregar filtro trae buscador y acota la lista.
await abrir('Agregar filtro')
await pagina.locator('[role="menu"] input[type="text"]').waitFor({ state: 'visible', timeout: 5000 })
const total = await filas('menuitemradio').count()
await pagina.keyboard.type('segui')
await pagina.waitForTimeout(300)
const filtrados = await filas('menuitemradio').allInnerTexts()
await retratar('1-agregar-filtro')
assert.ok(total > 20, `pocos filtros ofrecidos: ${total}`)
assert.deepEqual(filtrados, ['Seguidor'], `filtrado inesperado: ${JSON.stringify(filtrados)}`)
console.log(`ok: "Agregar filtro" ofrece ${total} campos y el buscador los acota`)

// 2. Seguidor trae el equipo y viaja por nombre.
await elegirPrimera()
await abrir('Seguidor: todos')
const personas = await filas('menuitemradio').allInnerTexts()
await retratar('2-seguidor')
assert.ok(personas.length > 3, `el catálogo de personas llegó vacío: ${JSON.stringify(personas)}`)
await pagina.keyboard.type('Carla')
await pagina.waitForTimeout(300)
assert.deepEqual(await filas('menuitemradio').allInnerTexts(), ['Carla Méndez'], 'la búsqueda dentro del selector no acotó')
await elegirPrimera()
const legible = (u) => decodeURIComponent(u).replaceAll('+', ' ')
assert.ok(legible(pagina.url()).includes('filter[followers]=Carla Méndez'), `URL: ${pagina.url()}`)
console.log(`ok: Seguidor ofrece ${personas.length} opciones, se busca y viaja con el nombre`)

// 3. Asignado: varias personas, por id.
await abrir('Agregar filtro')
await pagina.keyboard.type('asignado')
await pagina.waitForTimeout(300)
await elegirPrimera()
await abrir('Asignado: todos')
const marcables = await filas('menuitemcheckbox').allInnerTexts()
assert.ok(marcables.length > 3, `Asignado sin catálogo: ${JSON.stringify(marcables)}`)
await pagina.keyboard.press('ArrowDown')
await pagina.waitForTimeout(200)
await pagina.keyboard.press('Enter')
await pagina.waitForTimeout(1200)
assert.match(legible(pagina.url()), /filter\[assignee\]=\d+/, `una persona: ${pagina.url()}`)
await pagina.keyboard.press('ArrowDown')
await pagina.waitForTimeout(200)
await pagina.keyboard.press('Enter')
await pagina.waitForTimeout(1200)
await pagina.keyboard.press('Escape')
await pagina.waitForTimeout(600)
await retratar('3-asignado')
const url = legible(pagina.url())
assert.match(url, /filter\[assignee\]=\d+,\d+/, `dos personas: ${url}`)
assert.ok(url.includes('filter[followers]=Carla Méndez'), `el filtro anterior se perdió: ${url}`)
console.log(`ok: Asignado ofrece ${marcables.length} personas, admite varias y viaja por id`)

// 4. La tabla siguió respondiendo.
const cuerpo = await pagina.locator('body').innerText()
assert.ok(!cuerpo.includes('Filtro desconocido'), 'la API rechazó un filtro')
assert.ok(!cuerpo.toLowerCase().includes("couldn't load"), 'la pantalla se cayó')
await retratar('4-final')
console.log('ok: la tabla respondió con los dos filtros puestos')

await navegador.close()
