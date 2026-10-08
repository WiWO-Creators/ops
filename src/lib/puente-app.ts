/**
 * Puente entre esta PWA y la app nativa (`ops-mobile`).
 *
 * PWA → app: JSON versionado por `window.ReactNativeWebView.postMessage`. App → PWA: un
 * `CustomEvent('wiwo-app')` en `window` con el mensaje en `detail`. Los constructores y el lector
 * son puros para poder probarlos sin navegador; solo `enviarAlApp` y `escucharApp` tocan `window`.
 */

import type { LiveCardState } from '../datos/live.ts'

/** Versión del protocolo. La app rechaza cualquier mensaje con otra. */
export const VERSION_PUENTE = 1

/** Nombre del evento con que la app le habla a la PWA. */
export const EVENTO_APP = 'wiwo-app'

/** Evento de `window` con que las pantallas avisan que la jornada cambió (abrir, editar, cerrar, prorrogar). */
export const EVENTO_JORNADA = 'jornada-cambio'

/** Lo que la PWA le manda a la app. */
export type MensajeAlApp =
  | { v: 1, tipo: 'auth', codigo: string }
  | { v: 1, tipo: 'card.start', card: LiveCardState }
  | { v: 1, tipo: 'card.update', card: LiveCardState }
  | { v: 1, tipo: 'card.end', cardId: string }
  | { v: 1, tipo: 'logout' }
  | { v: 1, tipo: 'app.ajustes' }
  | { v: 1, tipo: 'ready' }

/** Lo que la app le cuenta a la PWA. */
export interface EstadoDeLaApp {
  tipo: 'estado'
  vinculado: boolean
  /** Reto PKCE pendiente de vincular, o `null`. */
  reto: string | null
}

export type MensajeDeLaApp = EstadoDeLaApp

/** El único canal que expone `react-native-webview` dentro de la página. */
interface PuenteNativo {
  postMessage: (mensaje: string) => void
}

declare global {
  interface Window {
    ReactNativeWebView?: PuenteNativo
  }
}

/**
 * Exige un texto no vacío.
 *
 * @throws RangeError si `valor` está vacío
 */
function exigirTexto (valor: string, nombre: string): string {
  if (valor.trim() === '') throw new RangeError(`${nombre} no puede estar vacío`)

  return valor
}

/**
 * Entrega a la app el código de un solo uso para vincular este teléfono.
 *
 * @throws RangeError si el código está vacío
 */
export function mensajeAuth (codigo: string): MensajeAlApp {
  return { v: VERSION_PUENTE, tipo: 'auth', codigo: exigirTexto(codigo, 'codigo') }
}

/** Inicia la tarjeta en vivo. @throws RangeError si la tarjeta no trae `cardId`. */
export function mensajeCardStart (card: LiveCardState): MensajeAlApp {
  exigirTexto(card.cardId, 'cardId')

  return { v: VERSION_PUENTE, tipo: 'card.start', card }
}

/** Actualiza la tarjeta en vivo. @throws RangeError si la tarjeta no trae `cardId`. */
export function mensajeCardUpdate (card: LiveCardState): MensajeAlApp {
  exigirTexto(card.cardId, 'cardId')

  return { v: VERSION_PUENTE, tipo: 'card.update', card }
}

/** Termina la tarjeta en vivo. @throws RangeError si `cardId` está vacío. */
export function mensajeCardEnd (cardId: string): MensajeAlApp {
  return { v: VERSION_PUENTE, tipo: 'card.end', cardId: exigirTexto(cardId, 'cardId') }
}

/** Avisa que la sesión se cierra: la app termina la tarjeta y desvincula el dispositivo. */
export function mensajeLogout (): MensajeAlApp {
  return { v: VERSION_PUENTE, tipo: 'logout' }
}

/** Pide abrir la pantalla nativa de Ajustes de la app. */
export function mensajeAjustes (): MensajeAlApp {
  return { v: VERSION_PUENTE, tipo: 'app.ajustes' }
}

/** Avisa que la PWA cargó y escucha: la app responde con su estado. */
export function mensajeReady (): MensajeAlApp {
  return { v: VERSION_PUENTE, tipo: 'ready' }
}

/**
 * Manda un mensaje a la app.
 *
 * @returns `true` si había un puente al que entregarlo; `false` en un navegador normal, donde no
 *          pasa nada. Nunca lanza.
 */
export function enviarAlApp (mensaje: MensajeAlApp): boolean {
  if (typeof window === 'undefined') return false

  const puente = window.ReactNativeWebView

  if (puente === undefined) return false

  try {
    puente.postMessage(JSON.stringify(mensaje))

    return true
  } catch {
    return false
  }
}

/**
 * Valida lo que llegó en el `detail` del evento de la app.
 *
 * @param detalle el `detail` del `CustomEvent`, o su JSON como texto
 * @returns el mensaje entendido, o `null` si no es de este protocolo
 */
export function leerMensajeDeLaApp (detalle: unknown): MensajeDeLaApp | null {
  let valor = detalle

  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor) as unknown
    } catch {
      return null
    }
  }

  if (typeof valor !== 'object' || valor === null) return null

  const { tipo, vinculado, reto } = valor as Record<string, unknown>

  if (tipo !== 'estado' || typeof vinculado !== 'boolean') return null
  if (reto !== null && reto !== undefined && typeof reto !== 'string') return null

  return { tipo: 'estado', vinculado, reto: reto ?? null }
}

/**
 * Escucha los mensajes de la app.
 *
 * @param alRecibir se llama con cada mensaje válido; los demás se ignoran
 * @returns la función que deja de escuchar
 */
export function escucharApp (alRecibir: (mensaje: MensajeDeLaApp) => void): () => void {
  const manejar = (evento: Event): void => {
    const mensaje = leerMensajeDeLaApp((evento as CustomEvent<unknown>).detail)

    if (mensaje !== null) alRecibir(mensaje)
  }

  window.addEventListener(EVENTO_APP, manejar)

  return () => { window.removeEventListener(EVENTO_APP, manejar) }
}

/**
 * Avisa que la jornada cambió, para que `PuenteApp` resincronice la tarjeta. No hace nada en el
 * servidor ni en un navegador sin app: el evento no tiene más oyente que el puente.
 */
export function avisarCambioDeJornada (): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new Event(EVENTO_JORNADA))
}
