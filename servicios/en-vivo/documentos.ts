import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import {
  Hocuspocus,
  type Document,
  type onAuthenticatePayload,
  type onChangePayload,
  type onLoadDocumentPayload,
  type onStoreDocumentPayload
} from '@hocuspocus/server'
import type { WebSocket } from 'ws'

import { CIERRES } from '../../src/dominio/en-vivo.ts'
import { verificarBoleto } from '../../src/lib/en-vivo/boleto.ts'
import { adaptadorDe } from './adaptadores/indice.ts'
import { ErrorDeAdaptador, type DocumentoReconocido, type EstadoDeDocumento } from './adaptadores/tipos.ts'
import type { ClienteBoard } from './cliente-board.ts'
import type { ConfiguracionDelServicio } from './configuracion.ts'
import { aBytes, vigilarLatido } from './latido.ts'
import { registrar } from './registro.ts'

/**
 * Documentos colaborativos: Hocuspocus con persistencia contra el board.
 *
 * El servicio no guarda nada en disco: al abrir un documento lo pide al board, y al guardar
 * (con debounce) le devuelve el HTML. Quién puede abrirlo lo decide el boleto, firmado por el BFF
 * después de comprobar el permiso de la persona en el board.
 */

/** Lo que `onAuthenticate` deja en el contexto de la conexión. */
export interface ContextoDeDocumento {
  staffId: number
  espacioId: number | null
  /** `false` si el boleto dice que la persona puede leer pero no editar: su conexión es de solo lectura. */
  escritura: boolean
}

/** Reintentos de un guardado que falló por un motivo transitorio, antes de soltar el documento. */
const MAXIMO_DE_REINTENTOS = 5
const ESPERA_BASE_DE_REINTENTO_MS = 2000
const ESPERA_MAXIMA_DE_REINTENTO_MS = 30_000

/** Tiempo que Hocuspocus espera señal de un socket antes de darlo por muerto (el pong cuenta). */
const TIEMPO_SIN_SENAL_MS = 90_000

/** Un documento abierto por alguien, con lo que el servicio recuerda de él. */
export interface DocumentoAbierto {
  documento: Document
  estado: EstadoDeDocumento
}

export interface ServicioDeDocumentos {
  hocuspocus: Hocuspocus<ContextoDeDocumento>
  /** Adapta un socket de `ws` a Hocuspocus. */
  conectar: (ws: WebSocket, req: IncomingMessage) => void
  /** `true` si el documento está cargado en memoria. */
  estaCargado: (nombre: string) => boolean
  /** El documento y su estado si está cargado y tiene al menos una conexión; si no, `null`. */
  abierto: (nombre: string) => DocumentoAbierto | null
  /** Guarda ya, sin esperar el debounce; resuelve cuando el guardado terminó (o falló y quedó agendado). */
  guardarYa: (documento: Document) => Promise<void>
  /** Documentos cargados ahora. */
  contar: () => number
  /** Si el board cambió el documento por fuera, lo recarga para los conectados. */
  sincronizar: (nombre: string) => Promise<void>
  /** Guarda lo pendiente de todos los documentos (cierre ordenado). */
  vaciar: () => void
}

function cabecerasDeLaPeticion (crudas: IncomingHttpHeaders): Headers {
  const cabeceras = new Headers()

  for (const [nombre, valor] of Object.entries(crudas)) {
    if (valor === undefined) continue
    cabeceras.set(nombre, Array.isArray(valor) ? valor.join(', ') : valor)
  }

  return cabeceras
}

function reconocer (nombre: string, board: ClienteBoard): DocumentoReconocido {
  try {
    return adaptadorDe(nombre, board)
  } catch {
    throw new Error('documento_desconocido')
  }
}

/**
 * Crea la instancia de Hocuspocus y el adaptador de sockets.
 *
 * @param config la configuración del servicio
 * @param board el cliente firmado del board
 * @returns el servicio de documentos
 */
