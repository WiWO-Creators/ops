import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer } from 'ws'

import { AlmacenDeNonces } from '../../src/lib/en-vivo/firma.ts'
import { CIERRES } from '../../src/dominio/en-vivo.ts'
import { crearBus } from './bus.ts'
import { crearClienteBoard, type ClienteBoard } from './cliente-board.ts'
import type { ConfiguracionDelServicio } from './configuracion.ts'
import { crearHocuspocus } from './documentos.ts'
import { manejarInterno } from './interno.ts'
import { registrar } from './registro.ts'

/**
 * Arma el servicio completo: HTTP (salud e interno), WebSocket del bus y WebSocket de documentos.
 *
 * Vive aparte de `servidor.ts` (la entrada, que lee el entorno y atiende señales) para poder
 * levantarlo en una prueba con puerto 0 y un board falso.
 */

/** Tope de un mensaje del socket de documentos (un documento Yjs entero). */
const MAXIMO_BYTES_DOCUMENTO = 1_048_576

/** Tope de un mensaje del socket del bus. */
const MAXIMO_BYTES_BUS = 4096

/** Espera máxima, al cerrar, a que los documentos se guarden y se descarguen. */
const ESPERA_DE_CIERRE_MS = 10_000

export interface Servicio {
  servidor: Server
  /** Empieza a escuchar; devuelve el puerto real (útil con puerto 0). */
  escuchar: () => Promise<number>
  /** Cierre ordenado: guarda documentos pendientes, cierra sockets con 1012 y detiene el HTTP. */
  cerrar: () => Promise<void>
  conexionesDelBus: () => number
  documentosCargados: () => number
}

/**
 * Responde un JSON sin caché.
 *
 * @param res la respuesta
 * @param estado el código HTTP
 * @param cuerpo lo que se serializa
 */
export function responderJson (res: ServerResponse, estado: number, cuerpo: unknown): void {
  res.writeHead(estado, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(cuerpo))
}

/**
 * Niega la mejora a WebSocket con un código HTTP y cierra el socket.
 *
 * @param socket el socket crudo de la petición `upgrade`
 * @param estado el código HTTP
 * @param frase la frase del código
 */
export function rechazarUpgrade (socket: Duplex, estado: number, frase: string): void {
  socket.on('error', () => undefined)
  socket.write(`HTTP/1.1 ${estado} ${frase}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

async function esperarA (condicion: () => boolean, limiteMs: number): Promise<void> {
  const fin = Date.now() + limiteMs

  while (!condicion() && Date.now() < fin) await new Promise((resolver) => setTimeout(resolver, 50))
}

/**
 * Crea el servicio (sin empezar a escuchar).
 *
 * @param config la configuración validada
 * @param board el cliente del board; por defecto el real, firmado y con tiempo límite
 * @returns el servicio
 */
export function crearServicio (config: ConfiguracionDelServicio, board: ClienteBoard = crearClienteBoard(config)): Servicio {
  const bus = crearBus(config)
  const documentos = crearHocuspocus(config, board)
  const nonces = new AlmacenDeNonces()
  const socketsDeBus = new WebSocketServer({ noServer: true, maxPayload: MAXIMO_BYTES_BUS })
  const socketsDeDocumentos = new WebSocketServer({ noServer: true, maxPayload: MAXIMO_BYTES_DOCUMENTO })

  async function atender (req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { pathname } = new URL(req.url ?? '/', 'http://interno')
    const base = `${config.prefijo}/`

    if (!pathname.startsWith(base)) return responderJson(res, 404, { error: 'no_encontrado' })

    const ruta = pathname.slice(base.length)

    if (req.method === 'GET' && ruta === 'salud') {
      return responderJson(res, 200, { ok: true, conexiones_bus: bus.contar(), documentos: documentos.contar() })
    }

    if (ruta.startsWith('interno/')) {
      return await manejarInterno(req, res, ruta, { config, bus, documentos, nonces })
    }

    responderJson(res, 404, { error: 'no_encontrado' })
  }

  const servidor = createServer((req, res) => {
    atender(req, res).catch(() => {
      registrar({ evento: 'http_fallido' })
      if (!res.headersSent) responderJson(res, 500, { error: 'error_interno' })
      else res.end()
    })
  })

  servidor.on('upgrade', (req, socket, cabeza) => {
    const { pathname } = new URL(req.url ?? '/', 'http://interno')
    const origen = req.headers.origin

    // Los navegadores siempre mandan `Origin` al abrir un socket: sin él o de otro sitio, no entra.
    if (origen === undefined || !config.origenes.includes(origen)) return rechazarUpgrade(socket, 403, 'Forbidden')

    if (pathname === `${config.prefijo}/doc`) {
      socketsDeDocumentos.handleUpgrade(req, socket, cabeza, (ws) => {
        // `clients` ya incluye este socket: pasarse del tope es tener más de los permitidos.
        if (socketsDeDocumentos.clients.size > config.maxConexionesDeDocumento) {
          ws.close(CIERRES.limite, 'limite')

          return
        }

        documentos.conectar(ws, req)
      })
    } else if (pathname === `${config.prefijo}/bus`) {
      socketsDeBus.handleUpgrade(req, socket, cabeza, (ws) => { bus.conectar(ws, req) })
    } else {
      rechazarUpgrade(socket, 404, 'Not Found')
    }
  })

  async function escuchar (): Promise<number> {
    await new Promise<void>((resolver, rechazar) => {
      servidor.once('error', rechazar)
      servidor.listen(config.puerto, config.host, () => {
        servidor.off('error', rechazar)
        resolver()
      })
    })

    const direccion = servidor.address()

    return typeof direccion === 'object' && direccion !== null ? direccion.port : config.puerto
  }

  async function cerrar (): Promise<void> {
    documentos.vaciar()
    bus.cerrar(CIERRES.reinicio, 'reinicio')
    for (const ws of socketsDeDocumentos.clients) ws.close(CIERRES.reinicio, 'reinicio')

    await esperarA(() => documentos.contar() === 0, ESPERA_DE_CIERRE_MS)
    await new Promise<void>((resolver) => { servidor.close(() => { resolver() }); servidor.closeAllConnections() })
    socketsDeBus.close()
    socketsDeDocumentos.close()
  }

  return {
    servidor,
    escuchar,
    cerrar,
    conexionesDelBus: () => bus.contar(),
    documentosCargados: () => documentos.contar()
  }
}
