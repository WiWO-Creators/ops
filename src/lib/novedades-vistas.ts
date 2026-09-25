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

/** Clave de `localStorage` con la fecha de la última novedad que había cuando se ocultó el bloque del Inicio. */
const CLAVE_NOVEDADES_OCULTAS_INICIO = 'ops:novedades-ocultas-inicio'

/** Evento que avisa al bloque del Inicio que la persona lo ocultó. */
export const EVENTO_NOVEDADES_OCULTAS_INICIO = 'ops:novedades-ocultas-inicio'

/**
 * Lee hasta qué novedad la persona ocultó el bloque del Inicio.
 *
 * @returns `YYYY-MM-DD`, o `null` si nunca lo ocultó o no se puede leer el almacenamiento
 */
export function leerNovedadesOcultasEnInicio (): string | null {
  try {
    return window.localStorage.getItem(CLAVE_NOVEDADES_OCULTAS_INICIO)
  } catch {
    // Sin almacenamiento el bloque se muestra: ocultarlo es la comodidad que se pierde.
    return null
  }
}

/**
 * Oculta el bloque del Inicio hasta que llegue una novedad posterior a `fecha`.
 *
 * @param fecha la fecha de la novedad más reciente al momento de ocultar, `YYYY-MM-DD`
 */
export function ocultarNovedadesEnInicio (fecha: string): void {
  try {
    window.localStorage.setItem(CLAVE_NOVEDADES_OCULTAS_INICIO, fecha)
  } catch {
    // No se pudo guardar: el bloque vuelve a aparecer, que es lo único que se pierde.
  }

  window.dispatchEvent(new Event(EVENTO_NOVEDADES_OCULTAS_INICIO))
}
