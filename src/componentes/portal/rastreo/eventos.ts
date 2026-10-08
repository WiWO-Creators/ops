/**
 * Evento del navegador con el que una barra de pestañas avisa al rastreador del portal cual abrio.
 *
 * `Pestanas` cambia `?tab=` con la History API, que el router de Next no ve, asi que el rastreador no
 * puede enterarse mirando la URL. Nadie mas lo escucha: en el panel el aviso se pierde sin efecto.
 */
export const EVENTO_PESTANA = 'wiwo:pestana'

export interface DetallePestana {
  /** Pathname de la pagina que monta las pestañas. */
  ruta: string
  clave: string
}

/** Avisa que la pestaña `clave` esta activa en la pagina actual. */
export function avisarPestana (clave: string): void {
  window.dispatchEvent(new CustomEvent<DetallePestana>(EVENTO_PESTANA, {
    detail: { ruta: window.location.pathname, clave }
  }))
}
