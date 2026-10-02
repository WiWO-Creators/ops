import {
  ColaDeEventos,
  Cronometro,
  INACTIVIDAD_MS,
  INTERVALO_ENVIO_MS,
  claveDeEnlace,
  claveDeRastreo,
  claveDeRotulo,
  eventoDeClick,
  eventoDePestana,
  eventoDeVista,
  sesionVigente,
  type EstadoDeSesion,
  type EventoDeRastreo
} from '@/dominio/rastreo-portal'

const CLAVE_SESION = 'wiwo-rastreo-portal'

/** Lo que viaja en `POST /portal/actividad`. */
export interface CuerpoDeRastreo {
  session: string
  device: 'movil' | 'escritorio'
  events: EventoDeRastreo[]
}

interface Abierta {
  ruta: string
  clave?: string
  crono: Cronometro
}

/**
 * Lleva la cuenta de lo que hace el contacto: la pagina que mira, la pestaña abierta dentro de ella,
 * cuanto tiempo la tuvo a la vista y que botones pulso. No toca React ni el DOM salvo
 * `sessionStorage` (envuelto en try/catch): `RastreadorPortal` le dice que paso y le da el reloj.
 *
 * El tiempo cuenta solo con la pestaña visible y con interaccion en el ultimo minuto. Al ocultarse
 * la pestaña se cierra lo abierto y se reabre al volver: es la unica señal fiable antes de que el
 * navegador congele la pagina, y un regreso a la pestaña se cuenta como una visita mas.
 */
export class MotorDeRastreo {
  private readonly cola = new ColaDeEventos()
  private sesion: EstadoDeSesion
  private vista: Abierta | null = null
  private pestana: Abierta | null = null
  private oculto = false
  private inactivo = false
  private ultimaActividad: number
  private ultimoEnvio: number

  constructor (
    private readonly enviar: (cuerpo: CuerpoDeRastreo, final: boolean) => void,
    private readonly dispositivo: 'movil' | 'escritorio',
    private readonly reloj: () => number = () => Date.now()
  ) {
    const ahora = this.reloj()

    this.ultimaActividad = ahora
    this.ultimoEnvio = ahora
    this.sesion = this.abrirSesion(ahora, null)
  }

  /** La pagina que se mira cambio. Cierra la vista y la pestaña anteriores y abre las nuevas. */
  cambiarRuta (ruta: string): void {
    if (this.vista?.ruta === ruta) return

    this.cerrarPestana()
    this.cerrarVista()
    this.vista = { ruta, crono: this.nuevoCronometro() }
  }

  /** La pestaña activa de la pagina cambio (o se mostro por primera vez). */
  cambiarPestana (ruta: string, clave: string): void {
    this.cambiarRuta(ruta)

    if (this.pestana?.clave === clave && this.pestana.ruta === ruta) return

    this.cerrarPestana()
    this.pestana = { ruta, clave, crono: this.nuevoCronometro() }
  }

  /** Un boton o enlace con su clave ya resuelta. */
  registrarClick (clave: string, objeto?: number): void {
    if (this.vista === null) return

    this.agregar(eventoDeClick(this.vista.ruta, clave, objeto))
    this.avisarActividad()
  }

  /**
   * Resuelve la clave de lo que se pulso, en este orden: `data-rastreo` explicito; pestaña; enlace
   * interno (por su destino); rotulo de interfaz (`aria-label` o `title`). Nunca el texto interior.
   */
  clickEn (elemento: Element): void {
    const objetivo = elemento.closest<HTMLElement>('[data-rastreo], [role="tab"], a[href], button, [role="button"]')

    if (objetivo === null) return

    const explicita = claveDeRastreo(objetivo.dataset.rastreo)
    const id = objetivo.dataset.rastreoId
    const objeto = id !== undefined && /^\d{1,9}$/.test(id) ? Number(id) : undefined

    if (explicita !== null) {
      this.registrarClick(explicita, objeto)

      return
    }

    if (objetivo.getAttribute('role') === 'tab') {
      this.registrarClick(`pestana.${objetivo.id.replace(/^pestana-/, '')}`)

      return
    }

    if (objetivo instanceof HTMLAnchorElement) {
      this.registrarEnlace(objetivo)

      return
    }

    this.registrarClick(
      claveDeRotulo(objetivo.getAttribute('aria-label') ?? objetivo.getAttribute('title')) ?? 'boton.sin-rotulo',
      objeto
    )
  }

  /** Hubo interaccion: renueva el reloj de inactividad y reanuda si estaba en pausa. */
  avisarActividad (): void {
    this.ultimaActividad = this.reloj()

    if (this.inactivo) {
      this.inactivo = false
      this.reanudar()
    }
  }

