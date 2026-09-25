/**
 * Decisiones de la aplicación instalable que no dependen del navegador.
 *
 * Viven acá, sin JSX, para que las pruebas de Node las ejerciten; el componente que registra el
 * service worker solo las consume.
 */

/** Ruta pública del service worker. La versión se le agrega como `?v=`. */
export const RUTA_SERVICE_WORKER = '/sw.js'

/** Colores de la barra del sistema: los literales de `--superficie` en claro y en oscuro. */
export const COLOR_BARRA = { claro: '#F4F3EE', oscuro: '#161715' } as const

/**
 * URL con la que se registra el service worker.
 *
 * La versión en la URL es lo que hace que un despliegue nuevo instale un trabajador nuevo: el
 * navegador compara la URL registrada, y `sw.js` nombra su caché con ese `v`.
 *
 * @param version identificador del build que sirvió esta página
 * @returns la URL relativa, con la versión codificada; sin versión, la ruta a secas
 */
export function urlDeRegistro (version: string): string {
  const limpia = version.trim()
  return limpia === '' ? RUTA_SERVICE_WORKER : `${RUTA_SERVICE_WORKER}?v=${encodeURIComponent(limpia)}`
}

/**
 * Lee la versión de la URL de un service worker.
 *
 * @param urlScript `scriptURL` del trabajador, absoluta o relativa
 * @returns la versión, o cadena vacía si no trae o la URL no se entiende
 */
export function versionDelScript (urlScript: string): string {
  try {
    return new URL(urlScript, 'http://local').searchParams.get('v') ?? ''
  } catch {
    return ''
  }
}

/**
 * Qué hacer con un service worker nuevo que quedó en espera.
 *
 * - `silenciosa`: el trabajador es de la MISMA versión que la página —la página ya es la nueva, por
 *   ejemplo justo después de actualizar—. Se activa sin preguntar: no cambia nada de lo que se ve, y
 *   un aviso de "versión nueva" recién recargado sería falso.
 * - `avisar`: el trabajador es de otra versión (otra pestaña ya cargó un despliegue más nuevo). La
 *   página que se está mirando es la vieja, y activarlo por debajo mezclaría dos versiones: se
 *   ofrece recargar.
 *
 * @param versionPagina versión con la que se sirvió esta página
 * @param urlScript `scriptURL` del trabajador en espera
 * @returns la decisión
 */
export function decidirActualizacion (versionPagina: string, urlScript: string): 'silenciosa' | 'avisar' {
  const delScript = versionDelScript(urlScript)
  return delScript === '' || delScript === versionPagina.trim() ? 'silenciosa' : 'avisar'
}

/** Clave de `localStorage` con el día (`YYYY-MM-DD`) en que se mostró por última vez el recordatorio. */
export const CLAVE_RECORDATORIO_INSTALAR = 'ops:recordatorio-instalar'

/** Clave de `localStorage` que marca que Ops ya se instaló desde este navegador. */
export const CLAVE_APP_INSTALADA = 'ops:app-instalada'

/**
 * Cómo se instala Ops en el navegador que está mirando.
 *
 * - `nativo`: Chrome, Edge, Brave, Samsung Internet… Disparan `beforeinstallprompt` y el botón abre
 *   el diálogo del propio navegador.
 * - `ios`: iPhone y iPad. Solo desde el botón Compartir → "Agregar a inicio".
 * - `safari-mac`: Safari de escritorio. Archivo → "Agregar al Dock".
 * - `firefox-android`: menú ⋮ → "Instalar".
 * - `no-instalable`: Firefox de escritorio y lo que no se reconozca. No se recuerda nada: pedir algo
 *   que el navegador no puede hacer es ruido.
 */
export type ViaDeInstalacion = 'nativo' | 'ios' | 'safari-mac' | 'firefox-android' | 'no-instalable'

/**
 * Deduce la vía de instalación del navegador.
 *
 * @param userAgent `navigator.userAgent`
 * @param puntosTactiles `navigator.maxTouchPoints`: el iPad moderno se anuncia como Mac y solo esto lo delata
 * @param conEventoNativo si existe `BeforeInstallPromptEvent` en `window`
 * @returns la vía; con datos vacíos, `no-instalable`
 */
export function viaDeInstalacion (userAgent: string, puntosTactiles: number, conEventoNativo: boolean): ViaDeInstalacion {
  const ua = userAgent ?? ''
  if (conEventoNativo) return 'nativo'
  const esApple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && puntosTactiles > 1)
  if (esApple) return 'ios'
  if (/Firefox\//.test(ua)) return /Android/.test(ua) ? 'firefox-android' : 'no-instalable'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'safari-mac'
  return 'no-instalable'
}

/**
 * Día local de una fecha, `YYYY-MM-DD`. Local y no UTC: el recordatorio es "una vez al día" para
 * quien lo ve, y en Santiago el día UTC cambia a media tarde.
 *
 * @param fecha instante a formatear
 * @returns el día local
 */
export function diaLocal (fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/**
 * Si hoy corresponde mostrar el recordatorio de instalar Ops.
 *
 * @param ultimoDia día en que se mostró por última vez (`null` o vacío si nunca)
 * @param hoy día local de hoy
 * @returns `true` si todavía no se mostró hoy
 */
export function tocaRecordarInstalar (ultimoDia: string | null, hoy: string): boolean {
  return (ultimoDia ?? '').trim() !== hoy
}
