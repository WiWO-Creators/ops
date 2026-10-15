import { leerMensajeDelServidor, type MensajeDelServidor, type TipoDeCambio } from '../dominio/en-vivo.ts'

/**
 * Cliente del bus de «Ops en vivo» para el navegador.
 *
 * Mantiene **un** socket por pestaña. Solo recibe «cambió {tipo, id}»: quien escucha vuelve a pedir
 * el dato a la API con su propio permiso. Si el socket cae, todo sigue funcionando por sondeo (este
 * módulo no es requisito de nada): reconecta solo, con espera exponencial.
 *
 * Los oyentes y las salas viven fuera de la conexión: un componente puede registrarse antes de que
 * el puente conecte, y sobreviven a cada reconexión. Imports relativos con extensión `.ts` para que
 * Node pueda ejecutar las pruebas sin compilar.
 */

/** Un cambio avisado por el bus. */
export interface CambioEnVivo {
  tipo: TipoDeCambio
  id: number | null
  espacio_id: number | null
}

/** Un aviso de presencia en un recurso: quiénes lo miran, o quién acaba de escribir. */
export type AvisoDePresencia = Extract<MensajeDelServidor, { t: 'presentes' | 'escribiendo' }>

/** Pide un boleto; `null` si no se pudo (se reintenta con espera). */
export type PedirBoleto = () => Promise<string | null>

export interface OpcionesDeConexion {
  /** Base pública del servicio (`wss://ops.wiwo.me/en-vivo`); el bus vive en `{url}/bus`. */
  url: string
  /** Boleto con las salas por defecto (la propia y la del equipo). */
  pedirBoleto: PedirBoleto
}

/** Lo mínimo de un `WebSocket` que usa el cliente; permite probarlo con `ws` en Node. */
export interface SocketMinimo {
  onopen: ((evento: unknown) => void) | null
  onmessage: ((evento: { data: unknown }) => void) | null
  onclose: ((evento: { code: number }) => void) | null
  onerror: ((evento: unknown) => void) | null
  send: (dato: string) => void
  close: (codigo?: number) => void
}

export interface DependenciasDelCliente {
  crearSocket: (url: string) => SocketMinimo
  programar: (accion: () => void, ms: number) => unknown
  cancelar: (id: unknown) => void
  aleatorio: () => number
}

/** Primera espera de reconexión y tope de la espera exponencial. */
export const ESPERA_INICIAL_MS = 1000
export const ESPERA_MAXIMA_MS = 30_000

/** Cuánto varía la espera, a cada lado, para que las pestañas no reconecten todas a la vez. */
const VARIACION = 0.2

/** Cierre del servidor que pide un boleto nuevo. */
const CIERRE_BOLETO = 4401

/** Código con el que el navegador cierra por su cuenta. */
const CIERRE_NORMAL = 1000

/** La misma lista vacía para toda sala sin presentes: un valor estable para `useSyncExternalStore`. */
const SIN_PRESENTES: number[] = []

/**
 * Cuánto esperar antes del próximo intento de conexión.
 *
 * @param intentos intentos fallidos seguidos (0 = el primero)
 * @param azar número en [0, 1)
 * @returns milisegundos: 1 s, 2 s, 4 s… hasta 30 s, con ±20 % de variación
 */
export function esperaDeReconexion (intentos: number, azar: number): number {
  const base = Math.min(ESPERA_MAXIMA_MS, ESPERA_INICIAL_MS * 2 ** Math.max(0, intentos))

  return Math.round(base * (1 + (azar * 2 - 1) * VARIACION))
}

/** El cliente del bus; ver {@link crearClienteEnVivo}. */
export interface ClienteEnVivo {
  /** Empieza a conectar; devuelve la función que corta y deja de reintentar. */
  conectar: (opciones: OpcionesDeConexion) => () => void
  /** Suma una sala al socket; devuelve la función que la suelta. Varias altas de una sala cuentan como una. */
  suscribirSala: (sala: string, pedirBoletoDeSala: PedirBoleto) => () => void
  escuchar: (oyente: (cambio: CambioEnVivo) => void) => () => void
  escucharEstado: (oyente: (conectado: boolean) => void) => () => void
  estaConectado: () => boolean
  /**
   * Dice al servicio que esta pestaña está «viendo» la sala (`recurso:*`); devuelve la función que
   * dice «fuera». Varias altas de una sala cuentan como una. Se repite sola tras cada reconexión.
   */
  anunciarPresencia: (sala: string) => () => void
  /** Avisa a la sala que se está escribiendo. Se ignora si el socket no está listo o no está en la sala. */
  avisarEscribiendo: (sala: string) => void
  /** Se entera de quiénes miran y quién escribe en las salas `recurso:*` suscritas. */
  escucharPresencia: (oyente: (aviso: AvisoDePresencia) => void) => () => void
  /**
   * Los últimos presentes que el servicio difundió para la sala (vacío si no hay o se cayó el socket).
   * Es la misma lista mientras no llegue otra: sirve de instantánea para `useSyncExternalStore`.
   */
  presentesDe: (sala: string) => number[]
}

