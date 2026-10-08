/**
 * El anillo de foco de los controles de Focals, en una sola cadena.
 *
 * Seis controles de la pantalla repetían las mismas tres utilidades; una pantalla donde el anillo
 * cambia de grosor en un botón y no en el de al lado es la que se nota al navegar con teclado.
 * `EXTERIOR` dibuja el anillo fuera del borde; `INTERIOR` lo mete hacia dentro, para los controles
 * que llenan todo el ancho de su contenedor y cuyo anillo exterior lo cortaría el `overflow-hidden`.
 */
export const FOCO_EXTERIOR = 'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'

export const FOCO_INTERIOR = 'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2'
