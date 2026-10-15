import type { RawData, WebSocket } from 'ws'

/** Ciclos de ping sin pong tras los cuales se corta el socket. */
const CICLOS_SIN_PONG = 2

/**
 * Mantiene vivo (o descarta) un socket con `ping`/`pong`.
 *
 * Cada `intervaloMs` manda un ping; si pasan dos ciclos sin recibir un pong, el socket se corta con
 * `terminate()`. El temporizador se detiene solo cuando el socket se cierra.
 *
 * @param ws el socket
 * @param intervaloMs cada cuánto se hace ping
 * @param alPong función opcional que se llama en cada pong (p. ej. `touch()` de Hocuspocus)
 */
export function vigilarLatido (ws: WebSocket, intervaloMs: number, alPong?: () => void): void {
  let sinPong = 0

  ws.on('pong', () => {
    sinPong = 0
    alPong?.()
  })

  const temporizador = setInterval(() => {
    if (sinPong >= CICLOS_SIN_PONG) {
      ws.terminate()

      return
    }

    sinPong += 1
    ws.ping()
  }, intervaloMs)

  temporizador.unref()
  ws.on('close', () => { clearInterval(temporizador) })
}

/**
 * Junta un mensaje binario de `ws` en un solo `Uint8Array`.
 *
 * @param datos lo que entregó el evento `message`
 * @returns los bytes del mensaje
 */
export function aBytes (datos: RawData): Uint8Array {
  if (Array.isArray(datos)) return new Uint8Array(Buffer.concat(datos))
  if (datos instanceof ArrayBuffer) return new Uint8Array(datos)

  return new Uint8Array(datos)
}
