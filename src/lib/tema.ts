/**
 * Eleccion de tema claro/oscuro.
 *
 * Comparte la clave de `localStorage` con el panel actual (`assets/neo/wiwo.neo.js` usa
 * `wiwo-theme` y `html[data-theme]`), asi que quien ya eligio oscuro en el panel viejo abre ops-v2 en
 * oscuro sin volver a elegir.
 *
 * Sin valor guardado no se escribe `data-theme` y manda `prefers-color-scheme`, que es lo que resuelve
 * `light-dark()` en `neo.css`.
 */

export const CLAVE_TEMA = 'wiwo-theme'

/**
 * Evento propio que avisa un cambio de tema en ESTA pestaña.
 *
 * `storage` solo dispara en las demas pestañas, nunca en la que escribio. Sin este evento, el
 * selector no se enteraria de su propio clic.
 */
export const EVENTO_TEMA = 'wiwo:tema'

export type Tema = 'light' | 'dark' | 'sistema'

/**
 * Lee el tema guardado.
 *
 * @returns el tema elegido, o `'sistema'` si nadie eligio o el almacenamiento no esta disponible
 */
export function leerTema (): Tema {
  if (typeof window === 'undefined') return 'sistema'
  try {
    const guardado = window.localStorage.getItem(CLAVE_TEMA)
    return guardado === 'light' || guardado === 'dark' ? guardado : 'sistema'
  } catch {
    // Ventana privada o cookies bloqueadas: no es un error, es un navegador sin almacenamiento.
    return 'sistema'
  }
}

/**
 * Aplica un tema al documento y lo persiste.
 *
 * @param tema tema a aplicar; `'sistema'` quita el atributo y devuelve el control a la preferencia
 *   del sistema operativo
 */
export function aplicarTema (tema: Tema): void {
  if (typeof document === 'undefined') return

  if (tema === 'sistema') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', tema)

  try {
    if (tema === 'sistema') window.localStorage.removeItem(CLAVE_TEMA)
    else window.localStorage.setItem(CLAVE_TEMA, tema)
  } catch {
    // El tema ya se aplico; que no se pueda recordar no justifica romper la pantalla.
  }

  window.dispatchEvent(new Event(EVENTO_TEMA))
}

/**
 * Script que corre antes de pintar, para evitar el destello de tema claro en quien eligio oscuro.
 *
 * Va inyectado en el `<head>` con `dangerouslySetInnerHTML`: cualquier otra via corre despues del
 * primer pintado, que es justo el momento que hay que ganarle.
 */
export const SCRIPT_TEMA_INICIAL = `try{var t=localStorage.getItem('${CLAVE_TEMA}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`
