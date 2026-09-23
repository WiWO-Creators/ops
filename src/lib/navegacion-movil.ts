/**
 * La navegación del teléfono: la barra inferior y el cajón de secciones que abre su "Más".
 *
 * Sin JSX, para que las pruebas lo importen.
 */

/**
 * Evento con el que la barra inferior le pide al cajón de secciones que se abra.
 *
 * Un evento y no estado compartido: la barra y el cajón viven en ramas distintas de un layout de
 * servidor, y subir el estado obligaría a convertir el armazón en cliente, que es justo lo que ese
 * layout evita (ver `app/(panel)/layout.tsx`).
 */
export const EVENTO_ABRIR_SECCIONES = 'wiwo:abrir-secciones'

/**
 * Qué pestaña de la barra corresponde a la ruta actual.
 *
 * Compara por segmento: `/proyectos/8/tareas` es Proyectos, `/proyectos-viejos` no lo sería. Una
 * ruta que no es de ninguna pestaña fija cae en "Más" (`-1` con `hayMas`), que es desde donde se
 * llegó a ella; sin eso el indicador desaparecería y la barra no diría dónde se está.
 *
 * @param ruta ruta actual, sin query
 * @param hrefs rutas de las pestañas visibles, en orden
 * @returns índice de la pestaña activa; `hrefs.length` significa "Más"
 */
export function pestanaActiva (ruta: string, hrefs: readonly string[]): number {
  const limpia = ruta.split(/[?#]/)[0] ?? ''
  const indice = hrefs.findIndex((href) => limpia === href || limpia.startsWith(`${href}/`))
  return indice === -1 ? hrefs.length : indice
}

/**
 * Si un elemento enfocado abre el teclado en pantalla.
 *
 * Con el teclado abierto la barra inferior se esconde: queda pegada encima del teclado y le roba al
 * formulario una franja de 64px justo cuando la pantalla es más chica.
 *
 * @param etiqueta `tagName` del elemento enfocado
 * @param tipo atributo `type`, si es un `<input>`
 * @param editable si el elemento es `contenteditable`
 * @returns `true` si escribir ahí abre el teclado
 */
export function abreTeclado (etiqueta: string, tipo: string | null, editable: boolean): boolean {
  if (editable) return true
  const nombre = etiqueta.toUpperCase()
  if (nombre === 'TEXTAREA') return true
  if (nombre !== 'INPUT') return false
  const sinTeclado = ['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image', 'hidden']
  return !sinTeclado.includes((tipo ?? 'text').toLowerCase())
}
