import { createServer } from 'node:http'

import type { ConfiguracionInactiva } from './configuracion.ts'
import { registrar } from './registro.ts'
import { responderJson, rechazarUpgrade, type Servicio } from './servicio.ts'

/**
 * Modo inactivo del servicio de «Ops en vivo»: el servidor tiene el proceso pero no las variables.
 *
 * Existe para que publicar a `main` no rompa producción mientras falten `EN_VIVO_SECRETO` y
 * `EN_VIVO_BOLETO_SECRETO`: PM2 ve un proceso sano (avisa `ready`) en vez de un bucle de reinicios.
 * No hay bus, documentos ni board: solo `GET {prefijo}/salud` responde
 * `{ok:false, motivo:'sin_configurar'}`; las rutas internas contestan 503, los sockets se rechazan
 * con 503 y todo lo demás es 404. Como el navegador no se conecta si `NEXT_PUBLIC_EN_VIVO_URL` está
 * vacía, esto es solo el piso que impide fallas en cascada.
 */

/** Código con el que se rechaza todo lo que no sea la salud. */
const ESTADO_SIN_CONFIGURAR = 503

/**
 * Crea el servicio inactivo (sin empezar a escuchar).
 *
 * @param config dónde escuchar
 * @param faltantes nombres de las variables que faltan, solo para la línea de registro
 * @returns un `Servicio` sin conexiones ni documentos
 */
export function crearServicioInactivo (config: ConfiguracionInactiva, faltantes: string[]): Servicio {
  const base = `${config.prefijo}/`

  const servidor = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://interno')

    if (!pathname.startsWith(base)) return responderJson(res, 404, { error: 'no_encontrado' })

    const ruta = pathname.slice(base.length)

    if (req.method === 'GET' && ruta === 'salud') {
      return responderJson(res, ESTADO_SIN_CONFIGURAR, { ok: false, motivo: 'sin_configurar' })
    }

    if (ruta.startsWith('interno/')) return responderJson(res, ESTADO_SIN_CONFIGURAR, { error: 'sin_configurar' })

    responderJson(res, 404, { error: 'no_encontrado' })
  })

  servidor.on('upgrade', (_req, socket) => {
    rechazarUpgrade(socket, ESTADO_SIN_CONFIGURAR, 'Service Unavailable')
  })

  async function escuchar (): Promise<number> {
    await new Promise<void>((resolver, rechazar) => {
      servidor.once('error', rechazar)
      servidor.listen(config.puerto, config.host, () => {
        servidor.off('error', rechazar)
        resolver()
      })
    })

    registrar({ evento: 'inactivo', motivo: 'sin_configurar', faltan: faltantes.join(',') })

    const direccion = servidor.address()

    return typeof direccion === 'object' && direccion !== null ? direccion.port : config.puerto
  }

  async function cerrar (): Promise<void> {
    await new Promise<void>((resolver) => { servidor.close(() => { resolver() }); servidor.closeAllConnections() })
  }

  return { servidor, escuchar, cerrar, conexionesDelBus: () => 0, documentosCargados: () => 0 }
}
