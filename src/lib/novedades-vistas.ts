/**
 * La marca de "ya vi las novedades", guardada en este navegador.
 *
 * Es una comodidad y no un registro: si el navegador no deja guardar (ventana privada estricta), el
 * punto del menú sigue apareciendo y nada más. Por eso vive en `localStorage` y no en la API.
 */

/** Clave de `localStorage` con la fecha de la última novedad vista. */
const CLAVE_NOVEDADES_VISTAS = 'ops:novedades-vistas'

/** Evento que avisa al menú, que no se desmonta al navegar, que la marca cambió. */
export const EVENTO_NOVEDADES_VISTAS = 'ops:novedades-vistas'

/**
 * Lee la fecha de la última novedad vista.
 *
 * @returns `YYYY-MM-DD`, o `null` si nunca se abrió la página o no se puede leer el almacenamiento
 */
export function leerNovedadesVistas (): string | null {
  try {
    return window.localStorage.getItem(CLAVE_NOVEDADES_VISTAS)
  } catch {
    // Sin almacenamiento no hay marca: se trata como si nunca las hubiera visto.
    return null
  }
}

/**
 * Guarda la fecha de la última novedad vista y avisa al menú.
 *
 * @param fecha la fecha de la novedad más reciente, `YYYY-MM-DD`
 */
export function marcarNovedadesVistas (fecha: string): void {
  try {
    window.localStorage.setItem(CLAVE_NOVEDADES_VISTAS, fecha)
  } catch {
    // No se pudo guardar: el aviso vuelve al recargar, que es lo único que se pierde.
  }

  window.dispatchEvent(new Event(EVENTO_NOVEDADES_VISTAS))
}
