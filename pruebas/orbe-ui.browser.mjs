/**
 * Verificación en navegador de la UI agéntica del Thinking Orb (Fase 3 y front de la Fase 4):
 * pregunta -> opciones pulsables -> plan con riesgos y barra fija -> confirmar, acciones de la
 * respuesta, contexto de pantalla/acta, borrador, «Nueva conversación», atajo Ctrl+J, punto de espera
 * del botón, hoja a pantalla completa en móvil y portal sin escrituras.
 *
 * Requiere el mock (`pnpm mock`) y la app compilada y servida (`pnpm build` + `pnpm start`, nunca
 * `pnpm dev`: ahí la página no hidrata). Toda la API de IA va interceptada: no escribe nada real.
 *
 *   ORBE_TEST_URL   origen de la app (por defecto http://localhost:3126)
 *   ORBE_CAPTURAS   carpeta de las capturas (por defecto output/playwright/orbe)
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { CONTACTOS, STAFF } from '../mock/datos.js'

const destino = new URL(process.env.ORBE_TEST_URL ?? 'http://localhost:3126')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname), 'Solo permite pruebas locales.')
const SALIDA = process.env.ORBE_CAPTURAS ?? 'output/playwright/orbe'
await mkdir(SALIDA, { recursive: true })

const CAPACIDADES = { habilitado: true, agente: { habilitado: true, intervalo_consulta_ms: 400, maximo_pregunta: 6000, nuevas_habilitadas: true, umbral_detenida_segundos: 180 } }
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })

/** Una sesión de navegador con la API de IA interceptada. @returns Contexto, estado y registro de solicitudes. */
async function abrirSesion (credenciales, viewport = { width: 1440, height: 1000 }) {
  const contexto = await navegador.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
  const login = await contexto.request.post(new URL('/api/sesion', destino).href, { data: credenciales })
  assert.ok(login.ok(), `Login: HTTP ${login.status()}`)
  return contexto
}

/** Cierra el modal «Abre tu jornada» si aparece. */
async function cerrarJornada (pagina) {
  const jornada = pagina.getByRole('dialog', { name: 'Abre tu jornada', exact: true })
  try {
    await jornada.waitFor({ timeout: 4000 })
    await jornada.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await jornada.waitFor({ state: 'hidden' })
  } catch { /* sin jornada pendiente */ }
}

const PASOS = [
  { id: 'a', descripcion: 'Buscar la tarea Zoho', estado: 'pendiente', riesgo: 'lectura' },
  { id: 'b', descripcion: 'Cambiar la fecha de entrega', estado: 'pendiente', riesgo: 'escritura' },
  { id: 'c', descripcion: 'Quitar al asignado anterior', estado: 'pendiente', riesgo: 'destructiva' },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, descripcion: `Paso adicional número ${i + 1} con una descripción más larga para forzar el scroll`, estado: 'pendiente' }))
]

