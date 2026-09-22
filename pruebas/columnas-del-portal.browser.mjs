import assert from 'node:assert/strict'
import { chromium } from 'playwright'

/**
 * Verifica los ocho interruptores de columna de la tabla de Tareas del portal, de punta a punta.
 *
 * Se corre a mano, como el resto de los `.browser.mjs`, porque necesita el mock y un Next servido:
 *
 * ```bash
 * PORT=3421 node mock/servidor.js &                                  # API falsa
 * API_BASE=http://localhost:3421/api/v1 PORT=3431 pnpm start &       # contra el build
 * URL_BASE=http://localhost:3431 node pruebas/columnas-del-portal.browser.mjs
 * ```
 *
 * Lo que comprueba es la unica parte que no se puede probar en Node: que encender un interruptor en
 * el panel del equipo cambie de verdad lo que el cliente ve en su tabla. Son tres momentos —apagado,
 * encendido, apagado de nuevo— y el tercero importa tanto como el segundo: un interruptor que
 * enciende y no apaga es una filtracion permanente disfrazada de opcion.
 *
 * Usa DOS sesiones sobre el mismo mock: la del staff para escribir `PUT /projects/{id}/portal-settings`
 * y la del contacto para mirar el portal. Es exactamente el reparto real, y es lo que hace que la
 * prueba falle si el flag viaja pero la forma no lo honra.
 */
const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3431'
const PROYECTO = process.env.PROYECTO ?? '1'
const SALIDA = process.env.SALIDA ?? '/tmp'

/** Los dos interruptores que enciende la prueba, con el encabezado que cada uno agrega. */
const ENCENDER = {
  wiwo_portal_campo_responsables: 'Asignados',
  wiwo_portal_campo_etiquetas: 'Etiquetas'
}

/** Abre sesion y devuelve la cookie lista para inyectar. */
async function entrar (cuerpo, nombre) {
  const respuesta = await fetch(`${URL_BASE}/api/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })

  if (!respuesta.ok) throw new Error(`No se pudo entrar (${nombre}): ${respuesta.status}`)

  const cookie = (respuesta.headers.getSetCookie?.() ?? [])
    .map((linea) => linea.split(';')[0])
    .find((par) => par.startsWith(`${nombre}=`))

  if (cookie === undefined) throw new Error(`El login no devolvio la cookie ${nombre}.`)

  return cookie
}

const cookieContacto = await entrar({ portal: true, email: 'clienta@acme.com', password: 'portal1234' }, 'ops_portal')
const cookieStaff = await entrar({ email: 'ana@wiwo.me', password: 'mock1234' }, 'ops_sesion')

/**
 * Lee los interruptores del portal y los reescribe con los cambios pedidos.
 *
 * Es un PUT de reemplazo total: hay que mandar las claves que ya estaban, o el backend contesta 422
 * por las que falten. Leer-modificar-escribir es lo mismo que hace el panel.
 */
async function moverInterruptores (cambios) {
  const ruta = `${URL_BASE}/api/bff/projects/${PROYECTO}/portal-settings`
  const cabeceras = { cookie: cookieStaff, accept: 'application/json' }

  const leido = await fetch(ruta, { headers: cabeceras })
  if (!leido.ok) throw new Error(`No se pudieron leer los interruptores: ${leido.status}`)

  const actuales = (await leido.json()).data
  const escrito = await fetch(ruta, {
    method: 'PUT',
    headers: { ...cabeceras, 'content-type': 'application/json' },
    body: JSON.stringify({ ...actuales, ...cambios })
  })

  if (!escrito.ok) {
    throw new Error(`El PUT de interruptores fallo: ${escrito.status} ${await escrito.text()}`)
  }

  return (await escrito.json()).data
}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1600, height: 1100 } })

await contexto.addCookies([{
  name: 'ops_portal',
  value: cookieContacto.slice('ops_portal='.length),
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

/** Los encabezados de la tabla de Tareas del cliente, con la pagina recien cargada. */
async function encabezados () {
  await pagina.goto(`${URL_BASE}/portal/proyectos/${PROYECTO}?tab=tasks`, { waitUntil: 'networkidle' })
  // La tabla del portal es de cliente: pide lo suyo al montarse, asi que hay que esperarla.
  await pagina.waitForTimeout(2500)

  return await pagina.$$eval('table th', (nodos) => nodos.map((n) => n.innerText.trim()))
}

// --- 1. Apagado: la tabla es la de siempre -----------------------------------------------------

await moverInterruptores(Object.fromEntries(Object.keys(ENCENDER).map((flag) => [flag, false])))

const apagado = await encabezados()

for (const [flag, encabezado] of Object.entries(ENCENDER)) {
  assert.ok(
    !apagado.includes(encabezado),
    `Con ${flag} apagado la columna «${encabezado}» no puede estar: ${JSON.stringify(apagado)}`
  )
}

// --- 2. Encendido: aparecen, y solo las encendidas ----------------------------------------------

const guardado = await moverInterruptores(Object.fromEntries(Object.keys(ENCENDER).map((flag) => [flag, true])))

for (const flag of Object.keys(ENCENDER)) {
  assert.equal(guardado[flag], true, `El backend no guardo ${flag}.`)
}

const encendido = await encabezados()

for (const [flag, encabezado] of Object.entries(ENCENDER)) {
  assert.ok(
    encendido.includes(encabezado),
    `Con ${flag} encendido falta la columna «${encabezado}»: ${JSON.stringify(encendido)}`
  )
}

// Las que NO se encendieron siguen sin aparecer: el interruptor es por campo, no un todo o nada.
for (const ajena of ['ETA', 'Desviación', 'SLA', 'Justificación del equipo', 'Seguidores', 'Iteraciones']) {
  assert.ok(
    !encendido.includes(ajena),
    `«${ajena}» no se encendio y aun asi aparecio: ${JSON.stringify(encendido)}`
  )
}

await pagina.screenshot({ path: `${SALIDA}/columnas-portal-encendidas.png`, fullPage: false })

// --- 3. Apagado de nuevo: se van. Un interruptor que no apaga no es un interruptor ---------------

await moverInterruptores(Object.fromEntries(Object.keys(ENCENDER).map((flag) => [flag, false])))

const reapagado = await encabezados()

for (const [flag, encabezado] of Object.entries(ENCENDER)) {
  assert.ok(
    !reapagado.includes(encabezado),
    `Se apago ${flag} y «${encabezado}» sigue en la tabla: ${JSON.stringify(reapagado)}`
  )
}

assert.deepEqual(apagado, reapagado, 'Apagar y volver a apagar tiene que dejar la misma tabla.')
assert.deepEqual(fallidas, [], 'La pantalla pidio algo que la API no tiene.')
assert.deepEqual(errores, [], 'La pantalla dejo errores en la consola.')

console.log('APAGADO:  ', JSON.stringify(apagado))
console.log('ENCENDIDO:', JSON.stringify(encendido))
console.log('REAPAGADO:', JSON.stringify(reapagado))
console.log('PETICIONES FALLIDAS:', fallidas)
console.log('ERRORES DE CONSOLA:', errores.length === 0 ? 'ninguno' : errores.slice(0, 5))

await navegador.close()
