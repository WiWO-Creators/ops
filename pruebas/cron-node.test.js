import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { crearProgramador, leerConfiguracion } from '../scripts/cron.mjs'

const entorno = {
  OPS_CRON_BASE_URL: 'https://board.example/api/cron',
  OPS_CRON_SECRET: 'a'.repeat(64),
  OPS_TIMER_CUTOFF_HOUR: '19:30'
}
const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), { status })
const listo = { status: 'ready', hora_corte: '19:30', zona: 'America/Santiago' }

test('configuración explícita: HTTPS, secreto, horas AM/PM y cron válido', () => {
  assert.equal(leerConfiguracion(entorno).corte, '30 19 * * *')
  assert.equal(leerConfiguracion({ ...entorno, OPS_CRON_REQUEST_TIMEOUT_MS: '' }).timeout, 240000)
  assert.equal(leerConfiguracion({ ...entorno, OPS_TIMER_CUTOFF_HOUR: '07:30' }).corte, '30 7 * * *')
  for (const cambio of [
    { OPS_CRON_BASE_URL: 'http://board.example/api/cron' },
    { OPS_CRON_BASE_URL: 'https://user:pass@board.example/api/cron' },
    { OPS_CRON_SECRET: '' }, { OPS_TIMER_CUTOFF_HOUR: '' }, { OPS_TIMER_CUTOFF_HOUR: '25:30' },
    { OPS_CRON_POLL_SCHEDULE: 'ayer' }, { OPS_CRON_REQUEST_TIMEOUT_MS: 'NaN' },
    { OPS_CRON_RESUMEN_SCHEDULE: 'a las ocho' }
  ]) assert.throws(() => leerConfiguracion({ ...entorno, ...cambio }))
  // El resumen del equipo tiene su propia hora y no la hereda del corte de cronómetros.
  assert.equal(leerConfiguracion(entorno).resumen, '0 20 * * *')
  assert.equal(leerConfiguracion({ ...entorno, OPS_CRON_RESUMEN_SCHEDULE: '15 21 * * 1-5' }).resumen, '15 21 * * 1-5')
})

test('preflight no ejecuta trabajos y rechaza autenticación u hora incompatible', async () => {
  const llamadas = []
  const programador = crearProgramador(leerConfiguracion(entorno), { fetchImpl: async (url, opciones) => {
    llamadas.push([url.pathname, opciones.method])
    assert.equal(opciones.headers['X-Ops-Cron-Secret'], entorno.OPS_CRON_SECRET)
    assert.equal(opciones.redirect, 'error')
    return respuesta(listo)
  } })
  await programador.comprobar()
  assert.deepEqual(llamadas, [['/api/cron/estado', 'GET']])
  for (const retorno of [respuesta({}, 401), respuesta({ ...listo, hora_corte: '07:30' }), respuesta(null)]) {
    await assert.rejects(crearProgramador(leerConfiguracion(entorno), { fetchImpl: async () => retorno }).comprobar())
  }
})

test('horarios Santiago, recuperación al iniciar, no solapamiento y cierre ordenado', async () => {
  const agendas = []
  const llamadas = []
  const registros = []
  let liberar
  const cronImpl = { schedule: (expresion, accion, opciones) => {
    const agenda = { expresion, accion, opciones, stop: () => { agenda.parada = true }, destroy: () => { agenda.destruida = true }, on: () => {} }
    agendas.push(agenda)
    return agenda
  } }
  const programador = crearProgramador(leerConfiguracion(entorno), { cronImpl, log: (registro) => registros.push(registro), fetchImpl: async (url) => {
    llamadas.push(url.pathname)
    if (url.pathname.endsWith('/estado')) return respuesta(listo)
    if (url.pathname.endsWith('/rutinas')) await new Promise((resolve) => { liberar = resolve })
    return respuesta({ status: 'completed' })
  } })
  await programador.iniciar()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(agendas.map((a) => a.expresion), ['*/5 * * * *', '*/15 * * * *', '0 3 * * *', '0 20 * * *', '30 19 * * *'])
  assert.ok(!llamadas.includes('/api/cron/resumen_equipo'), 'El resumen es de una hora fija: no se recupera al arrancar')
  assert.ok(agendas.every((a) => a.opciones.timezone === 'America/Santiago' && a.opciones.noOverlap))
  assert.ok(llamadas.includes('/api/cron/cortar_cronometros'), 'Recupera cortes al reiniciar')
  assert.ok(llamadas.includes('/api/cron/jornadas') && llamadas.includes('/api/cron/papelera'), 'Recupera los antiguos trabajos CLI')
  assert.ok(llamadas.indexOf('/api/cron/cortar_cronometros') < llamadas.indexOf('/api/cron/rutinas'), 'Corta antes de rutinas legacy')
  assert.equal((await programador.ejecutar('rutinas')).status, 'skipped')
  assert.equal(llamadas.filter((ruta) => ruta.endsWith('/rutinas')).length, 1)
  liberar()
  await programador.detener()
  assert.ok(agendas.every((a) => a.parada && a.destruida))
  assert.equal((await programador.ejecutar('cortar_cronometros')).status, 'skipped')
  assert.ok(!JSON.stringify(registros).includes(entorno.OPS_CRON_SECRET))
})

test('un fallo libera el trabajo para reintentar y no registra respuestas ni secretos', async () => {
  const registros = []
  let fallar = true
  const programador = crearProgramador(leerConfiguracion(entorno), { log: (registro) => registros.push(registro), fetchImpl: async () => {
    if (fallar) return respuesta({ error: entorno.OPS_CRON_SECRET }, 503)
    return respuesta({ status: 'skipped', reason: 'sin_cronometros' })
  } })
  assert.equal((await programador.ejecutar('cortar_cronometros')).status, 'failed')
  assert.equal(registros.at(-1).http, 503)
  fallar = false
  assert.equal((await programador.ejecutar('cortar_cronometros')).status, 'skipped')
  assert.ok(!JSON.stringify(registros).includes(entorno.OPS_CRON_SECRET))
  await assert.rejects(programador.ejecutar('arbitrario'))
})

test('node-cron real arranca y se detiene; un corte fallido bloquea las rutinas del arranque', async () => {
  const llamadas = []
  const programador = crearProgramador(leerConfiguracion(entorno), { log: () => {}, fetchImpl: async (url) => {
    llamadas.push(url.pathname)
    return url.pathname.endsWith('/estado') ? respuesta(listo) : respuesta({}, 503)
  } })
  await programador.iniciar()
  await new Promise((resolve) => setImmediate(resolve))
  await programador.detener()
  assert.deepEqual(llamadas, ['/api/cron/estado', '/api/cron/cortar_cronometros'])
})


test('PM2 importa el entrypoint y ejecuta preflight sin disparar trabajos', () => {
  const script = new URL('../scripts/cron.mjs', import.meta.url)
  const codigo = `
    process.argv.push('--check');
    globalThis.fetch = async () => new Response(JSON.stringify(${JSON.stringify(listo)}));
    await import(${JSON.stringify(script.href)});
  `
  const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    env: { ...process.env, ...entorno, pm_exec_path: fileURLToPath(script) },
    encoding: 'utf8', timeout: 10000
  })
  assert.equal(resultado.status, 0, resultado.stderr)
  assert.match(resultado.stdout, /configuracion_verificada/)
  assert.doesNotMatch(resultado.stdout, /iniciado/)
})
