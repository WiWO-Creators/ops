/**
 * Cortes de layout, en pixeles.
 *
 * Los mismos cinco valores viven en el `@theme` de `src/app/globals.css`, porque parte del layout se
 * decide en CSS y parte en JS. `pruebas/breakpoints.test.js` compara los dos archivos y falla si
 * alguien mueve uno solo: un layout que decide con 1024 en CSS y con 1023 en JS produce bugs que solo
 * aparecen en una franja de un pixel, y nadie los reproduce.
 *
 * No se porto `_breakpoints.scss` del tema de Huly: sin Sass en el proyecto seria una tercera copia
 * de los mismos numeros.
 */
export const CORTES = {
  xs: 480,
  sm: 680,
  md: 760,
  lg: 1024,
  xl: 1208
} as const

export type Corte = keyof typeof CORTES

/**
 * Arma la media query de "a partir de este corte, inclusive".
 *
 * @param corte nombre del corte
 * @returns la media query lista para `window.matchMedia`
 */
export function desde (corte: Corte): string {
  return `(min-width: ${CORTES[corte]}px)`
}

/**
 * Arma la media query de "por debajo de este corte".
 *
 * Usa `max-width` con el corte menos un pixel para que `desde()` y `hasta()` no se solapen: con
 * `max-width: 1024px` y `min-width: 1024px`, ambas son verdaderas a la vez en 1024.
 *
 * @param corte nombre del corte
 * @returns la media query lista para `window.matchMedia`
 */
export function hasta (corte: Corte): string {
  return `(max-width: ${CORTES[corte] - 1}px)`
}
