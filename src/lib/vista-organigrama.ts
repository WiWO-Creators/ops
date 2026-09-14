/**
 * Con qué cara se mira el organigrama: el dibujo o la lista.
 *
 * Es una preferencia de quien mira, no un dato del equipo, así que vive en el navegador y no viaja
 * a la API. Quien prefiere la lista la prefiere siempre: sin esto habría que volver a elegirla en
 * cada área, en cada visita y en cada una de las dos pantallas donde se monta el organigrama.
 *
 * Vive en un módulo aparte —y no dentro del componente— por lo mismo que `barra-lateral.ts`: así lo
 * puede leer una prueba de Node sin montar React, y la clave de almacenamiento queda escrita una
 * sola vez.
 */

export const CLAVE_VISTA = 'wiwo-organigrama-vista'

/**
 * Evento propio que avisa un cambio de vista en ESTA pestaña.
 *
 * `storage` sólo se dispara en las demás pestañas, nunca en la que escribió. Sin este evento, el
 * conmutador no se enteraría de su propio clic. Es el mismo arreglo que usa el selector de tema.
 */
export const EVENTO_VISTA = 'wiwo:vista-organigrama'

/** Las dos lecturas de los mismos datos. */
export type VistaDeOrganigrama = 'organigrama' | 'lista'

/** La que se muestra a quien nunca eligió: el dibujo, que es a lo que esta pantalla vino. */
export const VISTA_POR_DEFECTO: VistaDeOrganigrama = 'organigrama'

/**
 * Lee la vista guardada.
 *
 * @returns la elegida, o la de por defecto si nadie eligió o el navegador no deja guardar
 */
export function leerVista (): VistaDeOrganigrama {
  if (typeof window === 'undefined') return VISTA_POR_DEFECTO

  try {
    return window.localStorage.getItem(CLAVE_VISTA) === 'lista' ? 'lista' : VISTA_POR_DEFECTO
  } catch {
    // Ventana privada o almacenamiento bloqueado: no es un error, es un navegador sin memoria.
    return VISTA_POR_DEFECTO
  }
}

/**
 * Recuerda la vista elegida.
 *
 * @param vista la que acaba de elegirse
 */
export function guardarVista (vista: VistaDeOrganigrama): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CLAVE_VISTA, vista)
  } catch {
    // Que no se pueda recordar no justifica romper nada: el evento igual se dispara y la pantalla
    // cambia, sólo que la próxima visita vuelve a abrir con el dibujo.
  }

  window.dispatchEvent(new Event(EVENTO_VISTA))
}

/**
 * La vista que pinta el servidor, que no tiene `localStorage`.
 *
 * Existe como función propia y no como `leerVista` porque React la llama también en el navegador
 * durante la hidratación: si ahí devolviera la guardada, el HTML del servidor y el primer render
 * del cliente no coincidirían y saltaría un error de hidratación.
 *
 * @returns siempre la vista por defecto
 */
export function vistaDelServidor (): VistaDeOrganigrama {
  return VISTA_POR_DEFECTO
}

/**
 * Avisa cuando la vista cambia, acá o en otra pestaña.
 *
 * @param alCambiar qué llamar en cada cambio
 * @returns cómo dejar de escuchar
 */
export function suscribirVista (alCambiar: () => void): () => void {
  window.addEventListener(EVENTO_VISTA, alCambiar)
  window.addEventListener('storage', alCambiar)

  return () => {
    window.removeEventListener(EVENTO_VISTA, alCambiar)
    window.removeEventListener('storage', alCambiar)
  }
}
