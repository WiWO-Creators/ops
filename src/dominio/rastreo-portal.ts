/**
 * Reglas puras del rastreo de uso del portal: que se registra, con que forma y cuando se envia.
 *
 * Vive sin `'use client'` ni alias de rutas para probarse con `node --test`: la parte que toca el
 * navegador (`RastreadorPortal`) solo cablea esto a eventos del DOM.
 *
 * **Nada de texto libre.** La API acepta rutas `/portal/...` en minusculas sin query ni hash,
 * pestañas y botones con formato cerrado e ids numericos, y rechaza el lote entero si un evento no
 * cumple. Todo lo que sale de aca ya cumple ese formato; lo que no, se descarta antes de armar el
 * evento. Que un boton diga "Aprobar" es dato del producto; lo que alguien escribio en un campo no
 * se mira nunca.
 */

/** Cada cuanto se envia lo acumulado. */
export const INTERVALO_ENVIO_MS = 15_000

/** Eventos en cola que fuerzan un envio sin esperar al intervalo. */
export const ENVIAR_AL_LLENAR = 20

/** Maximo por peticion: el mismo tope que la API (`RastreoPortal::LOTE_MAXIMO`). */
export const LOTE_MAXIMO = 50

/** Sin interaccion este tiempo, el cronometro de la vista se pausa: es una pestaña abierta, no uso. */
export const INACTIVIDAD_MS = 60_000

/** Una pausa mayor a esto es otra sesion. */
export const SESION_CADUCA_MS = 30 * 60_000

/** Tope de eventos que se guardan si el envio falla, para no crecer sin limite. */
export const COLA_MAXIMA = 200

const PATRON_RUTA = /^\/portal(\/[a-z0-9_-]+)*$/
const PATRON_CLAVE = /^[a-z0-9_.-]{1,64}$/
const PATRON_PESTANA = /^[a-z0-9_-]{1,32}$/

export type TipoEvento = 'vista' | 'pestana' | 'click'

export interface EventoDeRastreo {
  type: TipoEvento
  route: string
  tab?: string
  target?: string
  object_id?: number
  duration_ms?: number
}

/**
 * La ruta tal cual la acepta la API, o `null` si no es del portal o no tiene el formato.
 *
 * Sin query ni hash: `/portal/proyectos?q=sueldos` filtraria lo que alguien busco.
 *
 * @param pathname `window.location.pathname` o el de un enlace
 */
export function rutaDeRastreo (pathname: string): string | null {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '').toLowerCase() : pathname.toLowerCase()

  return PATRON_RUTA.test(ruta) && ruta.length <= 255 ? ruta : null
}

/** La clave de pestaña si cumple el formato cerrado. */
export function pestanaDeRastreo (clave: string | null | undefined): string | null {
  return typeof clave === 'string' && PATRON_PESTANA.test(clave) ? clave : null
}

/** La clave de boton si cumple el formato cerrado. */
export function claveDeRastreo (clave: string | null | undefined): string | null {
  return typeof clave === 'string' && PATRON_CLAVE.test(clave) ? clave : null
}

/**
 * Convierte un rotulo escrito por el equipo (`aria-label`, `title`) en una clave de boton.
 *
 * Solo para rotulos de interfaz. Nunca se le pasa el texto interior de un boton: ahi puede ir el
 * nombre de una tarea o de una persona.
 *
 * @returns `boton.<rotulo>` o `null` si el rotulo queda vacio
 */
export function claveDeRotulo (rotulo: string | null | undefined): string | null {
  if (typeof rotulo !== 'string') return null

  const limpio = rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return limpio === '' ? null : claveDeRastreo(`boton.${limpio}`)
}

/**
 * Clave de un enlace interno a partir de su destino: `/portal/proyectos/12` pasa a
 * `enlace.proyectos.id`, para que "abrir un proyecto" sea una sola clave y no una por proyecto.
 *
 * @returns la clave y el id numerico del destino, si lo hay; `null` si no es un destino del portal
 */
export function claveDeEnlace (pathname: string): { clave: string, objeto?: number } | null {
  const ruta = rutaDeRastreo(pathname)

  if (ruta === null) return null

  const segmentos = ruta.split('/').slice(2)
  const ultimoNumerico = [...segmentos].reverse().find((s) => /^\d+$/.test(s))
  const partes = segmentos.map((s) => (/^\d+$/.test(s) ? 'id' : s))
  const clave = claveDeRastreo(`enlace.${partes.length === 0 ? 'inicio' : partes.join('.')}`)

  if (clave === null) return null

  return ultimoNumerico === undefined ? { clave } : { clave, objeto: Number(ultimoNumerico) }
}

