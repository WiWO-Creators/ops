/**
 * Detección de la app nativa de Wiwo Ops (`ops-mobile`), que envuelve esta misma PWA en un WebView.
 *
 * La app agrega `WiwoOpsApp/<versión>` al `User-Agent` y, antes de que cargue la página, define
 * `window.WiwoOpsApp`. Cualquiera de las dos señales basta: el UA sirve también en el servidor
 * (`headers()`), la variable es la que alcanza si algún WebView reemplazara el UA.
 *
 * Sin JSX ni dependencias, para que las pruebas de Node lo ejerciten tal cual.
 */

/** Lo que el sufijo del `User-Agent` anuncia, seguido de la versión. */
export const SUFIJO_AGENTE_APP = 'WiwoOpsApp/'

/** Lo que la app inyecta en `window.WiwoOpsApp` antes de que cargue la página. */
export interface InfoDeApp {
  /** Versión del protocolo del puente. */
  v: number
  plataforma: 'ios' | 'android'
  /** `true` cuando el teléfono ya tiene credencial de dispositivo. */
  vinculado: boolean
  /** Reto PKCE (base64url de 43 caracteres) a vincular, o `null` si no hay vinculación pendiente. */
  reto: string | null
}

declare global {
  interface Window {
    WiwoOpsApp?: InfoDeApp
  }
}

const PATRON_VERSION = /WiwoOpsApp\/([0-9A-Za-z._-]+)/

/**
 * `true` si el `User-Agent` es el de la app nativa.
 *
 * @param ua cabecera `User-Agent` (o `navigator.userAgent`)
 */
export function esAppNativa (ua: string | null | undefined): boolean {
  return typeof ua === 'string' && ua.includes(SUFIJO_AGENTE_APP)
}

/**
 * La versión de la app que anuncia el `User-Agent`.
 *
 * @param ua cabecera `User-Agent` (o `navigator.userAgent`)
 * @returns la versión (`1.0`), o `null` si no es la app o no trae versión legible
 */
export function versionDeApp (ua: string | null | undefined): string | null {
  if (typeof ua !== 'string') return null

  return PATRON_VERSION.exec(ua)?.[1] ?? null
}

/**
 * `true` si esta página corre dentro de la app nativa. Solo en el navegador: en el servidor siempre
 * es `false`, y quien necesite saberlo ahí lee el `User-Agent` con `esAppNativa()`.
 */
export function enAppNativa (): boolean {
  if (typeof window === 'undefined') return false

  return esAppNativa(window.navigator.userAgent) || window.WiwoOpsApp !== undefined
}
