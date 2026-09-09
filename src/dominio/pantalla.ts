/**
 * La pantalla en la que esta parada una persona, tal como la nombra el backend.
 *
 * La misma cadena viaja por dos caminos distintos —el latido de presencia y cada pregunta a WiBot—
 * y **tiene que ser la misma**: el servidor resuelve con ella el ambito de lo que se le pregunta,
 * asi que un `/Espacios/2` por un lado y un `/espacios/2` por el otro serian dos pantallas para el.
 * Por eso vive aca y no duplicada en cada uno.
 */

/** Una ruta del panel: la arma Next con `usePathname()`, no la escribe nadie. */
const RUTA_DE_PANEL = /^\/[a-z0-9/_-]*$/

/**
 * Normaliza un pathname para mandarlo como `pantalla`.
 *
 * Devuelve `null` en vez de recortar o arreglar lo que no encaja: esto se manda a un registro de
 * quien mira que, y una ruta que no se entiende no se manda a medias.
 *
 * @param ruta el pathname vigente, tal como lo devuelve `usePathname()`
 * @returns la ruta en minusculas, o `null` si no tiene la forma de una ruta del panel
 */
export function pantallaDeRuta (ruta: string): string | null {
  const normalizada = ruta.toLowerCase()

  return RUTA_DE_PANEL.test(normalizada) ? normalizada : null
}
