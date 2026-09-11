import cron from 'node-cron'
import { loadEnvFile } from 'node:process'
import { pathToFileURL } from 'node:url'

/** Valida la configuración del proceso; una hora ausente nunca activa un corte implícito. */
export function leerConfiguracion (env = process.env) {
  const base = new URL(env.OPS_CRON_BASE_URL ?? '')
  if (base.username || base.password || base.search || base.hash ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new Error('OPS_CRON_BASE_URL debe usar HTTPS y no incluir credenciales ni parámetros.')
  }
  const secret = env.OPS_CRON_SECRET ?? ''
  if (secret.length < 32 || /[\s]/.test(secret)) throw new Error('OPS_CRON_SECRET requiere al menos 32 caracteres sin espacios.')
  const hora = env.OPS_TIMER_CUTOFF_HOUR ?? ''
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('OPS_TIMER_CUTOFF_HOUR requiere HH:MM explícito.')
  const timeout = Number(env.OPS_CRON_REQUEST_TIMEOUT_MS || 240000)
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 300000) throw new Error('Timeout de cron inválido: debe estar entre 1000 y 300000 ms.')
  const frecuencia = env.OPS_CRON_POLL_SCHEDULE || '*/5 * * * *'
  const jornadas = env.OPS_CRON_LIVE_SCHEDULE || '*/15 * * * *'
  const papelera = env.OPS_CRON_TRASH_SCHEDULE || '0 3 * * *'
  // El resumen del día del equipo. Su hora vive acá y sólo acá: el backend calcula el día que le
  // pidan y no tiene opción de hora propia, así que no hay dos relojes que puedan separarse.
  // No se toca OPS_TIMER_CUTOFF_HOUR: ése es el corte de cronómetros, que es otra cosa.
  const resumen = env.OPS_CRON_RESUMEN_SCHEDULE || '0 20 * * *'
  if (![frecuencia, jornadas, papelera, resumen].every((expresion) => cron.validate(expresion))) throw new Error('OPS_CRON_*_SCHEDULE contiene una expresión cron inválida.')
  const [horas, minutos] = hora.split(':').map(Number)
  return { base: base.href.replace(/\/$/, '') + '/', secret, hora, timeout, frecuencia, jornadas, papelera, resumen, zona: 'America/Santiago', corte: `${minutos} ${horas} * * *` }
}

/** Escribe registros estructurados para PM2 sin incluir secretos ni cuerpos de respuestas. */
function registrar (registro) {
  process.stdout.write(JSON.stringify({ fecha: new Date().toISOString(), ...registro }) + '\n')
}

/**
 * Programa rutinas y corte diario; el backend resuelve idempotencia y recuperación de cortes.
 * Las dependencias opcionales permiten probar sin llamadas reales ni esperar el reloj.
 */
