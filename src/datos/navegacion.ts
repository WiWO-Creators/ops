import { useSyncExternalStore } from 'react'

/**
 * Estado de la navegación en curso.
 *
 * Next no avisa cuando un `router.push` está esperando al servidor: con red lenta la persona hace
 * clic y no pasa nada visible durante segundos. Este registro marca el inicio de la navegación
 * (un clic en un enlace interno, o una llamada explícita) y se cierra cuando cambia la ruta o vence
 * un tope, para que un enlace que no navega nunca deje la barra encendida.
 */

/** Tiempo tras el cual se da por terminada una navegación que nunca llegó a cambiar la ruta. */
export const TOPE_DE_NAVEGACION_MS = 15_000

let navegando = false
let tope: ReturnType<typeof setTimeout> | undefined
const oyentes = new Set<() => void>()

/** Cambia el estado y avisa a los suscritos solo si cambió. */
function fijar (valor: boolean): void {
  if (navegando === valor) return

  navegando = valor
  for (const oyente of oyentes) oyente()
}

/** Marca que empezó una navegación; se cierra sola al llegar la ruta o al vencer el tope. */
export function iniciarNavegacion (): void {
  fijar(true)
  clearTimeout(tope)
  tope = setTimeout(terminarNavegacion, TOPE_DE_NAVEGACION_MS)
}

/** Marca que la navegación terminó. */
export function terminarNavegacion (): void {
  clearTimeout(tope)
  fijar(false)
}

/**
 * `true` si el clic sobre un enlace va a navegar dentro de la app.
 *
 * Descarta los clics con modificadores, los enlaces a otra pestaña, a otro origen, de descarga y los
 * que solo cambian el ancla, que no esperan al servidor.
 *
 * @param enlace el `<a>` clicado
 * @param evento el clic
 * @param origenActual `location.origin`
 * @param rutaActual `pathname + search` actuales
 */
export function esNavegacionInterna (
  enlace: Pick<HTMLAnchorElement, 'href' | 'target' | 'hasAttribute'>,
  evento: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>,
  origenActual: string,
  rutaActual: string
): boolean {
  if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false
  if (enlace.hasAttribute('download') || (enlace.target !== '' && enlace.target !== '_self')) return false

  let destino: URL

  try {
    destino = new URL(enlace.href, origenActual)
  } catch {
    return false
  }

  if (destino.origin !== origenActual) return false

  return `${destino.pathname}${destino.search}` !== rutaActual
}

/** Parámetros que abren un modal desde el navegador: cambiarlos no necesita renderizar la página en el servidor. */
export const PARAMETROS_DE_MODAL: readonly string[] = ['tarea', 'ticket']

/**
 * Si el enlace solo agrega, cambia o quita un parámetro de modal de la página actual, devuelve la
 * URL de destino para escribirla en el historial sin pasar por el servidor.
 *
 * Abrir una tarea con `<Link>` volvía a renderizar la página completa en el servidor —decenas de
 * peticiones— solo para que cambiara `?tarea=`; con red lenta el clic parecía no hacer nada.
 *
 * @param href el destino del enlace
 * @param origenActual `location.origin`
 * @param rutaActual `pathname` actual
 * @param consultaActual `search` actual, con `?` o vacío
 * @returns `pathname + search + hash` del destino, o `null` si no es solo un cambio de modal
 */
export function destinoSoloDeModal (href: string, origenActual: string, rutaActual: string, consultaActual: string): string | null {
  let destino: URL

  try {
    destino = new URL(href, origenActual)
  } catch {
    return null
  }

  if (destino.origin !== origenActual || destino.pathname !== rutaActual) return null

  const actual = new URLSearchParams(consultaActual)
  const nuevo = new URLSearchParams(destino.search)

  for (const parametro of PARAMETROS_DE_MODAL) {
    actual.delete(parametro)
    nuevo.delete(parametro)
  }

  if (actual.toString() !== nuevo.toString()) return null

  return `${destino.pathname}${destino.search}${destino.hash}`
}

/** Se suscribe a los cambios; devuelve la baja. */
function suscribir (oyente: () => void): () => void {
  oyentes.add(oyente)

  return () => { oyentes.delete(oyente) }
}

/** `true` mientras hay una navegación esperando al servidor. */
export function useNavegando (): boolean {
  return useSyncExternalStore(suscribir, () => navegando, () => false)
}