/** El ultimo segmento numerico de una ruta, que es el objeto que se mira (`/portal/soporte/7`). */
export function objetoDeRuta (pathname: string): number | undefined {
  const numero = [...pathname.split('/')].reverse().find((s) => /^\d+$/.test(s))

  return numero === undefined || numero.length > 9 ? undefined : Number(numero)
}

/**
 * Cronometro del tiempo visible de una vista, con el reloj inyectado para poder probarlo.
 *
 * Pausar y reanudar no cuentan: el tiempo con la pestaña oculta o sin interaccion no es uso.
 */
export class Cronometro {
  private acumulado = 0
  private desde: number | null

  constructor (ahora: number) {
    this.desde = ahora
  }

  pausar (ahora: number): void {
    if (this.desde === null) return

    this.acumulado += Math.max(0, ahora - this.desde)
    this.desde = null
  }

  reanudar (ahora: number): void {
    if (this.desde === null) this.desde = ahora
  }

  /** Milisegundos activos hasta `ahora`, enteros. */
  total (ahora: number): number {
    const enCurso = this.desde === null ? 0 : Math.max(0, ahora - this.desde)

    return Math.round(this.acumulado + enCurso)
  }
}

/**
 * Cola de eventos por enviar: acota su tamaño y los reparte en lotes del tamaño de la API.
 */
export class ColaDeEventos {
  private eventos: EventoDeRastreo[] = []

  agregar (evento: EventoDeRastreo): void {
    this.eventos.push(evento)

    if (this.eventos.length > COLA_MAXIMA) this.eventos.splice(0, this.eventos.length - COLA_MAXIMA)
  }

  get pendientes (): number {
    return this.eventos.length
  }

  get llena (): boolean {
    return this.eventos.length >= ENVIAR_AL_LLENAR
  }

  /** Saca todo lo pendiente, partido en lotes de a lo sumo `LOTE_MAXIMO`. */
  vaciar (): EventoDeRastreo[][] {
    const lotes: EventoDeRastreo[][] = []

    for (let i = 0; i < this.eventos.length; i += LOTE_MAXIMO) {
      lotes.push(this.eventos.slice(i, i + LOTE_MAXIMO))
    }

    this.eventos = []

    return lotes
  }

  /** Devuelve al frente de la cola lo que no se pudo enviar. */
  devolver (lote: EventoDeRastreo[]): void {
    this.eventos = [...lote, ...this.eventos].slice(-COLA_MAXIMA)
  }
}

export interface EstadoDeSesion {
  id: string
  ultimo: number
}

/**
 * Decide si se sigue con la sesion guardada o se abre otra.
 *
 * @param guardada lo que habia en `sessionStorage`, o `null`
 * @param ahora ms epoch
 * @param nuevoId generador de ids, inyectado para probarlo
 * @returns la sesion a usar, con `ultimo` en `ahora`
 */
export function sesionVigente (
  guardada: EstadoDeSesion | null,
  ahora: number,
  nuevoId: () => string
): EstadoDeSesion {
  const sigue = guardada !== null && ahora - guardada.ultimo <= SESION_CADUCA_MS

  return { id: sigue ? guardada.id : nuevoId(), ultimo: ahora }
}

/** Evento de vista: lo que duro la pagina visible. */
export function eventoDeVista (ruta: string, duracionMs: number): EventoDeRastreo | null {
  const route = rutaDeRastreo(ruta)

  if (route === null) return null

  const objeto = objetoDeRuta(route)

  return {
    type: 'vista',
    route,
    duration_ms: duracionMs,
    ...(objeto === undefined ? {} : { object_id: objeto })
  }
}

/** Evento de pestaña: lo que duro la pestaña abierta dentro de su pagina. */
export function eventoDePestana (ruta: string, clave: string, duracionMs: number): EventoDeRastreo | null {
  const route = rutaDeRastreo(ruta)
  const tab = pestanaDeRastreo(clave)

  if (route === null || tab === null) return null

  const objeto = objetoDeRuta(route)

  return {
    type: 'pestana',
    route,
    tab,
    duration_ms: duracionMs,
    ...(objeto === undefined ? {} : { object_id: objeto })
  }
}

/** Evento de click en un boton o enlace identificado por su clave. */
export function eventoDeClick (ruta: string, clave: string, objeto?: number): EventoDeRastreo | null {
  const route = rutaDeRastreo(ruta)
  const target = claveDeRastreo(clave)

  if (route === null || target === null) return null

  return {
    type: 'click',
    route,
    target,
    ...(objeto === undefined || !Number.isSafeInteger(objeto) || objeto < 0 ? {} : { object_id: objeto })
  }
}
