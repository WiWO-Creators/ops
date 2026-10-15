import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { leerConfiguracion, leerConfiguracionInactiva, secretosFaltantes } from './configuracion.ts'
import { crearServicioInactivo } from './inactivo.ts'
import { registrar } from './registro.ts'
import { crearServicio, type Servicio } from './servicio.ts'

/**
 * Entrada del servicio de «Ops en vivo» (`pnpm en-vivo`, o PM2 con `ecosystem.config.cjs`).
 *
 * Lee el `.env` de ops-v2 si existe (las variables ya presentes en el entorno mandan sobre el
 * archivo), valida la configuración y se queda escuchando. Avisa a PM2 con `ready` cuando ya
 * acepta conexiones, y ante SIGINT/SIGTERM guarda los documentos pendientes antes de salir.
 *
 * Si faltan los secretos arranca en modo inactivo (solo `/salud`, ver `inactivo.ts`) en vez de
 * salir con error: así un deploy sin las variables del servidor no deja a PM2 reiniciando en bucle.
 */

/**
 * Elige el servicio según el entorno.
 *
 * @returns el servicio activo y su prefijo, o el inactivo si faltan secretos
 * @throws Error si la configuración presente es inválida (el mensaje no incluye valores)
 */
function elegirServicio (): { servicio: Servicio, prefijo: string } {
  const faltantes = secretosFaltantes()

  if (faltantes.length > 0) {
    const config = leerConfiguracionInactiva()

    return { servicio: crearServicioInactivo(config, faltantes), prefijo: config.prefijo }
  }

  const config = leerConfiguracion()

  return { servicio: crearServicio(config), prefijo: config.prefijo }
}

async function iniciar (): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env')

  const { servicio, prefijo } = elegirServicio()
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

  registrar({ evento: 'listo', puerto, prefijo })
  process.send?.('ready')
}

iniciar().catch((error: unknown) => {
  // El mensaje de la configuración nombra la variable pero nunca su valor.
  registrar({ evento: 'inicio_fallido', motivo: error instanceof Error ? error.message : 'desconocido' })
  process.exit(1)
})
