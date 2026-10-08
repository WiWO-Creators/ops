/**
 * Cuándo el portal vuelve a pedirle sus páginas al servidor.
 *
 * Las páginas del portal (tablero, aprobaciones, lista de inicio, resumen) se resuelven en el
 * servidor: quedaban como una foto del momento de apertura y, con la pestaña abierta horas, el
 * cliente veía datos viejos sin enterarse. Esta decisión es pura para poder probarla sin navegador;
 * quien la usa (`componentes/portal/RefrescoDelPortal`) solo aporta el reloj y el estado del DOM.
 */

/** Cada cuánto se refresca una pestaña visible. */
export const INTERVALO_REFRESCO_PORTAL_MS = 60_000

/** Cuánto tiempo fuera de la pestaña hace falta para refrescar al volver a ella. */
export const AUSENCIA_MINIMA_PORTAL_MS = 30_000

/** Cuánto se espera a un refresco en vuelo antes de darlo por perdido. */
export const REFRESCO_PERDIDO_PORTAL_MS = 30_000

/** Qué disparó la pregunta de si toca refrescar. */
export type MotivoDeRefrescoPortal = 'intervalo' | 'regreso' | 'escritura'

/** Lo que hace falta saber para decidir. */
export interface EstadoDeRefrescoPortal {
  /** La pestaña no está a la vista. */
  oculto: boolean
  /** Cuándo empezó el último refresco, o la última carga, en epoch de milisegundos. */
  ultimoRefrescoMs: number
  /** El instante actual, en epoch de milisegundos. */
  ahoraMs: number
  /** Hay un campo de edición con el foco: refrescar no borra lo escrito, pero sí distrae. */
  editando: boolean
  /** Hay un refresco todavía en camino. */
  enVuelo: boolean
}

/**
 * Decide si toca refrescar el portal.
 *
 * Nunca con la pestaña oculta, con un refresco en camino ni mientras la persona escribe. Fuera de
 * eso: el intervalo exige que haya pasado un minuto desde el último, el regreso a la pestaña exige
 * más de treinta segundos, y una escritura confirmada refresca de inmediato.
 *
 * @param estado el reloj y el estado de la pestaña
 * @param motivo qué disparó la pregunta
 * @returns `true` si hay que llamar a `router.refresh()` ahora
 */
export function debeRefrescarPortal (estado: EstadoDeRefrescoPortal, motivo: MotivoDeRefrescoPortal): boolean {
  if (estado.oculto || estado.enVuelo || estado.editando) return false

  const transcurrido = estado.ahoraMs - estado.ultimoRefrescoMs

  if (motivo === 'intervalo') return transcurrido >= INTERVALO_REFRESCO_PORTAL_MS
  if (motivo === 'regreso') return transcurrido > AUSENCIA_MINIMA_PORTAL_MS

  return true
}

/** Lo que se necesita de un elemento para saber si en él se escribe. */
export interface ElementoEditable {
  tagName?: string
  isContentEditable?: boolean
}

/**
 * Dice si un elemento es un campo de edición (`input`, `textarea`, `select` o `contenteditable`).
 *
 * @param elemento el elemento con el foco, o `null` si no hay
 * @returns `true` si la persona podría estar escribiendo en él
 */
export function esElementoDeEdicion (elemento: ElementoEditable | null): boolean {
  if (elemento === null) return false

  const etiqueta = elemento.tagName?.toUpperCase()

  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || elemento.isContentEditable === true
}