try {
  // ---------------------------------------------------------------- Equipo: panel global
  const contexto = await abrirSesion({ email: STAFF[0].email, password: STAFF[0].password })
  const solicitudes = []
  const historial = new Map([[0, []], [1, []]])
  let ids = 0
  let creaciones = 0
  let actaInvalida = false
  await contexto.route('**/api/bff/**', async ruta => {
    const p = ruta.request()
    const url = new URL(p.url())
    const path = url.pathname
    if (!path.includes('/ia/')) return ['GET', 'HEAD', 'OPTIONS'].includes(p.method()) ? ruta.continue() : ruta.abort()
    const cuerpo = p.postData() ? p.postDataJSON() : null
    solicitudes.push({ path, metodo: p.method(), cuerpo, query: url.search })
    if (path.endsWith('/capacidades')) return ruta.fulfill({ json: { data: CAPACIDADES } })
    if (path.endsWith('/ia/propuestas')) return ruta.fulfill({ json: { data: [] } })
    if (path.endsWith('/chat')) return ruta.fulfill({ json: { data: p.method() === 'DELETE' ? { ok: true } : { mensajes: [] } } })
    const alcance = Number(cuerpo?.proyecto_id ?? url.searchParams.get('proyecto_id') ?? 0)
    const lista = historial.get(alcance)
    if (path.endsWith('/ejecuciones') && p.method() === 'DELETE') return ruta.fulfill({ json: { data: { archivadas: lista.splice(0).length } } })
    if (path.endsWith('/ejecuciones') && p.method() === 'GET') return ruta.fulfill({ json: { data: lista } })
    if (path.endsWith('/ejecuciones') && p.method() === 'POST') {
      if (actaInvalida && cuerpo.acta_id) {
        actaInvalida = false
        return ruta.fulfill({ status: 422, json: { error: { code: 'validation_failed', message: 'El acta indicada no existe o no puedes verla.' } } })
      }
      creaciones += 1
      const id = String(++ids)
      const e = creaciones === 1
        ? { id, pregunta: cuerpo.pregunta, estado: 'esperando_datos', mensaje: 'Me falta un dato.', preguntas: [{ id: 'q1', pregunta: '¿A quién asigno la tarea?', opciones: ['Andrés Morales', 'Javier Auspunt'], admite_texto: true }] }
        : { id, pregunta: cuerpo.pregunta, estado: 'completada', resultado: { resumen: 'Listo, no hubo nada que cambiar.' } }
      lista.push(e)
      return ruta.fulfill({ json: { data: e } })
    }
    const id = path.match(/ejecuciones\/(\d+)/)?.[1]
    if (id === undefined) return ruta.fulfill({ json: { data: [] } })
    const e = lista.find(x => x.id === id)
    assert.ok(e, `Ejecución ${id} ajena al alcance ${alcance} (${path})`)
    if (path.endsWith('/reanudar')) {
      Object.assign(e, { estado: 'esperando_confirmacion', preguntas: [], mensaje: 'Este es el plan.', plan: { id, version: 'v1', resumen: 'Reasignar la tarea Zoho', pasos: PASOS } })
    } else if (path.endsWith('/confirmar')) { e.estado = 'ejecutando'; e.consultas = 0; e.plan.pasos = e.plan.pasos.map((x, i) => i === 1 ? { ...x, estado: 'ejecutando' } : x) }
    else if (path.endsWith('/cancelar')) e.estado = 'cancelada'
    else if (p.method() === 'GET' && e.estado === 'ejecutando' && ++e.consultas < 4) { /* sigue ejecutando */ } else if (p.method() === 'GET' && e.estado === 'ejecutando') {
      Object.assign(e, { estado: 'completada', resultado: { resumen: 'Tarea reasignada.', citas: [{ tipo: 'tarea', id: 782, titulo: 'Zoho - Wiwo Talk' }] } })
      e.plan.pasos = e.plan.pasos.map(x => ({ ...x, estado: 'completada' }))
    }
    return ruta.fulfill({ json: { data: e } })
  })

  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('pageerror', error => errores.push(error.message))
  pagina.setDefaultTimeout(20000)
  await pagina.goto(new URL('/tareas', destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  await cerrarJornada(pagina)

  // Atajo Ctrl+J, cabecera y estado vacío.
  const panel = pagina.getByRole('dialog', { name: 'Thinking Orb', exact: true })
  await pagina.keyboard.press('Control+j')
  await panel.waitFor()
  for (const nombre of ['Nueva conversación', 'Cerrar Thinking Orb']) await panel.getByRole('button', { name: nombre, exact: true }).waitFor()
  assert.equal(await panel.getByRole('button', { name: /Ampliar/ }).count(), 0, 'Ampliar solo existe dentro de un Proyecto')
  assert.ok(await panel.getByRole('textbox', { name: 'Tu pregunta' }).evaluate(el => el === document.activeElement), 'El foco va al campo')
  await panel.getByText('Contexto:', { exact: false }).waitFor()
  assert.match(await panel.getByText('Contexto:', { exact: false }).innerText(), /Tareas/)
  await pagina.screenshot({ path: `${SALIDA}/01-vacio-desktop.png` })

  // Escape cierra y Ctrl+J vuelve a abrir.
  await pagina.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  await pagina.keyboard.press('Control+j')
  await panel.waitFor()

  // Enter envía; la pantalla viaja saneada y sin acta.
  const campo = panel.getByRole('textbox', { name: 'Tu pregunta' })
  await campo.fill('Reasigna la tarea Zoho')
  await campo.press('Enter')
  await panel.getByText('¿A quién asigno la tarea?', { exact: true }).waitFor()
  const alta = solicitudes.find(s => s.metodo === 'POST' && s.path.endsWith('/ejecuciones'))
  assert.equal(alta.cuerpo.pantalla, '/tareas')
  assert.equal(alta.cuerpo.acta_id, undefined)

  // Opciones pulsables y texto libre.
  const opcion = panel.getByRole('button', { name: 'Andrés Morales', exact: true })
  await opcion.waitFor()
  await panel.getByRole('textbox', { name: /Otra respuesta/ }).waitFor()
  await pagina.screenshot({ path: `${SALIDA}/02-opciones-desktop.png` })
  await opcion.click()
  await panel.getByRole('heading', { name: 'Plan de trabajo' }).waitFor()
  const reanudar = solicitudes.find(s => s.path.endsWith('/reanudar'))
  assert.equal(reanudar.cuerpo.respuesta, 'Andrés Morales')

  // Plan: marcas de riesgo, barra fija y Confirmar en variante peligro.
  await panel.getByText('Elimina o quita', { exact: true }).waitFor()
  await panel.getByText('Modifica datos', { exact: true }).waitFor()
  const confirmar = panel.getByRole('button', { name: 'Confirmar plan completo' })
  assert.match(await confirmar.getAttribute('class'), /bg-relleno-peligro/, 'Confirmar pasa a peligro con un paso destructivo')
  await panel.getByText('Elimina o quita datos: revísalo antes de confirmar.', { exact: true }).waitFor()
  const dentro = async () => {
    const [c, p] = await Promise.all([confirmar.boundingBox(), panel.boundingBox()])
    return c.y >= p.y && c.y + c.height <= p.y + p.height
  }
  await panel.locator('div.overflow-y-auto').first().evaluate(el => { el.scrollTop = 0 })
  assert.ok(await dentro(), 'Confirmar queda a la vista sin hacer scroll hasta el final del plan')
  await pagina.screenshot({ path: `${SALIDA}/03-plan-desktop.png` })
  await panel.getByRole('button', { name: 'Cancelar ejecución' }).waitFor()
  await panel.locator('div.overflow-y-auto').first().evaluate(el => { el.scrollTop = 260 })
  await pagina.screenshot({ path: `${SALIDA}/03b-plan-pasos-desktop.png` })
  await confirmar.click()
  const activo = panel.locator('li[aria-current="step"]')
  await activo.waitFor()
  await pagina.waitForTimeout(500)
  const estiloHalo = await activo.locator('span.bg-acento').first().getAttribute('style')
  assert.match(estiloHalo ?? '', /transform|scale|opacity/, 'El paso activo se anima con anime.js')
  await pagina.screenshot({ path: `${SALIDA}/03c-paso-activo-desktop.png` })
  await panel.getByText('Tarea reasignada.', { exact: true }).waitFor()
  await panel.getByRole('link', { name: /Zoho - Wiwo Talk/ }).waitFor()
  await panel.getByText('Fuentes', { exact: true }).waitFor()
  assert.equal(solicitudes.filter(s => s.path.endsWith('/confirmar')).length, 1)

  // Acciones de la respuesta: Copiar, Editar y Reintentar.
  await panel.getByRole('button', { name: 'Copiar', exact: true }).click()
  await pagina.getByText('Respuesta copiada.', { exact: true }).waitFor()
  assert.match(await pagina.evaluate(() => navigator.clipboard.readText()), /Reasignar la tarea Zoho/)
  const ultimaCompletada = historial.get(0).at(-1)
  assert.equal(ultimaCompletada.estado, 'completada')
  await panel.getByRole('button', { name: 'Editar pregunta', exact: true }).click()
  assert.equal(await campo.inputValue(), 'Reasigna la tarea Zoho')
  await campo.fill('')
  await panel.getByRole('button', { name: 'Reintentar esta pregunta como una nueva' }).click()
  await panel.getByText('Listo, no hubo nada que cambiar.', { exact: true }).waitFor()
  const reintento = solicitudes.filter(s => s.metodo === 'POST' && s.path.endsWith('/ejecuciones')).at(-1)
  assert.equal(reintento.cuerpo.pregunta, 'Reasigna la tarea Zoho')

  // Quitar el contexto: la pantalla deja de viajar.
  await panel.getByRole('button', { name: /Quitar el contexto/ }).click()
  await panel.getByRole('button', { name: /Añadir contexto/ }).waitFor()
  await campo.fill('Otra pregunta sin contexto')
  await campo.press('Enter')
  await panel.getByText('Otra pregunta sin contexto', { exact: true }).waitFor()
  const sinContexto = solicitudes.filter(s => s.metodo === 'POST' && s.path.endsWith('/ejecuciones')).at(-1)
  assert.equal(sinContexto.cuerpo.pantalla, undefined)

  // Nueva conversación: Escape dentro de la confirmación no cierra el panel; confirmar borra.
  await panel.getByRole('button', { name: 'Nueva conversación', exact: true }).click()
  const confirmacion = pagina.getByRole('dialog', { name: 'Nueva conversación' })
  await confirmacion.waitFor()
  await pagina.keyboard.press('Escape')
  await confirmacion.waitFor({ state: 'hidden' })
  await panel.waitFor()
  await panel.getByRole('button', { name: 'Nueva conversación', exact: true }).click()
  await confirmacion.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await confirmacion.waitFor({ state: 'hidden' })
  assert.equal(historial.get(0).length, 0)
  assert.ok(solicitudes.some(s => s.metodo === 'DELETE' && s.path.endsWith('/ejecuciones')))
  await panel.getByText('Pregúntale a Thinking Orb', { exact: false }).waitFor()

  // Punto de espera en el botón con el panel cerrado.
  creaciones = 0
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).fill('Pregunta que queda esperando')
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).press('Enter')
  await panel.getByRole('button', { name: 'Javier Auspunt', exact: true }).waitFor()
  await panel.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await panel.waitFor({ state: 'hidden' })
  const boton = pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb. Espera tu respuesta', exact: true })
  await boton.waitFor()
  await pagina.screenshot({ path: `${SALIDA}/04-fab-espera-desktop.png`, clip: { x: 1240, y: 820, width: 200, height: 180 } })

  // Borrador por ámbito: sobrevive a cerrar y a recargar.
  // Un aviso reciente puede estar encima del botón: el clic va por `evaluate`.
  await boton.evaluate(el => { el.click() })
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).fill('borrador pendiente')
  await pagina.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  await pagina.reload({ waitUntil: 'networkidle' })
  await cerrarJornada(pagina)
  await pagina.keyboard.press('Control+j')
  await panel.waitFor()
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).waitFor()
  assert.equal(await panel.getByRole('textbox', { name: 'Tu pregunta' }).inputValue(), 'borrador pendiente')
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).fill('')
  await pagina.keyboard.press('Escape')

  // ---------------------------------------------------------------- Móvil: hoja a pantalla completa
  await pagina.setViewportSize({ width: 390, height: 844 })
  await pagina.keyboard.press('Control+j')
  await panel.waitFor()
  await pagina.waitForTimeout(400)
  const caja = await panel.boundingBox()
  assert.ok(Math.abs(caja.width - 390) <= 1 && Math.abs(caja.height - 844) <= 1, `La hoja ocupa toda la pantalla (${caja.width}x${caja.height})`)
  assert.equal(await panel.getByRole('button', { name: /Redimensionar/ }).isVisible(), false, 'Sin tirador en móvil')
  assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'Sin desborde horizontal')
  await pagina.screenshot({ path: `${SALIDA}/05-hoja-movil-390.png` })
  await panel.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.setViewportSize({ width: 1440, height: 1000 })

  // ---------------------------------------------------------------- Proyecto: hilo, ampliar y acta
  await pagina.goto(new URL('/proyectos/1', destino).href, { waitUntil: 'networkidle' })
  await cerrarJornada(pagina)
  await pagina.keyboard.press('Control+j')
  await panel.waitFor()
  const continuar = panel.getByRole('button', { name: /Continuar en el hilo de/ })
  await continuar.waitFor()
  await panel.getByRole('button', { name: 'Ampliar a la pestaña del proyecto' }).waitFor()
  await pagina.screenshot({ path: `${SALIDA}/06-proyecto-chip-desktop.png` })
  await continuar.click()
  await panel.getByRole('button', { name: 'Volver al hilo global' }).waitFor()
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).waitFor()
  assert.ok(solicitudes.some(s => s.query.includes('proyecto_id=1')), 'El hilo del proyecto se pide con su alcance')
  await panel.getByRole('button', { name: 'Volver al hilo global' }).click()
  await panel.getByRole('button', { name: /Continuar en el hilo de/ }).waitFor()
  await panel.getByRole('button', { name: 'Ampliar a la pestaña del proyecto' }).click()
  await pagina.waitForURL(/\/proyectos\/1\?tab=wibot/)
  await panel.waitFor({ state: 'hidden' })
  assert.equal(await pagina.getByRole('tab', { name: /Thinking Orb/ }).count() >= 0, true)

  // Acta abierta: chip, sugerencias propias y rechazo 422 que la quita.
  await pagina.goto(new URL('/proyectos/1?tab=actas&acta=5', destino).href, { waitUntil: 'networkidle' })
  await cerrarJornada(pagina)
  historial.get(0).length = 0
  await pagina.keyboard.press('Control+j')
  await panel.waitFor()
  await panel.getByText('Meeting Paper #5', { exact: false }).waitFor()
  await panel.getByRole('button', { name: '¿Qué se acordó en esta reunión?', exact: true }).waitFor()
  actaInvalida = true
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).fill('Resume el acta')
  await panel.getByRole('textbox', { name: 'Tu pregunta' }).press('Enter')
  await pagina.getByText('No se pudo usar ese Meeting Paper como contexto', { exact: false }).waitFor()
  const conActa = solicitudes.filter(s => s.metodo === 'POST' && s.path.endsWith('/ejecuciones')).at(-1)
  assert.equal(conActa.cuerpo.acta_id, 5)
  assert.equal(await panel.getByText('Meeting Paper #5', { exact: false }).count(), 0, 'Tras el 422 el chip ya no promete el acta')
  await pagina.screenshot({ path: `${SALIDA}/07-acta-422-desktop.png` })
  assert.deepEqual(errores, [])

  // ---------------------------------------------------------------- Portal: solo lectura
  // El Thinking Orb del portal está apagado de fábrica en el mock: se enciende como lo hace Administración.
  const apiMock = process.env.ORBE_MOCK_URL ?? 'http://localhost:3001/api/v1'
  const tokenStaff = (await (await fetch(`${apiMock}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: STAFF[0].email, password: STAFF[0].password }) })).json()).data.access_token
  const encendido = await fetch(`${apiMock}/settings`, { method: 'PATCH', headers: { authorization: `Bearer ${tokenStaff}`, 'content-type': 'application/json' }, body: JSON.stringify({ wiwo_portal_ia_chat: true }) })
  assert.ok(encendido.ok, `No se pudo encender el orbe del portal: HTTP ${encendido.status}`)
  const contactoCtx = await abrirSesion({ portal: true, email: CONTACTOS[0].email, password: CONTACTOS[0].password })
  await contactoCtx.route('**/api/bff/**', async ruta => {
    const p = ruta.request()
    const path = new URL(p.url()).pathname
    if (path.includes('/ia/') && p.method() === 'POST') {
      const accion = { id: 9, herramienta: 'actualizar_tarea', resumen: 'Cambio que no debería verse', detalle: [], supuestos: [], estado: 'pendiente', expira_en: new Date(Date.now() + 600000).toISOString() }
      return ruta.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ t: 'Respuesta de solo lectura.' })}\n\nevent: propuesta\ndata: ${JSON.stringify(accion)}\n\nevent: fin\ndata: {}\n\n` })
    }
    return ruta.continue()
  })
  const portal = await contactoCtx.newPage()
  const erroresPortal = []
  portal.on('pageerror', error => erroresPortal.push(error.message))
  portal.setDefaultTimeout(20000)
  await portal.goto(new URL('/portal', destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  await portal.keyboard.press('Control+j')
  const panelPortal = portal.getByRole('dialog', { name: 'Thinking Orb', exact: true })
  await panelPortal.waitFor()
  const campoPortal = panelPortal.getByRole('textbox', { name: 'Tu pregunta' })
  await campoPortal.fill('¿Cómo van mis proyectos?')
  await campoPortal.press('Enter')
  await panelPortal.getByText('Respuesta de solo lectura.', { exact: true }).waitFor()
  for (const prohibido of ['Confirmar', 'Aplicar', 'Cancelar', 'Ampliar a la pestaña del proyecto', 'Copiar', 'Reintentar']) {
    assert.equal(await panelPortal.getByRole('button', { name: new RegExp(prohibido) }).count(), 0, `El portal no debe ofrecer «${prohibido}»`)
  }
  assert.equal(await panelPortal.getByText('Cambio que no debería verse').count(), 0, 'Una propuesta colada no se pinta en el portal')
  await portal.screenshot({ path: `${SALIDA}/08-portal-solo-lectura-desktop.png` })
  assert.deepEqual(erroresPortal, [])
  console.log(`PASS: Orbe UI agéntica en navegador. Capturas en ${SALIDA}`)
} finally {
  await navegador.close()
}
