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
  }]
}