interface SalaPedida {
  pedirBoleto: PedirBoleto
  cuenta: number
}

/**
 * Crea un cliente del bus. El del navegador es el singleton de este módulo; las pruebas crean el suyo.
 *
 * @param dependencias socket, temporizadores y azar inyectables
 * @returns el cliente, sin conexión hasta llamar a `conectar`
 */
export function crearClienteEnVivo (dependencias: DependenciasDelCliente): ClienteEnVivo {
  const oyentes = new Set<(cambio: CambioEnVivo) => void>()
  const oyentesDeEstado = new Set<(conectado: boolean) => void>()
  const oyentesDePresencia = new Set<(aviso: AvisoDePresencia) => void>()
  const salasPedidas = new Map<string, SalaPedida>()
  /** Salas donde esta pestaña quiere figurar «viendo», con cuántos componentes lo piden. */
  const presenciaDeseada = new Map<string, number>()
  /** Salas ya anunciadas por el socket actual (la presencia vive en la conexión, no en la pestaña). */
  const anunciadas = new Set<string>()
  /** Salas que el servicio confirmó en el socket actual. */
  let salasListas = new Set<string>()
  const presentes = new Map<string, number[]>()
  let opciones: OpcionesDeConexion | null = null
  let socket: SocketMinimo | null = null
  let conectado = false
  let intentos = 0
  let temporizador: unknown = null
  let generacion = 0

  function fijarEstado (nuevo: boolean): void {
    if (conectado === nuevo) return
    conectado = nuevo
    for (const oyente of [...oyentesDeEstado]) oyente(nuevo)
  }

  function programarReconexion (): void {
    if (opciones === null || temporizador !== null) return

    const espera = esperaDeReconexion(intentos, dependencias.aleatorio())

    intentos += 1
    temporizador = dependencias.programar(() => {
      temporizador = null
      void abrir()
    }, espera)
  }

  /** Pide el boleto de una sala y manda la suscripción por el socket de esa generación. */
  async function suscribir (sala: string, pedida: SalaPedida, vigente: number): Promise<void> {
    let boleto: string | null = null

    try {
      boleto = await pedida.pedirBoleto()
    } catch {
      return
    }

    if (boleto === null || vigente !== generacion || socket === null || !salasPedidas.has(sala)) return
    socket.send(JSON.stringify({ t: 'suscribir', sala, boleto }))
  }

  /** Manda un mensaje por el socket actual; no hace nada si no hay uno listo. */
  function enviar (mensaje: object): void {
    if (socket === null || !conectado) return

    try {
      socket.send(JSON.stringify(mensaje))
    } catch {
      // El socket se cerró entre medio: la reconexión se encarga.
    }
  }

  /** Anuncia «viendo» en las salas deseadas que el servicio ya confirmó y aún no se anunciaron. */
  function anunciarPendientes (): void {
    for (const sala of presenciaDeseada.keys()) {
      if (!salasListas.has(sala) || anunciadas.has(sala)) continue

      anunciadas.add(sala)
      enviar({ t: 'presencia', sala, estado: 'viendo' })
    }
  }

  function notificarPresencia (aviso: AvisoDePresencia): void {
    for (const oyente of [...oyentesDePresencia]) oyente(aviso)
  }

  /** La conexión terminó: lo que se sabía de quién mira ya no vale. */
  function olvidarPresencia (): void {
    const salas = [...presentes.keys()]

    anunciadas.clear()
    salasListas = new Set()
    presentes.clear()
    for (const sala of salas) notificarPresencia({ t: 'presentes', sala, staff: [] })
  }

  function alRecibir (texto: unknown, vigente: number): void {
    const mensaje = leerMensajeDelServidor(texto)

    if (mensaje === null) return

    if (mensaje.t === 'listo') {
      salasListas = new Set(mensaje.salas)

      if (!conectado) {
        intentos = 0
        fijarEstado(true)
        for (const [sala, pedida] of salasPedidas) void suscribir(sala, pedida, vigente)
      }

      anunciarPendientes()

      return
    }

    if (mensaje.t === 'cambio') {
      const cambio: CambioEnVivo = { tipo: mensaje.tipo, id: mensaje.id, espacio_id: mensaje.espacio_id }

      for (const oyente of [...oyentes]) oyente(cambio)

      return
    }

    if (mensaje.t === 'presentes') presentes.set(mensaje.sala, mensaje.staff)
    if (mensaje.t === 'presentes' || mensaje.t === 'escribiendo') notificarPresencia(mensaje)
  }

  function alCerrar (codigo: number): void {
    socket = null
    fijarEstado(false)
    olvidarPresencia()

    // 4401: el boleto venció o no valió; el siguiente intento pide uno nuevo, sin esperar de más.
    if (codigo === CIERRE_BOLETO) intentos = 0
    programarReconexion()
  }

  async function abrir (): Promise<void> {
    if (opciones === null || socket !== null) return

    const mias = opciones
    const vigente = generacion
    let boleto: string | null = null

    try {
      boleto = await mias.pedirBoleto()
    } catch {
      boleto = null
    }

    if (vigente !== generacion || opciones === null || socket !== null) return
    if (boleto === null) return programarReconexion()

    let nuevo: SocketMinimo

    try {
      nuevo = dependencias.crearSocket(`${mias.url}/bus`)
    } catch {
      return programarReconexion()
    }

    const hola = JSON.stringify({ t: 'hola', boleto })

    socket = nuevo
    nuevo.onopen = () => { nuevo.send(hola) }
    nuevo.onmessage = (evento) => { if (vigente === generacion) alRecibir(evento.data, vigente) }
    nuevo.onerror = () => undefined
    nuevo.onclose = (evento) => { if (vigente === generacion && socket === nuevo) alCerrar(evento.code) }
  }

  function conectar (nuevas: OpcionesDeConexion): () => void {
    desconectar()
    opciones = nuevas
    intentos = 0
    void abrir()

    const mia = generacion

    return () => { if (mia === generacion) desconectar() }
  }

  function desconectar (): void {
    generacion += 1
    opciones = null

    if (temporizador !== null) dependencias.cancelar(temporizador)
    temporizador = null

    const viejo = socket

    socket = null
    if (viejo !== null) {
      viejo.onclose = null
      viejo.onmessage = null
      try { viejo.close(CIERRE_NORMAL) } catch { /* ya estaba cerrado */ }
    }
    fijarEstado(false)
    olvidarPresencia()
  }

  function suscribirSala (sala: string, pedirBoletoDeSala: PedirBoleto): () => void {
    const existente = salasPedidas.get(sala)
    const pedida = existente ?? { pedirBoleto: pedirBoletoDeSala, cuenta: 0 }

    pedida.cuenta += 1
    salasPedidas.set(sala, pedida)
    if (existente === undefined && conectado) void suscribir(sala, pedida, generacion)

    let suelta = false

    return () => {
      if (suelta) return
      suelta = true
      pedida.cuenta -= 1
      if (pedida.cuenta > 0) return

      salasPedidas.delete(sala)
      anunciadas.delete(sala)
      salasListas.delete(sala)
      presentes.delete(sala)
      if (conectado && socket !== null) socket.send(JSON.stringify({ t: 'desuscribir', sala }))
    }
  }

  function anunciarPresencia (sala: string): () => void {
    presenciaDeseada.set(sala, (presenciaDeseada.get(sala) ?? 0) + 1)
    anunciarPendientes()

    let suelta = false

    return () => {
      if (suelta) return
      suelta = true

      const quedan = (presenciaDeseada.get(sala) ?? 1) - 1

      if (quedan > 0) {
        presenciaDeseada.set(sala, quedan)

        return
      }

      presenciaDeseada.delete(sala)
      if (anunciadas.delete(sala)) enviar({ t: 'presencia', sala, estado: 'fuera' })
    }
  }

  function avisarEscribiendo (sala: string): void {
    if (salasListas.has(sala)) enviar({ t: 'escribiendo', sala })
  }

  function escucharPresencia (oyente: (aviso: AvisoDePresencia) => void): () => void {
    oyentesDePresencia.add(oyente)

    return () => { oyentesDePresencia.delete(oyente) }
  }

  function escuchar (oyente: (cambio: CambioEnVivo) => void): () => void {
    oyentes.add(oyente)

    return () => { oyentes.delete(oyente) }
  }

  function escucharEstado (oyente: (conectado: boolean) => void): () => void {
    oyentesDeEstado.add(oyente)

    return () => { oyentesDeEstado.delete(oyente) }
  }

  return {
    conectar,
    suscribirSala,
    escuchar,
    escucharEstado,
    estaConectado: () => conectado,
    anunciarPresencia,
    avisarEscribiendo,
    escucharPresencia,
    presentesDe: (sala) => presentes.get(sala) ?? SIN_PRESENTES
  }
}

