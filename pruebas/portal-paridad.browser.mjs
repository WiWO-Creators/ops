/**
 * Verificacion en pantalla de la paridad del portal: la pestaña Tareas compartida (tabla, tablero y
 * calendario), la pestaña Calendario y la ficha de una Tarea.
 *
 * El clic va por `evaluate`: en ops-v2 `locator.click()` se cuelga. La sesion se consigue pidiendo
 * la cookie a `/api/sesion` e inyectandola con `secure: false`.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

/*
 * Requiere el mock corriendo y la app levantada con `pnpm build` + `pnpm start` —nunca `pnpm dev`:
 * ahi la pagina no hidrata y los clics no responden—. `PARIDAD_URL` cambia el origen y
 * `PARIDAD_CAPTURAS` la carpeta de las capturas.
 */
const destino = new URL(process.env.PARIDAD_URL ?? 'http://localhost:3010')
assert.ok(['localhost', '127.0.0.1'].includes(destino.hostname), 'Solo permite pruebas locales.')

const BASE = destino.origin
const SALIDA = process.env.PARIDAD_CAPTURAS ?? 'capturas-portal-paridad'

await mkdir(SALIDA, { recursive: true })

const respuesta = await fetch(`${BASE}/api/sesion`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ portal: true, email: 'clienta@acme.com', password: 'portal1234' })
})
assert.equal(respuesta.status, 200)

const cookie = respuesta.headers.getSetCookie()
  .map((c) => c.split(';')[0])
  .map((c) => {
    const [nombre, ...valor] = c.split('=')
    return { name: nombre, value: valor.join('='), domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }
  })

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
await contexto.addCookies(cookie)
const pagina = await contexto.newPage()

const errores = []
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`) })

/** Va a una ruta y espera que la red se calme. */
async function ir (ruta) {
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' })
}

/** Clic por `evaluate`: `locator.click()` se cuelga en este proyecto. */
async function clicar (selector, texto) {
  const hecho = await pagina.evaluate(([sel, txt]) => {
    const nodos = [...document.querySelectorAll(sel)]
    const nodo = txt === null ? nodos[0] : nodos.find((n) => n.textContent.trim() === txt)
    if (nodo === undefined) return false
    nodo.click()
    return true
  }, [selector, texto ?? null])

  assert.equal(hecho, true, `no encontre ${selector} ${texto ?? ''}`)
  await pagina.waitForLoadState('networkidle')
}

/** Los rotulos de las pestañas del proyecto. */
async function pestanias () {
  return await pagina.$$eval('[role="tab"]', (ns) => ns.map((n) => n.textContent.trim()))
}

const visto = {}

// ---- Proyecto 1: comparte Tareas y Calendario -------------------------------------------------
await ir('/portal/proyectos/1')
visto.pestanias = await pestanias()
assert.deepEqual(visto.pestanias, ['Descripción', 'Tareas', 'Hitos', 'Archivos', 'Calendario', 'Actividad'])

// ---- Pestaña Tareas: la tabla del colaborador, sin escritura ----------------------------------
await ir('/portal/proyectos/1?tab=tasks')
await pagina.waitForSelector('table')
visto.encabezados = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
visto.filas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.presentaciones = await pagina.$$eval('[aria-label="Presentación"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.botones = await pagina.$$eval('button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.casillasDeSeleccion = await pagina.$$eval('table input[type="checkbox"]', (ns) => ns.length)
visto.primeraFila = await pagina.$$eval('table tbody tr:first-child td', (ns) => ns.map((n) => n.textContent.trim()))
visto.menusDeAccion = await pagina.$$eval('table [aria-label="Acciones"]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-tabla.png`, fullPage: true })

