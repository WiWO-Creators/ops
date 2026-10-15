/** Proceso único de automatizaciones, separado del ciclo de vida de Next.js. */
module.exports = {
  apps: [{
    name: 'ops-cron',
    cwd: __dirname,
    script: 'scripts/cron.mjs',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    min_uptime: 0,
    wait_ready: true,
    listen_timeout: Number(process.env.OPS_CRON_REQUEST_TIMEOUT_MS || 240000) + 10000,
    kill_timeout: Number(process.env.OPS_CRON_REQUEST_TIMEOUT_MS || 240000) + 10000,
    exp_backoff_restart_delay: 1000,
    time: true
  }, {
    // Una sola instancia: el bus y los documentos abiertos viven en memoria. Node nativo ejecuta el
    // TypeScript (>= 22.18); no hay paso de compilación. `interpreter` explícito: PM2 asocia `.ts`
    // a `ts-node`, que aquí no existe.
    name: 'ops-en-vivo',
    cwd: __dirname,
    script: 'servicios/en-vivo/servidor.ts',
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    wait_ready: true,
    listen_timeout: 15000,
    kill_timeout: 15000,
    exp_backoff_restart_delay: 1000,
    time: true
  }]
}
