import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'

import {
  CIERRES,
  MAXIMO_MENSAJES_POR_SEGUNDO,
  MAXIMO_SALAS_POR_CONEXION,
  leerMensajeDelCliente,
  type CodigoDeError,
  type EventoDeBoard,
  type MensajeDelCliente,
  type MensajeDelServidor
} from '../../src/dominio/en-vivo.ts'
import { verificarBoleto, type PayloadDeBoleto } from '../../src/lib/en-vivo/boleto.ts'
import type { ConfiguracionDelServicio } from './configuracion.ts'
import { salasDe, type Destino } from './enrutador.ts'
import { vigilarLatido } from './latido.ts'
import { registrar } from './registro.ts'

/**
 * El bus de avisos: sockets de navegadores suscritos a salas.
 *
 * El bus solo dice «cambió {tipo, id}»: no transporta contenido. Cada socket se identifica con un
 * boleto firmado (`hola`) y solo puede suscribirse a las salas que ese boleto nombra.
 */

/** Ventana de espera antes de difundir un cambio de presencia en un recurso. */
const ESPERA_DE_PRESENCIA_MS = 500

/** Un mismo usuario no repite «escribiendo» más seguido que esto. */
const ESPERA_ENTRE_ESCRIBIENDO_MS = 2000

const WS_ABIERTO = 1

export interface Conexion {
  ws: WebSocket
  sujeto: PayloadDeBoleto | null
  salas: Set<string>
  /** Salas de `recurso:*` donde esta conexión dijo estar «viendo». */
  viendo: Set<string>
  fichas: number
  ultimaRecargaMs: number
  ultimoEscribiendoMs: number
  esperaDeHola: ReturnType<typeof setTimeout> | null
}

export interface Bus {
  conectar: (ws: WebSocket, req: IncomingMessage) => void
  entregar: (evento: EventoDeBoard) => void
  salas: Map<string, Set<Conexion>>
  /** Conexiones abiertas ahora. */
  contar: () => number
  /** Cierra todas las conexiones con ese código (cierre ordenado del servicio). */
  cerrar: (codigo: number, motivo: string) => void
}

interface EstadoDeEstrangulacion {
  ultimoMs: number
  temporizador: ReturnType<typeof setTimeout> | null
}

/**
 * Crea el bus.
 *
 * @param config la configuración del servicio (secreto del boleto y límites)
 * @returns el bus: `conectar` para sockets nuevos y `entregar` para eventos que llegan del board
 */
