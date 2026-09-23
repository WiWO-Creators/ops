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