export function crearHocuspocus (config: ConfiguracionDelServicio, board: ClienteBoard): ServicioDeDocumentos {
  const estados = new Map<string, EstadoDeDocumento>()
  /** Las peticiones (una por socket) cuyo boleto ya se verificó. */
  const autenticadas = new WeakSet<Request>()

  function exigirBoleto (token: string, nombre: string, estado: EstadoDeDocumento | undefined): ContextoDeDocumento {
    const boleto = verificarBoleto(token, config.secretoDeBoleto)

    if (boleto === null || boleto.suj !== 'staff' || boleto.doc !== nombre) throw new Error('boleto_invalido')
    // El documento ya abierto sabe de qué Espacio es: un boleto de otro Espacio no entra.
    if (estado !== undefined && boleto.esp !== estado.espacioId) throw new Error('boleto_invalido')

    return { staffId: boleto.id, espacioId: boleto.esp, escritura: boleto.esc }
  }

  /**
   * Autentica una conexión con su boleto y fija si puede escribir.
   *
   * Sin `escritura` en el boleto, o si el board ya negó guardar como esa persona en este documento
   * (`vetados`), la conexión queda en solo lectura: Hocuspocus descarta sus actualizaciones del
   * documento (los cursores y la presencia siguen funcionando).
   *
   * @throws Error `documento_desconocido` o `boleto_invalido` si el nombre o el boleto no valen
   */
  async function onAuthenticate ({ token, documentName, connectionConfig, request }: onAuthenticatePayload): Promise<ContextoDeDocumento> {
    reconocer(documentName, board)

    const estado = estados.get(documentName)
    const contexto = exigirBoleto(token, documentName, estado)

    autenticadas.add(request)
    if (!contexto.escritura || estado?.vetados.has(contexto.staffId) === true) connectionConfig.readOnly = true

    return contexto
  }

  async function onLoadDocument ({ documentName, context }: onLoadDocumentPayload<ContextoDeDocumento>) {
    const { adaptador, id } = reconocer(documentName, board)
    const { ydoc, estado } = await adaptador.cargar(id)

    if (context.espacioId !== estado.espacioId) throw new ErrorDeAdaptador('espacio_distinto')

    estados.set(documentName, estado)
    registrar({ evento: 'documento_cargado', documento: documentName })

    return ydoc
  }

  async function onChange ({ documentName, context }: onChangePayload<ContextoDeDocumento>): Promise<void> {
    const estado = estados.get(documentName)
    const staffId = (context as Partial<ContextoDeDocumento> | undefined)?.staffId

    if (estado === undefined || typeof staffId !== 'number') return
    // Defensa en profundidad: una conexión de solo lectura no debería llegar aquí, pero nunca figura como autora.
    if ((context as Partial<ContextoDeDocumento>).escritura === false || estado.vetados.has(staffId)) return

    estado.autores.add(staffId)
    estado.ultimoEditor = staffId
  }

  function cancelarReintento (estado: EstadoDeDocumento): void {
    if (estado.temporizadorDeReintento === null) return

    clearTimeout(estado.temporizadorDeReintento)
    estado.temporizadorDeReintento = null
  }

  /**
   * Agenda otro intento de guardado con espera exponencial.
   *
   * @returns `false` si ya se agotaron los reintentos: el documento se suelta y los cambios se pierden
   */
  function programarReintento (documento: Document, estado: EstadoDeDocumento, carga: onStoreDocumentPayload<ContextoDeDocumento>): boolean {
    if (estado.temporizadorDeReintento !== null) return true

    if (estado.reintentos >= MAXIMO_DE_REINTENTOS) {
      registrar({ evento: 'guardado_abandonado', documento: documento.name })

      return false
    }

    const espera = Math.min(ESPERA_BASE_DE_REINTENTO_MS * 2 ** estado.reintentos, ESPERA_MAXIMA_DE_REINTENTO_MS)

    estado.reintentos += 1
    estado.temporizadorDeReintento = setTimeout(() => {
      estado.temporizadorDeReintento = null
      if (!documento.isDestroyed) void hocuspocus.storeDocumentHooks(documento, carga, true)
    }, espera)

    return true
  }

  async function onStoreDocument (carga: onStoreDocumentPayload<ContextoDeDocumento>): Promise<void> {
    const { document: documento, documentName: nombre } = carga
    const estado = estados.get(nombre)

    if (estado === undefined) return

    const { adaptador } = reconocer(nombre, board)
    let resultado: Awaited<ReturnType<typeof adaptador.guardar>>

    try {
      resultado = await adaptador.guardar(documento, estado)
    } catch (error) {
      registrar({ evento: 'guardado_fallido', documento: nombre, error: error instanceof Error ? error.name : 'desconocido' })
      resultado = 'reintentar'
    }

    if (resultado === 'reintentar') {
      estado.pendiente = true

      // Lanzar deja el documento en memoria (Hocuspocus no lo descarga si el guardado falla).
      if (programarReintento(documento, estado, carga)) throw new Error('guardado_pendiente')

      // Reintentos agotados: se suelta el documento, pero antes se avisa a quienes lo tienen abierto.
      estado.pendiente = false
      soltarSinGuardar(documento, estado)

      return
    }

    cancelarReintento(estado)
    estado.pendiente = false
    // Cualquier desenlace distinto de «reintentar» (guardado, sin cambios, recarga...) cierra la racha de fallos.
    estado.reintentos = 0

    if (resultado === 'guardado') {
      documento.broadcastStateless(JSON.stringify({ t: 'guardado', revision: estado.revision }))
    } else if (resultado === 'sin_acceso') {
      documento.broadcastStateless(JSON.stringify({ t: 'sin_acceso' }))
      hocuspocus.closeConnections(nombre)
    } else if (resultado === 'rechazado') {
      soltarSinGuardar(documento, estado)
    }
  }

  /**
   * Avisa que lo escrito no llegó al board y cierra el documento para todos.
   *
   * Cada cliente pasa al editor de siempre con el texto que tiene delante; seguir en la edición
   * conjunta sería escribir sobre un documento que el board no acepta.
   */
  function soltarSinGuardar (documento: Document, estado: EstadoDeDocumento): void {
    estado.reintentos = 0
    documento.broadcastStateless(JSON.stringify({ t: 'no_guardado' }))
    hocuspocus.closeConnections(documento.name)
  }

  async function beforeUnloadDocument ({ documentName }: { documentName: string }): Promise<void> {
    // Vetar la descarga mientras haya cambios que el board todavía no tiene.
    if (estados.get(documentName)?.pendiente === true) throw new Error('cambios_sin_guardar')
  }

  async function afterUnloadDocument ({ documentName }: { documentName: string }): Promise<void> {
    const estado = estados.get(documentName)

    if (estado?.temporizadorDeReintento != null) clearTimeout(estado.temporizadorDeReintento)
    estados.delete(documentName)
    registrar({ evento: 'documento_descargado', documento: documentName })
  }

  const hocuspocus = new Hocuspocus<ContextoDeDocumento>({
    name: 'ops-en-vivo',
    debounce: config.debounceMs,
    maxDebounce: config.maxDebounceMs,
    timeout: TIEMPO_SIN_SENAL_MS,
    unloadImmediately: true,
    quiet: true,
    onAuthenticate,
    onLoadDocument,
    onChange,
    onStoreDocument,
    beforeUnloadDocument,
    afterUnloadDocument
  })

  /**
   * Adapta un socket a Hocuspocus.
   *
   * Un socket que no se autentica en `esperaDeHolaMs` se cierra con 4408, y sus pongs no cuentan como
   * actividad hasta que se autentica: un cliente anónimo no puede tener la conexión abierta a cambio de nada.
   */
  function conectar (ws: WebSocket, req: IncomingMessage): void {
    const peticion = new Request(`http://interno${req.url ?? '/'}`, { headers: cabecerasDeLaPeticion(req.headers) })
    const conexion = hocuspocus.handleConnection(ws, peticion)
    const esperaDeAutenticacion = setTimeout(() => {
      if (!autenticadas.has(peticion)) ws.close(CIERRES.sinHola, 'sin_hola')
    }, config.esperaDeHolaMs)

    ws.on('message', (datos) => { conexion.handleMessage(aBytes(datos)) })
    ws.on('close', (codigo, motivo) => {
      clearTimeout(esperaDeAutenticacion)
      conexion.handleClose({ code: codigo, reason: motivo.toString() })
    })
    ws.on('error', () => { registrar({ evento: 'socket_de_documento_con_error' }) })
    vigilarLatido(ws, config.latidoMs, () => { if (autenticadas.has(peticion)) conexion.touch() })
  }

  async function sincronizar (nombre: string): Promise<void> {
    const documento = hocuspocus.documents.get(nombre)
    const estado = estados.get(nombre)

    if (documento === undefined || estado === undefined || documento.getConnectionsCount() === 0) return

    const { adaptador } = reconocer(nombre, board)

    // Dentro del mismo candado que el guardado: así no se compara con una revisión a medio actualizar.
    const resultado = await documento.saveMutex.runExclusive(async () => await adaptador.sincronizar(documento, estado))

    if (resultado === 'recargado') estado.reintentos = 0

    if (resultado === 'sin_acceso') {
      documento.broadcastStateless(JSON.stringify({ t: 'sin_acceso' }))
      hocuspocus.closeConnections(nombre)
    }
  }

  function abierto (nombre: string): DocumentoAbierto | null {
    const documento = hocuspocus.documents.get(nombre)
    const estado = estados.get(nombre)

    if (documento === undefined || estado === undefined || documento.getConnectionsCount() === 0) return null

    return { documento, estado }
  }

  async function guardarYa (documento: Document): Promise<void> {
    await hocuspocus.storeDocumentHooks(documento, {
      instance: hocuspocus,
      clientsCount: documento.getConnectionsCount(),
      document: documento,
      lastContext: {},
      lastTransactionOrigin: 'orbe',
      documentName: documento.name
    } as onStoreDocumentPayload<ContextoDeDocumento>, true)
  }

  return {
    hocuspocus,
    conectar,
    abierto,
    guardarYa,
    estaCargado: (nombre) => hocuspocus.documents.has(nombre),
    contar: () => hocuspocus.getDocumentsCount(),
    sincronizar,
    vaciar: () => { hocuspocus.flushPendingStores() }
  }
}