export function crearBus (config: ConfiguracionDelServicio): Bus {
  const salas = new Map<string, Set<Conexion>>()
  const conexiones = new Set<Conexion>()
  const estrangulacion = new Map<string, EstadoDeEstrangulacion>()
  const presenciaPendiente = new Map<string, ReturnType<typeof setTimeout>>()

  function enviar (conexion: Conexion, mensaje: MensajeDelServidor): void {
    if (conexion.ws.readyState !== WS_ABIERTO) return

    try {
      conexion.ws.send(JSON.stringify(mensaje))
    } catch {
      registrar({ evento: 'bus_envio_fallido' })
    }
  }

  function fallar (conexion: Conexion, codigo: CodigoDeError, cierre?: number): void {
    enviar(conexion, { t: 'error', codigo })
    if (cierre !== undefined) conexion.ws.close(cierre, codigo)
  }

  function presentesDe (sala: string): number[] {
    const ids = new Set<number>()

    for (const conexion of salas.get(sala) ?? []) {
      if (conexion.viendo.has(sala) && conexion.sujeto?.suj === 'staff') ids.add(conexion.sujeto.id)
    }

    return [...ids].sort((a, b) => a - b)
  }

  function difundirPresentes (sala: string): void {
    const mensaje: MensajeDelServidor = { t: 'presentes', sala, staff: presentesDe(sala) }

    for (const conexion of salas.get(sala) ?? []) enviar(conexion, mensaje)
  }

  function programarPresentes (sala: string): void {
    if (presenciaPendiente.has(sala)) return

    const temporizador = setTimeout(() => {
      presenciaPendiente.delete(sala)
      difundirPresentes(sala)
    }, ESPERA_DE_PRESENCIA_MS)

    temporizador.unref()
    presenciaPendiente.set(sala, temporizador)
  }

  function suscribir (conexion: Conexion, sala: string): void {
    conexion.salas.add(sala)

    let miembros = salas.get(sala)

    if (miembros === undefined) {
      miembros = new Set()
      salas.set(sala, miembros)
    }

    miembros.add(conexion)
  }

  function desuscribir (conexion: Conexion, sala: string): void {
    const estabaViendo = conexion.viendo.delete(sala)
    const miembros = salas.get(sala)

    conexion.salas.delete(sala)
    miembros?.delete(conexion)
    if (miembros?.size === 0) salas.delete(sala)
    if (estabaViendo) programarPresentes(sala)
  }

  function quitar (conexion: Conexion): void {
    if (conexion.esperaDeHola !== null) clearTimeout(conexion.esperaDeHola)
    for (const sala of [...conexion.salas]) desuscribir(conexion, sala)
    conexiones.delete(conexion)
  }

  function admitirSalas (conexion: Conexion, nuevas: string[]): boolean {
    const faltan = nuevas.filter((sala) => !conexion.salas.has(sala))

    if (conexion.salas.size + faltan.length > MAXIMO_SALAS_POR_CONEXION) return false
    for (const sala of faltan) suscribir(conexion, sala)

    return true
  }

  function alHola (conexion: Conexion, mensaje: Extract<MensajeDelCliente, { t: 'hola' }>): void {
    if (conexion.sujeto !== null) return fallar(conexion, 'mensaje_invalido')

    const boleto = verificarBoleto(mensaje.boleto, config.secretoDeBoleto)

    if (boleto === null) return fallar(conexion, 'boleto_invalido', CIERRES.boleto)

    if (conexion.esperaDeHola !== null) clearTimeout(conexion.esperaDeHola)
    conexion.esperaDeHola = null
    conexion.sujeto = boleto

    if (!admitirSalas(conexion, boleto.salas)) return fallar(conexion, 'limite', CIERRES.limite)

    enviar(conexion, { t: 'listo', salas: [...conexion.salas] })
    for (const sala of conexion.salas) if (sala.startsWith('recurso:')) enviar(conexion, { t: 'presentes', sala, staff: presentesDe(sala) })
  }

  function alSuscribir (conexion: Conexion, mensaje: Extract<MensajeDelCliente, { t: 'suscribir' }>): void {
    const sujeto = conexion.sujeto
    const boleto = verificarBoleto(mensaje.boleto, config.secretoDeBoleto)

    // El boleto tiene que ser de la misma identidad que dijo `hola`: no se prestan boletos entre personas.
    if (sujeto === null || boleto === null || boleto.suj !== sujeto.suj || boleto.id !== sujeto.id) {
      return fallar(conexion, 'boleto_invalido', CIERRES.boleto)
    }

    if (!boleto.salas.includes(mensaje.sala)) return fallar(conexion, 'sala_no_permitida', CIERRES.sala)
    if (!admitirSalas(conexion, [mensaje.sala])) return fallar(conexion, 'limite')

    enviar(conexion, { t: 'listo', salas: [...conexion.salas] })
    if (mensaje.sala.startsWith('recurso:')) enviar(conexion, { t: 'presentes', sala: mensaje.sala, staff: presentesDe(mensaje.sala) })
  }

  function alPresentar (conexion: Conexion, mensaje: Extract<MensajeDelCliente, { t: 'presencia' }>): void {
    if (conexion.sujeto?.suj !== 'staff' || !conexion.salas.has(mensaje.sala)) {
      return fallar(conexion, 'sala_no_permitida')
    }

    const yaViendo = conexion.viendo.has(mensaje.sala)

    if (mensaje.estado === 'viendo') conexion.viendo.add(mensaje.sala)
    else conexion.viendo.delete(mensaje.sala)

    if (yaViendo !== (mensaje.estado === 'viendo')) programarPresentes(mensaje.sala)
  }

  function alEscribir (conexion: Conexion, mensaje: Extract<MensajeDelCliente, { t: 'escribiendo' }>, ahora: number): void {
    if (conexion.sujeto?.suj !== 'staff' || !conexion.salas.has(mensaje.sala)) {
      return fallar(conexion, 'sala_no_permitida')
    }
    if (ahora - conexion.ultimoEscribiendoMs < ESPERA_ENTRE_ESCRIBIENDO_MS) return

    conexion.ultimoEscribiendoMs = ahora

    for (const otra of salas.get(mensaje.sala) ?? []) {
      if (otra !== conexion) enviar(otra, { t: 'escribiendo', sala: mensaje.sala, staff: conexion.sujeto.id })
    }
  }

  /** Token bucket: `MAXIMO_MENSAJES_POR_SEGUNDO` fichas por segundo, con ráfaga del mismo tamaño. */
  function hayFicha (conexion: Conexion, ahora: number): boolean {
    const repuestas = (ahora - conexion.ultimaRecargaMs) * MAXIMO_MENSAJES_POR_SEGUNDO / 1000

    conexion.fichas = Math.min(MAXIMO_MENSAJES_POR_SEGUNDO, conexion.fichas + repuestas)
    conexion.ultimaRecargaMs = ahora
    if (conexion.fichas < 1) return false
    conexion.fichas -= 1

    return true
  }

  function alRecibir (conexion: Conexion, texto: string, esBinario: boolean): void {
    const ahora = Date.now()

    if (!hayFicha(conexion, ahora)) return fallar(conexion, 'limite', CIERRES.limite)

    const mensaje = esBinario ? null : leerMensajeDelCliente(texto)

    if (mensaje === null) return fallar(conexion, 'mensaje_invalido')
    if (conexion.sujeto === null && mensaje.t !== 'hola') return conexion.ws.close(CIERRES.sinHola, 'sin_hola')

    switch (mensaje.t) {
      case 'hola': return alHola(conexion, mensaje)
      case 'suscribir': return alSuscribir(conexion, mensaje)
      case 'desuscribir': return desuscribir(conexion, mensaje.sala)
      case 'presencia': return alPresentar(conexion, mensaje)
      case 'escribiendo': return alEscribir(conexion, mensaje, ahora)
    }
  }

  function conectar (ws: WebSocket, _req: IncomingMessage): void {
    const conexion: Conexion = {
      ws,
      sujeto: null,
      salas: new Set(),
      viendo: new Set(),
      fichas: MAXIMO_MENSAJES_POR_SEGUNDO,
      ultimaRecargaMs: Date.now(),
      ultimoEscribiendoMs: 0,
      esperaDeHola: null
    }

    if (conexiones.size >= config.maxConexiones) {
      ws.close(CIERRES.limite, 'limite')

      return
    }

    conexiones.add(conexion)
    conexion.esperaDeHola = setTimeout(() => { ws.close(CIERRES.sinHola, 'sin_hola') }, config.esperaDeHolaMs)
    ws.on('message', (datos, esBinario) => { alRecibir(conexion, datos.toString(), esBinario) })
    ws.on('close', () => { quitar(conexion) })
    ws.on('error', () => { registrar({ evento: 'socket_de_bus_con_error' }) })
    vigilarLatido(ws, config.latidoMs)
  }

  function difundir (destino: Destino, yaEnviados?: Map<Conexion, Set<string>>): void {
    const clave = JSON.stringify(destino.mensaje)

    for (const conexion of salas.get(destino.sala) ?? []) {
      const vistos = yaEnviados?.get(conexion) ?? new Set<string>()

      if (vistos.has(clave)) continue
      vistos.add(clave)
      yaEnviados?.set(conexion, vistos)
      enviar(conexion, destino.mensaje)
    }
  }

  /** Envía ya si pasó el intervalo; si no, deja un solo aviso pendiente para cuando se cumpla. */
  function difundirEstrangulado (destino: Destino, intervaloMs: number): void {
    const ahora = Date.now()
    const estado = estrangulacion.get(destino.sala) ?? { ultimoMs: 0, temporizador: null }

    estrangulacion.set(destino.sala, estado)

    if (ahora - estado.ultimoMs >= intervaloMs) {
      estado.ultimoMs = ahora
      difundir(destino)

      return
    }

    if (estado.temporizador !== null) return

    estado.temporizador = setTimeout(() => {
      estado.temporizador = null
      estado.ultimoMs = Date.now()
      difundir(destino)
    }, estado.ultimoMs + intervaloMs - ahora)
    estado.temporizador.unref()
  }

  function entregar (evento: EventoDeBoard): void {
    const yaEnviados = new Map<Conexion, Set<string>>()

    for (const destino of salasDe(evento)) {
      if (destino.estrangularMs === undefined) difundir(destino, yaEnviados)
      else difundirEstrangulado(destino, destino.estrangularMs)
    }
  }

  function cerrar (codigo: number, motivo: string): void {
    for (const temporizador of presenciaPendiente.values()) clearTimeout(temporizador)
    for (const estado of estrangulacion.values()) if (estado.temporizador !== null) clearTimeout(estado.temporizador)
    presenciaPendiente.clear()
    estrangulacion.clear()
    for (const conexion of [...conexiones]) conexion.ws.close(codigo, motivo)
  }

  return { conectar, entregar, salas, contar: () => conexiones.size, cerrar }
}
