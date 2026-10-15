import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { leerConfiguracion } from './configuracion.ts'
import { registrar } from './registro.ts'
import { crearServicio } from './servicio.ts'

/**
 * Entrada del servicio de «Ops en vivo» (`pnpm en-vivo`, o PM2 con `ecosystem.config.cjs`).
 *
 * Lee el `.env` de ops-v2 si existe (las variables ya presentes en el entorno mandan sobre el
 * archivo), valida la configuración y se queda escuchando. Avisa a PM2 con `ready` cuando ya
 * acepta conexiones, y ante SIGINT/SIGTERM guarda los documentos pendientes antes de salir.
 */

async function iniciar (): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env')

  const config = leerConfiguracion()
  const servicio = crearServicio(config)
  const puerto = await servicio.escuchar()
  let cerrando = false

  async function apagar (senal: string): Promise<void> {
    if (cerrando) return
    cerrando = true
    registrar({ evento: 'apagando', senal })
    await servicio.cerrar()
    process.exit(0)
  }

  process.on('SIGINT', () => { void apagar('SIGINT') })
  process.on('SIGTERM', () => { void apagar('SIGTERM') })

  registrar({ evento: 'listo', puerto, prefijo: config.prefijo })
  process.send?.('ready')
}

iniciar().catch((error: unknown) => {
  // El mensaje de la configuración nombra la variable pero nunca su valor.
  registrar({ evento: 'inicio_fallido', motivo: error instanceof Error ? error.message : 'desconocido' })
  process.exit(1)
})
