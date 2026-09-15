import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { STAFF } from '../mock/datos.js'

/** Prueba el flujo durable en navegador contra contratos interceptados, sin escrituras reales. */
const destino = new URL(process.env.ORBE_TEST_URL ?? 'http://localhost:3126')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname))
const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE })
try {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
  const login = await contexto.request.post(new URL('/api/sesion', destino).href, { data: { email: STAFF[0].email, password: STAFF[0].password } })
  assert.ok(login.ok(), `Login: HTTP ${login.status()}`)
  const solicitudes = []
  const historial = new Map([[1, []], [0, []]])
  let ultimaId = 0
  let perderConfirmacion = false
  let perderCreacion = false
  let agenteHabilitado = true
  let estadoCapacidades = 200
  await contexto.route('**/api/bff/**', async ruta => {
    const p = ruta.request()
    const url = new URL(p.url())
    const path = url.pathname
    if (!path.includes('/ia/')) return ['GET', 'HEAD', 'OPTIONS'].includes(p.method()) ? ruta.continue() : ruta.abort()
    const cuerpo = p.postData() ? p.postDataJSON() : null
    solicitudes.push({ path, metodo: p.method(), cuerpo, query: url.search })
    if (path.endsWith('/capacidades') && estadoCapacidades !== 200) return ruta.fulfill({ status: estadoCapacidades, json: { error: { code: 'capabilities_unavailable', message: 'Capacidades temporalmente no disponibles.' } } })
    if (path.endsWith('/capacidades')) return ruta.fulfill({ json: { data: { agente: { habilitado: agenteHabilitado, intervalo_consulta_ms: 500, maximo_pregunta: 6000 } } } })
    if (path.endsWith('/chat')) return ruta.fulfill({ json: { data: { mensajes: [{ rol: 'ia', texto: 'Historial del motor anterior' }] } } })
    const scope = Number(cuerpo?.proyecto_id ?? url.searchParams.get('proyecto_id') ?? 0)
    const lista = historial.get(scope)
    assert.ok(lista, `Scope inesperado ${scope}`)
    if (path.endsWith('/ejecuciones') && p.method() === 'GET') return ruta.fulfill({ json: { data: lista } })
    if (path.endsWith('/ejecuciones') && p.method() === 'POST') {
      assert.match(cuerpo.clave_idempotencia, /^[\da-f-]{36}$/)
      if (perderCreacion) { perderCreacion = false; return ruta.abort() }
      const id = String(++ultimaId)
      const e = { id, pregunta: cuerpo.pregunta, estado: 'esperando_confirmacion', plan: { id, version: 'version-inmutable', resumen: 'Crear tarea y asignar a Andrés Morales y Javier Auspunt', pasos: [{ id: 'crear', descripcion: 'Crear Agregar bidireccionalidad Zoho - Wiwo Talk en MG Motors', detalle: ['Proyecto: MG Motors (ID 9).'], supuestos: ['Sin fecha de entrega.'], estado: 'pendiente' }, { id: 'asignar', descripcion: 'Asignar a Andrés Morales y Javier Auspunt', estado: 'pendiente' }] } }
      lista.push(e)
      return ruta.fulfill({ json: { data: e } })
    }
    const id = path.match(/ejecuciones\/(\d+)/)?.[1]
    const e = lista.find(x => x.id === id)
    assert.ok(e, `Ejecución ${id} ajena a scope ${scope}`)
    if (path.endsWith('/confirmar')) {
      assert.deepEqual(cuerpo, { proyecto_id: scope, plan_id: e.id, version: e.plan.version })
      e.estado = 'ejecutando'
      if (perderConfirmacion) { perderConfirmacion = false; return ruta.abort() }
    } else if (path.endsWith('/cancelar')) e.estado = 'cancelada'
    else if (path.endsWith('/reanudar')) {
      assert.match(cuerpo.clave_idempotencia, /^[\da-f-]{36}$/)
      if (e.estado === 'esperando_confirmacion') {
        assert.equal(cuerpo.respuesta, 'Asigna solo a Andrés Morales')
        assert.equal(cuerpo.plan_id, e.plan.id)
        assert.equal(cuerpo.version, e.plan.version)
        e.plan = { ...e.plan, version: 'version-revisada', resumen: 'Crear tarea y asignar solo a Andrés Morales', pasos: [e.plan.pasos[0], { ...e.plan.pasos[1], descripcion: 'Asignar solo a Andrés Morales' }] }
        e.aclaraciones = [...(e.aclaraciones ?? []), cuerpo.respuesta]
      } else {
        assert.equal(cuerpo.respuesta, 'Andrés Morales y Javier Auspunt')
        assert.equal(cuerpo.version, undefined, 'Una aclaración no requiere versión de plan')
      }
      e.estado = 'esperando_confirmacion'
      e.preguntas = []
    } else if (p.method() === 'GET' && e.estado === 'ejecutando') {
      e.estado = 'completada'
      e.plan.pasos = e.plan.pasos.map(paso => ({ ...paso, estado: 'completada', resultado: { resumen: paso.id === 'crear' ? 'Tarea 782 creada' : e.plan.version === 'version-revisada' ? 'Andrés Morales asignado' : 'Ambos responsables asignados' } }))
      e.resultado = { resumen: 'Tarea creada y asignada correctamente.' }
    }
    return ruta.fulfill({ json: { data: e } })
  })
  const pagina = await contexto.newPage()
  const errores = []
  pagina.on('pageerror', error => errores.push(error.message))
  pagina.setDefaultTimeout(20000)
  await pagina.goto(new URL('/proyectos/1?tab=wibot', destino).href, { waitUntil: 'networkidle', timeout: 90000 })
  const jornada = pagina.getByRole('dialog', { name: 'Abre tu jornada', exact: true })
  await jornada.waitFor()
  await jornada.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await jornada.waitFor({ state: 'hidden' })
  await pagina.getByText('Conversación anterior', { exact: true }).click()
  await pagina.getByText('Historial del motor anterior', { exact: true }).waitFor()
  assert.equal(await pagina.getByRole('textbox', { name: 'Tu pregunta' }).getAttribute('maxlength'), '6000')
  await pagina.getByRole('textbox', { name: 'Tu pregunta' }).fill('Agrega tarea Zoho - Wiwo Talk y asigna ambos responsables')
  await pagina.getByRole('button', { name: 'Preguntar', exact: true }).click()
  await pagina.getByRole('button', { name: 'Confirmar plan completo' }).waitFor()
  await pagina.getByText('Proyecto: MG Motors (ID 9).', { exact: true }).waitFor()
  await pagina.getByText('Sin fecha de entrega.', { exact: true }).waitFor()
  assert.equal(solicitudes.filter(s => s.path.endsWith('/confirmar')).length, 0)
  const idOriginal = historial.get(1)[0].id
  const campoPlan = pagina.getByRole('textbox', { name: 'Tu pregunta' })
  const confirmarPlan = pagina.getByRole('button', { name: 'Confirmar plan completo' })
  const actualizarPlan = pagina.getByRole('button', { name: 'Actualizar plan', exact: true })
  assert.ok(await actualizarPlan.isDisabled(), 'Edición vacía deshabilitada')
  await campoPlan.fill('   ')
  assert.ok(await actualizarPlan.isDisabled(), 'Solo espacios no actualiza el plan')
  await campoPlan.fill('Asigna solo a Andrés Morales')
  assert.ok(await confirmarPlan.isDisabled(), 'No aprueba mientras hay cambios sin enviar')
  await campoPlan.fill('')
  assert.ok(await confirmarPlan.isEnabled(), 'Borrar borrador permite confirmar el plan actual')
  await campoPlan.fill('Asigna solo a Andrés Morales')
  await actualizarPlan.click()
  await pagina.getByText('Crear tarea y asignar solo a Andrés Morales', { exact: true }).waitFor()
  assert.equal(historial.get(1).length, 1, 'Editar no crea otro pedido')
  assert.equal(historial.get(1)[0].id, idOriginal, 'Editar conserva ejecución')
  assert.equal(historial.get(1)[0].plan.version, 'version-revisada')
  assert.equal(solicitudes.filter(s => s.path.endsWith('/confirmar')).length, 0, 'Editar no ejecuta')
  await confirmarPlan.dblclick()
  await pagina.getByText('Tarea creada y asignada correctamente.', { exact: true }).waitFor()
  assert.equal(solicitudes.filter(s => s.path.endsWith('/confirmar')).length, 1)
  assert.equal(solicitudes.find(s => s.path.endsWith('/confirmar')).cuerpo.version, 'version-revisada', 'Confirma la nueva versión')
  assert.ok(await pagina.getByText('Andrés Morales asignado', { exact: true }).isVisible())
  await pagina.reload({ waitUntil: 'networkidle' })
  await pagina.getByText('Tarea creada y asignada correctamente.', { exact: true }).waitFor()
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  const global = pagina.getByRole('dialog', { name: 'Thinking Orb', exact: true })
  await global.getByRole('textbox', { name: 'Tu pregunta' }).waitFor()
  assert.equal(await global.getByText('Tarea creada y asignada correctamente.', { exact: true }).count(), 0)
  await global.getByRole('textbox', { name: 'Tu pregunta' }).fill('Otro plan global')
  await global.getByRole('button', { name: 'Preguntar', exact: true }).click()
  perderConfirmacion = true
  await global.getByRole('button', { name: 'Confirmar plan completo' }).click()
  await global.getByRole('button', { name: 'Recuperar estado' }).waitFor()
  assert.ok(await global.getByRole('button', { name: 'Confirmar plan completo' }).isDisabled())
  await global.getByRole('button', { name: 'Recuperar estado' }).click()
  await global.getByText('Tarea creada y asignada correctamente.', { exact: true }).waitFor()
  assert.equal(solicitudes.filter(s => s.path.endsWith('/confirmar')).length, 2, 'Recuperar no repite confirmación')
  const e = historial.get(0).at(-1)
  e.estado = 'esperando_datos'
  delete e.resultado
  e.plan.pasos = e.plan.pasos.map(p => ({ id: p.id, descripcion: p.descripcion, estado: 'pendiente' }))
  e.preguntas = [{ pregunta: '¿Quiénes serán responsables?', opciones: ['Andrés Morales', 'Javier Auspunt'] }]
  await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  await global.getByText('¿Quiénes serán responsables?', { exact: true }).waitFor()
  await global.getByRole('textbox', { name: 'Tu pregunta' }).fill('Andrés Morales y Javier Auspunt')
  await global.getByRole('button', { name: 'Responder y continuar' }).click()
  await global.getByRole('button', { name: 'Confirmar plan completo' }).waitFor()
  await mkdir('output/playwright', { recursive: true })
  await pagina.screenshot({ path: 'output/playwright/orbe-agente-desktop.png', fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  await pagina.screenshot({ path: 'output/playwright/orbe-agente-mobile.png', fullPage: true })
  assert.equal(await global.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'Sin desborde horizontal móvil')
  await global.getByRole('button', { name: 'Cancelar ejecución' }).click()
  await global.getByText('Cancelado', { exact: true }).waitFor()
  perderCreacion = true
  await global.getByRole('textbox', { name: 'Tu pregunta' }).fill('Crear otro plan tras recuperar conexión')
  await global.getByRole('button', { name: 'Preguntar', exact: true }).click()
  await global.getByRole('button', { name: 'Recuperar estado' }).click()
  await global.getByRole('button', { name: 'Preguntar', exact: true }).click()
  await global.getByRole('button', { name: 'Confirmar plan completo' }).waitFor()
  const altas = solicitudes.filter(s => s.metodo === 'POST' && s.path.endsWith('/ejecuciones'))
  assert.equal(altas.at(-1).cuerpo.clave_idempotencia, altas.at(-2).cuerpo.clave_idempotencia, 'Reintentar creación conserva clave')
  await global.getByRole('button', { name: 'Cancelar ejecución' }).click()
  await global.getByRole('button', { name: 'Cancelar ejecución' }).waitFor({ state: 'hidden' })
  const permanente = historial.get(0).at(-1)
  permanente.estado = 'error'
  permanente.error = { codigo: 'plan_obsoleto', mensaje: 'Cancela pasos pendientes y prepara nuevo plan.', reintentable: false }
  await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  await global.getByText('Cancela pasos pendientes y prepara nuevo plan.', { exact: true }).waitFor()
  assert.equal(await global.getByRole('button', { name: 'Continuar ejecución' }).count(), 0, 'Error permanente no permite reanudar')
  assert.ok(await global.getByRole('textbox', { name: 'Tu pregunta' }).isDisabled(), 'Requiere cancelar antes de preparar otro plan')
  await global.getByRole('button', { name: 'Cancelar ejecución' }).click()
  await global.getByRole('button', { name: 'Cancelar ejecución' }).waitFor({ state: 'hidden' })
  assert.ok(await global.getByRole('textbox', { name: 'Tu pregunta' }).isEnabled(), 'Cancelar libera la conversación')
  permanente.estado = 'esperando_confirmacion'
  permanente.plan = null
  await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  await global.getByText('Revisa el plan completo', { exact: true }).waitFor()
  assert.equal(await global.getByRole('button', { name: 'Actualizar plan', exact: true }).count(), 0, 'Plan null no permite edición sin versión')
  assert.ok(await global.getByRole('textbox', { name: 'Tu pregunta' }).isDisabled())
  await global.getByRole('button', { name: 'Cancelar ejecución' }).click()
  await global.getByRole('button', { name: 'Cancelar ejecución' }).waitFor({ state: 'hidden' })
  // El caso visual reproduce la propuesta extensa de la captura, con datos sintéticos.
  historial.set(0, [{
    id: '900', estado: 'esperando_confirmacion', pregunta: 'Crea Proyecto Skydive para Skydiveandes, con hitos semanales y las tareas de diseño, programación y puesta a producción.',
    mensaje: 'He preparado la propuesta para **Proyecto Skydive**, del cliente **Skydiveandes**.\n\nEl proyecto comienza el **21 de septiembre de 2026** y termina el **19 de octubre**.\n\n- **Hitos semanales:** Semana 1, Semana 2, Semana 3 y Semana 4.\n- **Tareas distribuidas:**\n  - Diseño web en Semana 1.\n  - Programación web en Semana 2.\n  - Puesta a producción en Semana 4.',
    plan: { id: '900', version: 'skydive-v1', resumen: 'Crear el proyecto y organizar sus entregables.', pasos: [
      { id: 'proyecto', descripcion: 'Crear **Proyecto Skydive**', detalle: ['**Cliente:** Skydiveandes', '**Duración:** 21 de septiembre al 19 de octubre de 2026'], supuestos: ['Las fechas se confirman antes de iniciar el proyecto.'], estado: 'pendiente' },
      { id: 'hitos', descripcion: 'Agregar los cuatro hitos semanales', detalle: ['Semana 1 · Semana 2 · Semana 3 · Semana 4'], estado: 'pendiente' },
      { id: 'tareas', descripcion: 'Distribuir las tareas entre los hitos', detalle: ['- **Semana 1:** Diseño web\n- **Semana 2:** Programación web\n- **Semana 4:** Puesta a producción'], estado: 'pendiente' }
    ] }
  }])
  await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.setViewportSize({ width: 1440, height: 1100 })
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  await global.getByRole('heading', { name: 'Plan de trabajo' }).waitFor()
  await global.getByText('Ver explicación del plan', { exact: true }).click()
  assert.ok(await global.locator('strong').filter({ hasText: 'Proyecto Skydive' }).count() >= 1, 'Markdown interpreta negritas')
  assert.ok(await global.locator('ul ul').count() >= 1, 'Listas anidadas conservan estructura')
  assert.ok(!(await global.innerText()).includes('**'), 'Sin marcadores Markdown visibles')
  assert.equal(await global.getByRole('list', { name: 'Pasos del plan' }).locator(':scope > li').count(), 3)
  assert.equal(await global.getByRole('button', { name: 'Confirmar plan completo' }).count(), 1)
  for (const [nombre, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    await pagina.setViewportSize({ width, height })
    await global.getByText('Ver explicación del plan', { exact: true }).evaluate(el => { el.parentElement.open = true })
    await global.getByText('He preparado la propuesta para', { exact: false }).evaluate(el => el.scrollIntoView({ block: 'start' }))
    await pagina.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    assert.equal(await global.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `Sin desborde ${nombre}`)
    await global.screenshot({ path: `output/playwright/orbe-ui-${nombre}.png` })
    await global.getByRole('heading', { name: 'Plan de trabajo' }).evaluate(el => el.closest('section')?.scrollIntoView({ block: 'start' }))
    await global.screenshot({ path: `output/playwright/orbe-plan-${nombre}.png` })
  }
  await pagina.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await global.getByRole('heading', { name: 'Plan de trabajo' }).scrollIntoViewIfNeeded()
  assert.equal(await global.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'Sin desborde en oscuro')
  await global.screenshot({ path: 'output/playwright/orbe-plan-dark.png' })
  await pagina.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  agenteHabilitado = false
  await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  await global.getByText('Historial del motor anterior', { exact: true }).waitFor()
  estadoCapacidades = 404
  await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
  await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
  await global.getByText('Historial del motor anterior', { exact: true }).waitFor()
  assert.equal(await global.getByRole('textbox', { name: 'Tu pregunta' }).count(), 1, '404 capacidades conserva chat anterior')
  for (const estado of [500, 401]) {
    estadoCapacidades = estado
    await global.getByRole('button', { name: 'Cerrar Thinking Orb', exact: true }).click()
    await pagina.getByRole('button', { name: 'Preguntarle a Thinking Orb', exact: true }).click()
    await global.getByRole('alert').waitFor()
    assert.equal(await global.getByRole('textbox', { name: 'Tu pregunta' }).count(), 0, `${estado} no activa chat anterior`)
  }
  assert.deepEqual(errores, [])
  console.log('PASS: confirmación única, pasos sin prosa, recuperación sin duplicados, scopes, aclaración, cancelación y móvil.')
} finally { await navegador.close() }