assert.equal(visto.filas > 0, true, 'la tabla no trajo filas')
// Sin la lectura de calendario: acota por rango de fechas y el contrato del contacto no lo acepta.
// El cliente tiene su calendario en la pestaña propia, que baja el mes entero de una vez.
assert.deepEqual(visto.presentaciones, ['Tabla', 'Tablero'])
assert.equal(visto.casillasDeSeleccion, 0, 'hay casillas de seleccion masiva con capacidades vacias')
// Dos acciones del equipo no piden capacidad, asi que `[]` no alcanzaba para podarlas: el cliente
// veia un menu por fila que solo podia devolver 404.
assert.equal(visto.menusDeAccion, 0, 'hay menu de acciones por fila en el portal')
// Las insignias resuelven contra el catalogo: sin esto la columna Prioridad decia "#4".
assert.equal(visto.primeraFila.some((celda) => /^#\d+$/.test(celda)), false, `celda sin resolver: ${visto.primeraFila.join(' | ')}`)
for (const prohibido of ['Nueva tarea', 'Crear', 'Nuevo', 'Guardar', 'Eliminar', 'Editar']) {
  assert.equal(visto.botones.includes(prohibido), false, `boton de escritura visible: ${prohibido}`)
}

// ---- Tablero, llegando por el control de presentacion y no por la URL -------------------------
// Un clic de verdad: es lo que prueba que la pagina hidrato y que el control responde.
await clicar('[aria-label="Presentación"] button', 'Tablero')
// El estado de la vista vive en la URL: `router.replace` la escribe despues del clic.
await pagina.waitForFunction(() => new URL(location.href).searchParams.get('vista') === 'tablero')
await pagina.waitForLoadState('networkidle')
await pagina.waitForSelector('[aria-label="Presentación"]')
visto.columnasDelTablero = await pagina.$$eval('h3, [data-columna]', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.textoTablero = (await pagina.textContent('body')).includes('No se pudo cargar el tablero')
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-tablero.png`, fullPage: true })
assert.equal(visto.textoTablero, false, 'el tablero del portal fallo')

// ---- `?vista=calendario` en el portal cae a la tabla y no pide un rango que da 422 -------------
await ir('/portal/proyectos/1?tab=tasks&vista=calendario')
await pagina.waitForSelector('table')
visto.filasConVistaCalendario = await pagina.$$eval('table tbody tr', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-vista-invalida.png`, fullPage: true })
assert.equal(visto.filasConVistaCalendario > 0, true, 'la vista invalida no cayo a la tabla')

// ---- Pestaña Calendario (la nueva) -------------------------------------------------------------
await ir('/portal/proyectos/1?tab=calendar')
await pagina.waitForSelector('[aria-label="Vista del calendario"]')
visto.vistasDelCalendario = await pagina.$$eval('[aria-label="Vista del calendario"] button', (ns) => ns.map((n) => n.textContent.trim()))
visto.tituloDelPeriodo = await pagina.textContent('[aria-label="Vista del calendario"] ~ *, p.min-w-44').catch(() => null)
visto.entregasVisibles = await pagina.$$eval('a[href*="tarea="]', (ns) => ns.length)
await pagina.screenshot({ path: `${SALIDA}/portal-calendario.png`, fullPage: true })
assert.deepEqual(visto.vistasDelCalendario, ['Mes', 'Semana', 'Día', 'Lista'])

// ---- Ficha de una Tarea: solo lectura ----------------------------------------------------------
await ir('/portal/proyectos/1?tab=tasks&tarea=509')
await pagina.waitForSelector('[role="dialog"]')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la tarea'))
const dialogo = await pagina.textContent('[role="dialog"]')
visto.secciones = await pagina.$$eval('[role="dialog"] h4', (ns) => ns.map((n) => n.textContent.trim()))
visto.botonesDeLaFicha = await pagina.$$eval('[role="dialog"] button', (ns) => ns.map((n) => n.textContent.trim()).filter(Boolean))
visto.datosDeLaFicha = await pagina.$$eval('[role="dialog"] dt', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/portal-ficha-tarea.png`, fullPage: true })

assert.equal(dialogo.includes('No encontramos esta'), false, 'la ficha no cargo')
assert.equal(visto.secciones.includes('Comentarios'), true)
assert.equal(visto.secciones.includes('Tiempo registrado'), true)
// El titulo lleva el conteo pegado ("Lista de control 3/4"), igual que en el panel que si escribe.
assert.equal(visto.secciones.some((s) => s.startsWith('Lista de control')), true)
assert.equal(visto.secciones.includes('Enlaces'), false, 'dibujo Enlaces sin campos personalizados')
for (const prohibido of ['Editar', 'Eliminar', 'Duplicar…', 'Compartir', 'Marcar completada']) {
  assert.equal(visto.botonesDeLaFicha.includes(prohibido), false, `boton de escritura en la ficha: ${prohibido}`)
}
for (const prohibido of ['ASIGNADOS', 'ETIQUETAS', 'PROYECTO']) {
  assert.equal(visto.datosDeLaFicha.includes(prohibido), false, `dato interno en la ficha: ${prohibido}`)
}

// ---- Tarea sin comentarios ---------------------------------------------------------------------
await ir('/portal/proyectos/1?tab=tasks&tarea=500')
await pagina.waitForSelector('[role="dialog"]')
await pagina.waitForFunction(() => !document.body.textContent.includes('Cargando la tarea'))
visto.sinComentarios = (await pagina.textContent('[role="dialog"]')).includes('Todavía no hay comentarios')
await pagina.screenshot({ path: `${SALIDA}/portal-ficha-sin-comentarios.png`, fullPage: true })
assert.equal(visto.sinComentarios, true)

// ---- Listado vacio -----------------------------------------------------------------------------
await ir('/portal/proyectos/1?tab=tasks&filter%5Bstatus%5D=5')
await pagina.waitForLoadState('networkidle')
visto.listadoVacio = await pagina.textContent('body')
await pagina.screenshot({ path: `${SALIDA}/portal-tareas-vacio.png`, fullPage: true })
assert.equal(/Sin tareas|No hay|Todav/i.test(visto.listadoVacio), true, 'el listado vacio no dijo nada')

// ---- Proyecto 8: pestaña de Tareas apagada -----------------------------------------------------
await ir('/portal/proyectos/8')
visto.pestaniasDelOcho = await pestanias()
await pagina.screenshot({ path: `${SALIDA}/portal-proyecto-sin-tareas.png`, fullPage: true })
assert.equal(visto.pestaniasDelOcho.includes('Tareas'), false)
assert.equal(visto.pestaniasDelOcho.includes('Calendario'), false)

// ---- El panel del colaborador sigue igual ------------------------------------------------------
const respuestaStaff = await fetch(`${BASE}/api/sesion`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'ana@wiwo.me', password: 'mock1234' })
})
assert.equal(respuestaStaff.status, 200)
await contexto.addCookies(respuestaStaff.headers.getSetCookie().map((c) => c.split(';')[0]).map((c) => {
  const [nombre, ...valor] = c.split('=')
  return { name: nombre, value: valor.join('='), domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }
}))

await ir('/espacios/1?tab=tareas')
await pagina.waitForSelector('table')
visto.panelFilas = await pagina.$$eval('table tbody tr', (ns) => ns.length)
visto.panelCasillas = await pagina.$$eval('table input[type="checkbox"]', (ns) => ns.length)
visto.panelEncabezados = await pagina.$$eval('table thead th', (ns) => ns.map((n) => n.textContent.trim()))
await pagina.screenshot({ path: `${SALIDA}/panel-tareas.png`, fullPage: true })
assert.equal(visto.panelFilas > 0, true)
assert.equal(visto.panelCasillas > 0, true, 'el panel perdio la seleccion masiva')

visto.presentacionesDelPanel = await pagina.$$eval('[aria-label="Presentación"] button', (ns) => ns.map((n) => n.textContent.trim()))
assert.deepEqual(visto.presentacionesDelPanel, ['Tabla', 'Tablero', 'Calendario'], 'el panel perdio una lectura')

await ir('/espacios/1?tab=tareas&vista=calendario')
await pagina.waitForSelector('[aria-label="Vista"], [aria-label="Presentación"]')
await pagina.screenshot({ path: `${SALIDA}/panel-tareas-calendario.png`, fullPage: true })

await ir('/espacios/1?tab=calendario')
await pagina.waitForSelector('[aria-label="Vista del calendario"]')
await pagina.screenshot({ path: `${SALIDA}/panel-calendario.png`, fullPage: true })

await navegador.close()

console.log(JSON.stringify(visto, null, 2).slice(0, 4000))
console.log('\nerrores de consola:', errores.length === 0 ? 'ninguno' : errores.slice(0, 10))