/** Dependencias reales del navegador. */
const dependenciasDelNavegador: DependenciasDelCliente = {
  crearSocket: (url) => new WebSocket(url) as unknown as SocketMinimo,
  programar: (accion, ms) => globalThis.setTimeout(accion, ms),
  cancelar: (id) => { globalThis.clearTimeout(id as ReturnType<typeof setTimeout>) },
  aleatorio: () => Math.random()
}

const cliente = crearClienteEnVivo(dependenciasDelNavegador)

/**
 * Conecta la pestaña al bus. Un solo socket; llamar de nuevo reemplaza la conexión anterior.
 *
 * Cierra en `pagehide` (para no dejar el socket colgado al navegar) y reconecta si la página vuelve
 * del caché de ida y vuelta.
 *
 * @param opciones URL del servicio y cómo pedir el boleto
 * @returns la función que desconecta y deja de reintentar
 */
export function conectarEnVivo (opciones: OpcionesDeConexion): () => void {
  let desconectar = cliente.conectar(opciones)

  const alSalir = (): void => { desconectar() }
  const alVolver = (evento: PageTransitionEvent): void => {
    if (evento.persisted) desconectar = cliente.conectar(opciones)
  }

  window.addEventListener('pagehide', alSalir)
  window.addEventListener('pageshow', alVolver)

  return () => {
    window.removeEventListener('pagehide', alSalir)
    window.removeEventListener('pageshow', alVolver)
    desconectar()
  }
}