  /** Tic periodico: pausa por inactividad y envia lo acumulado si toca. */
  tic (): void {
    const ahora = this.reloj()

    if (!this.inactivo && !this.oculto && ahora - this.ultimaActividad > INACTIVIDAD_MS) {
      this.inactivo = true
      this.pausar()
    }

    if (this.cola.llena || (this.cola.pendientes > 0 && ahora - this.ultimoEnvio >= INTERVALO_ENVIO_MS)) {
      this.vaciar(false)
    }
  }

  /** La pestaña se oculta o se cierra: se cierra lo abierto y se envia ya. */
  ocultar (): void {
    if (this.oculto) return

    this.cerrarPestana(true)
    this.cerrarVista(true)
    this.oculto = true
    this.vaciar(true)
  }

  /** La pestaña vuelve a verse: arranca una vista nueva de la misma pagina. */
  mostrar (): void {
    if (!this.oculto) return

    this.oculto = false
    this.inactivo = false
    this.ultimaActividad = this.reloj()
    this.sesion = this.abrirSesion(this.ultimaActividad, this.sesion)

    if (this.vista !== null) this.vista = { ruta: this.vista.ruta, crono: this.nuevoCronometro() }
    if (this.pestana !== null) this.pestana = { ruta: this.pestana.ruta, clave: this.pestana.clave, crono: this.nuevoCronometro() }
  }

  /** Cierra todo y envia lo pendiente. Lo llama el desmontaje del rastreador. */
  terminar (): void {
    this.cerrarPestana()
    this.cerrarVista()
    this.vaciar(true)
  }

  private registrarEnlace (enlace: HTMLAnchorElement): void {
    const destino = new URL(enlace.href, window.location.href)
    const interno = destino.origin === window.location.origin
    const resuelta = interno ? claveDeEnlace(destino.pathname) : null

    this.registrarClick(resuelta?.clave ?? (interno ? 'enlace.otro' : 'enlace.externo'), resuelta?.objeto)
  }

  private nuevoCronometro (): Cronometro {
    const crono = new Cronometro(this.reloj())

    if (this.oculto || this.inactivo) crono.pausar(this.reloj())

    return crono
  }

  private pausar (): void {
    const ahora = this.reloj()

    this.vista?.crono.pausar(ahora)
    this.pestana?.crono.pausar(ahora)
  }

  private reanudar (): void {
    const ahora = this.reloj()

    this.vista?.crono.reanudar(ahora)
    this.pestana?.crono.reanudar(ahora)
  }

  private cerrarVista (conservar = false): void {
    if (this.vista === null) return

    const { ruta, crono } = this.vista

    this.agregar(eventoDeVista(ruta, crono.total(this.reloj())))
    this.vista = conservar ? this.vista : null
  }

  private cerrarPestana (conservar = false): void {
    if (this.pestana?.clave === undefined) return

    const { ruta, clave, crono } = this.pestana

    this.agregar(eventoDePestana(ruta, clave, crono.total(this.reloj())))
    this.pestana = conservar ? this.pestana : null
  }

  private agregar (evento: EventoDeRastreo | null): void {
    if (evento !== null) this.cola.agregar(evento)
  }

  private vaciar (final: boolean): void {
    this.ultimoEnvio = this.reloj()

    for (const lote of this.cola.vaciar()) {
      this.enviar({ session: this.sesion.id, device: this.dispositivo, events: lote }, final)
    }
  }

  /**
   * Continua la sesion guardada en `sessionStorage` o abre otra. Sin storage vive en memoria:
   * `actual` es la que ya se tenia y se sigue mientras no caduque.
   */
  private abrirSesion (ahora: number, actual: EstadoDeSesion | null): EstadoDeSesion {
    let guardada: EstadoDeSesion | null = actual

    try {
      const crudo = window.sessionStorage.getItem(CLAVE_SESION)

      if (crudo !== null) {
        const dato = JSON.parse(crudo) as Partial<EstadoDeSesion>

        if (typeof dato.id === 'string' && typeof dato.ultimo === 'number') guardada = { id: dato.id, ultimo: dato.ultimo }
      }
    } catch {
      // Storage bloqueado: se sigue con `actual`.
    }

    const sesion = sesionVigente(guardada, ahora, nuevoUuid)

    try {
      window.sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
    } catch {
      // Sin storage la sesion vive en memoria: se pierde al recargar y no es un error.
    }

    return sesion
  }
}

/** Un uuid v4 en minusculas, con respaldo para navegadores sin `crypto.randomUUID`. */
function nuevoUuid (): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16)

    return (c === 'x' ? n : (n & 0x3) | 0x8).toString(16)
  })
}
