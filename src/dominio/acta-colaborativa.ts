import { LOCALE, ZONA_NEGOCIO } from '../lib/fechas.ts'
import { ASISTENTE } from './glosario.ts'

/**
 * La edición conjunta del Meeting Paper vista desde el navegador: estados, mensajes del servicio,
 * colores de cada persona y quiénes están editando. Es lógica pura, sin React ni Yjs, para poder
 * probarla con `node:test`.
 *
 * El contenido viaja por Yjs (ver `useActaColaborativa`); lo que se decide acá es lo que rodea a ese
 * canal: cuándo se da por perdida la conexión, qué significa cada aviso suelto del servicio y cómo se
 * nombra a cada colaborador.
 */

/** En qué está la sesión de edición conjunta. `sin_acceso` y `sin_conexion` son finales: no se reintenta. */
export type EstadoColaborativo = 'conectando' | 'listo' | 'sin_conexion' | 'sin_acceso'

/** Cuánto se espera a la primera sincronización antes de volver a la edición de siempre. */
export const PLAZO_DE_SINCRONIZACION_MS = 5000

/** Esperas entre un intento de reconexión y el siguiente, tras perder una conexión que ya andaba. */
export const RETARDOS_DE_RECONEXION_MS: readonly number[] = [500, 1000, 2000, 4000, 8000]

/**
 * Cuánto tarda el servicio en guardar tras la última tecla (`EN_VIVO_DEBOUNCE_MS`, 2 s) más un margen.
 * Al cerrar la edición se revalida el acta pasado este tiempo, para ver lo que quedó guardado.
 */
export const ESPERA_TRAS_CERRAR_MS = 3000

/** Lo que el servicio avisa fuera del documento (mensajes «stateless» de Hocuspocus). */
export type MensajeDelDocumento =
  | { t: 'guardado', revision: string }
  | { t: 'recargado', motivo: string }
  | { t: 'sin_acceso' }

/**
 * Lee un aviso suelto del servicio. Lo que no calza con un mensaje conocido se ignora: el cliente no
 * debe romperse por un aviso nuevo de una versión más reciente del servicio.
 *
 * @param texto el payload tal como llegó
 * @returns el mensaje, o `null` si no es uno conocido
 */
export function leerMensajeDelDocumento (texto: string): MensajeDelDocumento | null {
  let crudo: unknown

  try {
    crudo = JSON.parse(texto)
  } catch {
    return null
  }

  if (typeof crudo !== 'object' || crudo === null) return null

  const { t, revision, motivo } = crudo as Record<string, unknown>

  if (t === 'guardado' && typeof revision === 'string' && revision !== '') return { t, revision }
  if (t === 'recargado') return { t, motivo: typeof motivo === 'string' ? motivo : '' }
  if (t === 'sin_acceso') return { t }

  return null
}

/**
 * Los colores de los cursores de las personas. Oscuros a propósito: la etiqueta con el nombre lleva
 * texto blanco. El del asistente no sale de acá (ver {@link esColaboradorOrbe}).
 */
const COLORES_DE_COLABORADOR = [
  '#b45309', '#0f766e', '#be185d', '#15803d', '#c2410c', '#0e7490', '#a21caf', '#4d7c0f'
] as const

/**
 * El color del cursor de una persona. Sale de su id, así que es el mismo en todas las pantallas sin
 * guardar nada.
 *
 * @param id id de la persona
 * @returns un color hexadecimal de seis dígitos
 */
export function colorDeColaborador (id: number): string {
  const indice = Math.abs(Math.trunc(id)) % COLORES_DE_COLABORADOR.length

  return COLORES_DE_COLABORADOR[indice] as string
}

/**
 * Indica si el cursor es el del asistente, que se dibuja con el color de su marca y no con el que
 * trae el servicio.
 *
 * @param nombre el nombre que publica el cursor
 * @returns `true` si es el asistente
 */
export function esColaboradorOrbe (nombre: unknown): boolean {
  return nombre === ASISTENTE
}

const FORMATO_DE_HORA = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ZONA_NEGOCIO
})

/**
 * El rótulo de la barra de edición: cuándo se guardó por última vez.
 *
 * @param guardadoEn marca (ms) del último «guardado» del servicio, o `null` si aún no hubo
 * @returns «Guardado 14:03», o un texto de espera si todavía no se guarda nada
 */
export function textoDeGuardado (guardadoEn: number | null): string {
  if (guardadoEn === null) return 'Los cambios se guardan solos'

  return `Guardado ${FORMATO_DE_HORA.format(new Date(guardadoEn))}`
}

/** Una persona que está en el documento. */
export interface EditorConectado {
  id: number
  full_name: string
  profile_image_url: string | null
}

/** Quiénes están en el documento además de quien mira. */
export interface EditoresDelDocumento {
  personas: EditorConectado[]
  /** El asistente está escribiendo en el documento. */
  orbe: boolean
}

/**
 * Quiénes están editando, a partir del estado de presencia (awareness) de Yjs.
 *
 * Una persona con dos pestañas abiertas cuenta una sola vez, y quien mira no se cuenta a sí misma.
 * Un estado sin `user` válido (otro cliente, un cursor sin identificar) se ignora.
 *
 * @param estados los estados de presencia de todos los clientes conectados
 * @param yoId id de quien mira
 * @returns las demás personas y si el asistente está
 */
export function editoresDelDocumento (estados: Iterable<unknown>, yoId: number): EditoresDelDocumento {
  const personas = new Map<number, EditorConectado>()
  let orbe = false

  for (const estado of estados) {
    const user = (estado as { user?: Record<string, unknown> } | null | undefined)?.user

    if (typeof user !== 'object' || user === null) continue

    if (esColaboradorOrbe(user.name)) {
      orbe = true
      continue
    }

    const { id, name, imagen } = user

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id === yoId) continue
    if (typeof name !== 'string' || name === '' || personas.has(id)) continue

    personas.set(id, { id, full_name: name, profile_image_url: typeof imagen === 'string' ? imagen : null })
  }

  return { personas: [...personas.values()], orbe }
}

/**
 * Espera antes del siguiente intento de reconexión.
 *
 * @param fallidos cuántos intentos seguidos fallaron (1 = el primero)
 * @returns los milisegundos a esperar, o `null` si ya no se debe insistir
 */
export function esperaDeReconexion (fallidos: number): number | null {
  if (fallidos < 1 || fallidos > RETARDOS_DE_RECONEXION_MS.length) return null

  return RETARDOS_DE_RECONEXION_MS[fallidos - 1] ?? null
}
