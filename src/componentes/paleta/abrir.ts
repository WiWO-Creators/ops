/**
 * Abrir la paleta desde cualquier boton del panel.
 *
 * Un evento de ventana y no un contexto: los botones que la abren viven en la barra lateral, en la
 * cabecera de movil y en la barra inferior, tres ramas del armazon que no comparten un padre de
 * cliente. La paleta escucha el evento una sola vez, desde donde esta montada.
 */
export const EVENTO_ABRIR_PALETA = 'wiwo:abrir-paleta'

/** Pide a la paleta que se abra. Sin paleta montada no pasa nada, que es lo correcto. */
export function abrirPaleta (): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))
}

/**
 * Como se escribe el atajo en esta maquina: `⌘K` en Mac, `Ctrl K` en el resto.
 *
 * @param plataforma `navigator.platform` o equivalente; vacio cuando se renderiza en el servidor
 * @returns el texto del atajo
 */
export function textoDelAtajo (plataforma: string): string {
  return /mac|iphone|ipad/i.test(plataforma) ? '⌘K' : 'Ctrl K'
}