export function crearProgramador (config, { fetchImpl = fetch, cronImpl = cron, log = registrar } = {}) {
  const pendientes = new Map()
  const tareas = []
  let detenido = false

  /** Invoca exclusivamente el puente autenticado; rechaza redirecciones y errores HTTP/JSON. */
  async function pedir (ruta, metodo) {
    const respuesta = await fetchImpl(new URL(ruta, config.base), {
      method: metodo,
      redirect: 'error',
      headers: { 'X-Ops-Cron-Secret': config.secret, accept: 'application/json' },
      signal: AbortSignal.timeout(config.timeout)
    })
    if (!respuesta.ok) {
      const error = new Error('El backend cron rechazó la solicitud.')
      error.http = respuesta.status
      throw error
    }
    const datos = await respuesta.json()
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('Respuesta de cron inválida.')
    return datos
  }

  /** Comprueba autenticación y acuerdo de hora/zona antes de arrancar cualquier trabajo. */
  async function comprobar () {
    const estado = await pedir('estado', 'GET')
    if (estado.status !== 'ready' || estado.hora_corte !== config.hora || estado.zona !== config.zona) {
      throw new Error('El backend no está listo o su hora/zona de corte no coincide con Node.')
    }
    return estado
  }

  /** Ejecuta un trabajo con exclusión local y registra su resultado, incluso si falla la red. */
  async function ejecutar (trabajo) {
    if (!['rutinas', 'jornadas', 'papelera', 'cortar_cronometros', 'resumen_equipo'].includes(trabajo)) throw new Error('Trabajo desconocido.')
    if (detenido || pendientes.has(trabajo)) return { status: 'skipped', reason: 'local_overlap_or_stopped' }
    const inicio = Date.now()
    const promesa = (async () => {
      log({ trabajo, estado: 'iniciado' })
      try {
        const resultado = await pedir(trabajo, 'POST')
        if (!['completed', 'skipped'].includes(resultado.status)) throw new Error('El backend no confirmó la ejecución.')
        log({ trabajo, estado: resultado.status, duracion_ms: Date.now() - inicio })
        return resultado
      } catch (error) {
        // No se imprime el mensaje externo: puede contener datos o configuración del servidor.
        log({ trabajo, estado: 'fallido', tipo: error instanceof Error ? error.name : 'Error', http: error?.http ?? null, duracion_ms: Date.now() - inicio })
        return { status: 'failed' }
      } finally {
        pendientes.delete(trabajo)
      }
    })()
    pendientes.set(trabajo, promesa)
    return promesa
  }

  /** Recupera el corte antes de rutinas antiguas que también pueden detener cronómetros. */
  async function ejecutarConCorte (trabajo) {
    const corte = await (pendientes.get('cortar_cronometros') ?? ejecutar('cortar_cronometros'))
    if (corte.status === 'failed' || corte.reason === 'busy') {
      log({ trabajo, estado: 'pendiente', motivo: 'corte_no_confirmado' })
      return { status: 'skipped', reason: 'corte_no_confirmado' }
    }
    return ejecutar(trabajo)
  }

  /** Arranca los horarios una sola vez, tras comprobar la configuración remota. */
  async function iniciar () {
    if (tareas.length > 0 || detenido) throw new Error('El programador ya fue iniciado o detenido.')
    await comprobar()
    for (const [nombre, expresion, accion] of [
      ['rutinas-y-recuperacion', config.frecuencia, () => ejecutarConCorte('rutinas')],
      ['jornadas', config.jornadas, () => ejecutarConCorte('jornadas')],
      ['papelera', config.papelera, () => ejecutar('papelera')],
      // Sin recuperación al arranque, a diferencia de las tres de arriba: el resumen es de una hora
      // fija del día y dispararlo al reiniciar el proceso a las 03:00 escribiría el resumen de un día
      // a medio empezar y, con el interruptor encendido, mandaría el correo antes de tiempo.
      ['resumen-del-equipo', config.resumen, () => ejecutar('resumen_equipo')],
      ['corte-diario', config.corte, () => ejecutar('cortar_cronometros')]
    ]) {
      const tarea = cronImpl.schedule(expresion, accion, { name: nombre, timezone: config.zona, noOverlap: true })
      tarea.on('execution:missed', () => log({ trabajo: nombre, estado: 'horario_perdido' }))
      tarea.on('execution:failed', () => log({ trabajo: nombre, estado: 'fallido' }))
      tareas.push(tarea)
    }
    log({ estado: 'listo', zona: config.zona, hora_corte: config.hora })
    void Promise.all(['rutinas', 'jornadas', 'papelera'].map(ejecutarConCorte))
  }

  /** Detiene nuevos disparos y espera los trabajos en curso antes de terminar el proceso. */
  async function detener () {
    detenido = true
    await Promise.all(tareas.map((tarea) => tarea.stop()))
    await Promise.allSettled([...pendientes.values()])
    await Promise.all(tareas.map((tarea) => tarea.destroy()))
  }

  return { comprobar, iniciar, detener, ejecutar }
}

/** Entrada de PM2; --check valida ambos extremos sin disparar correos, cortes ni otras escrituras. */
async function main () {
  try {
    loadEnvFile('.env.cron')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const programador = crearProgramador(leerConfiguracion())
  if (process.argv.includes('--check')) {
    await programador.comprobar()
    registrar({ estado: 'configuracion_verificada' })
    return
  }
  for (const senal of ['SIGINT', 'SIGTERM']) {
    process.once(senal, () => { void programador.detener().then(() => process.exit(0), () => process.exit(1)) })
  }
  await programador.iniciar()
  if (process.send) process.send('ready')
}

const entrada = process.env.pm_exec_path || process.argv[1]
if (entrada && import.meta.url === pathToFileURL(entrada).href) {
  main().catch((error) => {
    registrar({ estado: 'inicio_fallido', tipo: error instanceof Error ? error.name : 'Error', http: error?.http ?? null,
      detalle: /^(OPS_|Timeout|El backend)/.test(error?.message ?? '') ? error.message : 'Revisa la configuración y la conectividad con el backend.' })
    process.exitCode = 1
  })
}