/** Suma una sala al bus; ver {@link ClienteEnVivo.suscribirSala}. */
export function suscribirSala (sala: string, pedirBoletoDeSala: PedirBoleto): () => void {
  return cliente.suscribirSala(sala, pedirBoletoDeSala)
}

/** Se entera de cada cambio avisado por el bus. Devuelve la función para dejar de escuchar. */
export function escucharEnVivo (oyente: (cambio: CambioEnVivo) => void): () => void {
  return cliente.escuchar(oyente)
}

/** Se entera de cuándo el socket pasa a conectado o desconectado. */
export function escucharEstado (oyente: (conectado: boolean) => void): () => void {
  return cliente.escucharEstado(oyente)
}

/** Dice que esta pestaña mira la sala; ver {@link ClienteEnVivo.anunciarPresencia}. */
export function anunciarPresencia (sala: string): () => void {
  return cliente.anunciarPresencia(sala)
}

/** Avisa que se está escribiendo en la sala; ver {@link ClienteEnVivo.avisarEscribiendo}. */
export function avisarEscribiendoEnSala (sala: string): void {
  cliente.avisarEscribiendo(sala)
}

/** Se entera de quiénes miran y quién escribe; ver {@link ClienteEnVivo.escucharPresencia}. */
export function escucharPresencia (oyente: (aviso: AvisoDePresencia) => void): () => void {
  return cliente.escucharPresencia(oyente)
}

/** Los últimos presentes conocidos de una sala; ver {@link ClienteEnVivo.presentesDe}. */
export function presentesDe (sala: string): number[] {
  return cliente.presentesDe(sala)
}

/** `true` si el socket del bus está conectado y listo. Sin conexión, el sondeo manda como siempre. */
export function estaConectadoEnVivo (): boolean {
  return cliente.estaConectado()
}

/**
 * Agrupa cambios repetidos y los entrega en lote tras una ventana.
 *
 * La ventana se abre con el primer cambio; los repetidos (mismo tipo e id) dentro de ella cuentan
 * una vez. Así una ráfaga de ediciones de una tarea se vuelve una sola relectura.
 *
 * @param alVaciar recibe los cambios únicos al cerrarse la ventana
 * @param ventanaMs duración de la ventana
 * @param programar temporizador, inyectable
 * @returns `agregar` para sumar un cambio y `cancelar` para descartar lo pendiente
 */
export function crearAgrupadorDeCambios (
  alVaciar: (cambios: CambioEnVivo[]) => void,
  ventanaMs: number,
  programar: (accion: () => void, ms: number) => unknown = (accion, ms) => globalThis.setTimeout(accion, ms),
  cancelarTimer: (id: unknown) => void = (id) => { globalThis.clearTimeout(id as ReturnType<typeof setTimeout>) }
): { agregar: (cambio: CambioEnVivo) => void, cancelar: () => void } {
  const pendientes = new Map<string, CambioEnVivo>()
  let temporizador: unknown = null

  function vaciar (): void {
    temporizador = null

    const lote = [...pendientes.values()]

    pendientes.clear()
    if (lote.length > 0) alVaciar(lote)
  }

  return {
    agregar: (cambio) => {
      pendientes.set(`${cambio.tipo}:${cambio.id ?? ''}`, cambio)
      temporizador ??= programar(vaciar, ventanaMs)
    },
    cancelar: () => {
      if (temporizador !== null) cancelarTimer(temporizador)
      temporizador = null
      pendientes.clear()
    }
  }
}
