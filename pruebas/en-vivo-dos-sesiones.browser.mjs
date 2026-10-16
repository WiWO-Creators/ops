import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { firmar } from '../src/lib/en-vivo/firma.ts'

/**
 * Dos sesiones del panel con «Ops en vivo» encendido: un aviso del board llega a las dos sin esperar
 * el sondeo, y solo a quien corresponde.
 *
 * Requiere, todo local:
 *   - `MOCK_EN_VIVO=1 pnpm mock` (el mock con el maestro encendido),
 *   - `pnpm dev` con `NEXT_PUBLIC_EN_VIVO_URL=ws://localhost:4010/en-vivo` y `EN_VIVO_BOLETO_SECRETO`,
 *   - `pnpm en-vivo` con `EN_VIVO_SECRETO`, `EN_VIVO_BOLETO_SECRETO`, `API_BASE` y
 *     `EN_VIVO_ORIGENES=<origen del panel>`.
 * `EN_VIVO_SECRETO` también debe estar en el entorno de esta prueba: con él firma los eventos como
 * lo haría el board. `EN_VIVO_TEST_URL` cambia el origen del panel (por defecto http://localhost:3010)
 * y `EN_VIVO_TEST_SERVICIO` la base HTTP del servicio (por defecto http://127.0.0.1:4010/en-vivo).
 *
 * El board no está en juego: el mock no emite eventos, así que la prueba los manda ella misma al
 * servicio. Los clics y las esperas van por eventos de red, no por temporizadores del sondeo (30 s).
 */
const destino = new URL(process.env.EN_VIVO_TEST_URL ?? 'http://localhost:3010')
const servicio = process.env.EN_VIVO_TEST_SERVICIO ?? 'http://127.0.0.1:4010/en-vivo'
const secreto = process.env.EN_VIVO_SECRETO ?? ''

assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo admite un servidor local.')
assert.ok(secreto.length >= 32, 'Falta EN_VIVO_SECRETO (el mismo del servicio) para firmar los eventos.')

/** Cuánto se espera un aviso: la ventana de agrupación del puente (1 s) con holgura, muy por debajo del sondeo (30 s). */
const ESPERA_DE_AVISO_MS = 6000

const salud = await fetch(`${servicio}/salud`).then(async (r) => await r.json()).catch(() => null)

assert.ok(salud?.ok === true, `El servicio de «en vivo» no está arriba o está inactivo: ${JSON.stringify(salud)}`)

/** Manda un lote firmado al servicio, como el board. */
async function emitir (eventos) {
  const cuerpo = JSON.stringify({ eventos, emitido_en: Math.floor(Date.now() / 1000) })
  const respuesta = await fetch(`${servicio}/interno/eventos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...firmar(secreto, 'POST', 'interno/eventos', cuerpo) },
    body: cuerpo
  })

  assert.equal(respuesta.status, 202, 'El servicio rechazó el evento')
}

const audiencia = (parcial) => ({ staff: [], equipo: false, espacio: false, cliente: null, pantallas: false, ...parcial })

const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/** Abre una sesión: inicia sesión, entra a Mis tareas y cuenta lo que llega por el socket y por la red. */
async function abrirSesion (email) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
  const acceso = await contexto.request.post(new URL('/api/sesion', destino).href, {
    data: { email, password: 'mock1234' }
  })

  assert.equal(acceso.status(), 200, `No se pudo iniciar sesión como ${email}`)

  const pagina = await contexto.newPage()
  const sesion = { pagina, contexto, listo: false, cambios: [], listasPedidas: 0 }

  pagina.on('websocket', (socket) => {
    if (!socket.url().endsWith('/bus')) return
    socket.on('framereceived', ({ payload }) => {
      const mensaje = JSON.parse(String(payload))

      if (mensaje.t === 'listo') sesion.listo = true
      if (mensaje.t === 'cambio') sesion.cambios.push(mensaje)
    })
  })
  pagina.on('request', (peticion) => {
    if (/\/api\/bff\/tasks(\?|$)/.test(peticion.url())) sesion.listasPedidas += 1
  })

  // `networkidle` no sirve aquí: el socket abierto y el servidor de desarrollo mantienen la red ocupada.
  await pagina.goto(new URL('/mis-tareas', destino).href, { waitUntil: 'load', timeout: 90000 })

  return sesion
}

/** Espera a que se cumpla la condición; falla con el motivo si pasa el límite. */
async function esperarHasta (condicion, motivo, limiteMs = ESPERA_DE_AVISO_MS) {
  const fin = Date.now() + limiteMs

  while (!condicion()) {
    assert.ok(Date.now() < fin, `Tiempo agotado: ${typeof motivo === 'function' ? motivo() : motivo}`)
    await new Promise((resolver) => setTimeout(resolver, 50))
  }
}

try {
  const ana = await abrirSesion('ana@wiwo.me')
  // Carla (staff 3): Bruno, el 2, tiene 2FA por correo y pediría un código.
  const carla = await abrirSesion('carla@wiwo.me')

  await esperarHasta(() => ana.listo && carla.listo,'las dos sesiones no quedaron conectadas al bus (¿maestro encendido y NEXT_PUBLIC_EN_VIVO_URL?)', 15000)

  // Con el servidor de desarrollo compilando, la primera lista puede llegar tarde: se espera a que
  // las dos hayan pedido la suya para que no se confunda con el efecto del aviso.
  await esperarHasta(() => ana.listasPedidas > 0 && carla.listasPedidas > 0, 'las listas no hicieron su primera consulta', 30000)
  await new Promise((resolver) => setTimeout(resolver, 2000))

  // --- Un cambio de tarea para todo el equipo llega a las dos sin esperar el sondeo.
  const antes = [ana.listasPedidas, carla.listasPedidas]

  await emitir([{ tipo: 'tarea', id: 1, espacio_id: null, audiencia: audiencia({ equipo: true }) }])
  await esperarHasta(() => ana.cambios.length === 1 && carla.cambios.length === 1, 'el cambio de tarea no llegó a las dos sesiones')
  await esperarHasta(
    () => ana.listasPedidas > antes[0] && carla.listasPedidas > antes[1],
    () => `las listas no volvieron a pedir las tareas tras el aviso (antes ${antes}, ahora ${[ana.listasPedidas, carla.listasPedidas]})`
  )

  // --- Un aviso dirigido a Carla (staff 3) no le llega a Ana.
  await emitir([{ tipo: 'aviso', id: 9, espacio_id: null, audiencia: audiencia({ staff: [3] }) }])
  await esperarHasta(() => carla.cambios.some((c) => c.tipo === 'aviso'), 'el aviso no llegó a su destinatario')
  await new Promise((resolver) => setTimeout(resolver, 500))
  assert.equal(ana.cambios.some((c) => c.tipo === 'aviso'), false, 'Ana recibió un aviso que no era suyo')

  // --- El panel sigue sano: sin errores en pantalla tras los avisos.
  for (const { pagina } of [ana, carla]) {
    const texto = await pagina.evaluate(() => document.body.textContent ?? '')

    assert.ok(!/Application error|Algo salió mal/i.test(texto), 'La pantalla muestra un error tras el aviso')
  }

  console.log('OK: dos sesiones reciben el aviso en vivo y solo a quien corresponde.')
  await Promise.all([ana.contexto.close(), carla.contexto.close()])
} finally {
  await navegador.close()
}
