import type { Ejecucion } from './ia-ejecucion.ts'

/**
 * Aviso de ventana de que el Orbe terminó una ejecución que pudo escribir datos.
 *
 * Las pantallas que cargan un recurso por su cuenta (`useRecurso`) no se enteran de lo que el Orbe
 * cambia desde el chat: `router.refresh()` solo vuelve a pedir los datos del servidor de Next, no
 * los de esas cargas del navegador. Este evento es el hilo entre el chat y esas pantallas; quien le
 * interese lo escucha y revalida lo suyo, sin que el chat conozca a nadie.
 */

/** Nombre del evento de ventana. */
export const EVENTO_ORBE_ESCRITURA = 'ops:orbe-escritura'

/** Lo que viaja en el `detail` del evento. */
export interface EscrituraDeOrbe {
  /** El Meeting Paper que la persona tenía abierto al preguntar, o `null` si no había ninguno. */
  actaId: number | null
}

/**
 * Indica si una ejecución completada pudo haber cambiado datos.
 *
 * Una pregunta que solo consultó (todos sus pasos son de lectura, o no hubo plan) no justifica volver
 * a pedir nada. Un paso sin `riesgo` (backends anteriores no lo mandan) se trata como posible
 * escritura: es más barato una revalidación de más que una pantalla vieja.
 *
 * @param ejecucion el snapshot de la ejecución
 * @returns `true` si algún paso escribe, elimina o no declara su riesgo
 */
export function pudoEscribir (ejecucion: Pick<Ejecucion, 'plan'>): boolean {
  const pasos = ejecucion.plan?.pasos ?? []

  return pasos.some(paso => paso.riesgo !== 'lectura')
}

/**
 * Avisa a la ventana que el Orbe escribió. No hace nada fuera del navegador.
 *
 * @param actaId el Meeting Paper en contexto al preguntar, o `null`
 */
export function avisarEscrituraDeOrbe (actaId: number | null): void {
  if (typeof window === 'undefined') return

  const detalle: EscrituraDeOrbe = { actaId }

  window.dispatchEvent(new CustomEvent<EscrituraDeOrbe>(EVENTO_ORBE_ESCRITURA, { detail: detalle }))
}

/**
 * Indica si el aviso del Orbe puede haber tocado un acta concreta.
 *
 * Sin acta en el aviso (`null`) no se sabe qué tocó el plan, así que cuenta para cualquier acta
 * abierta; con acta, solo para esa.
 *
 * @param detalle el `detail` del evento, sin fiarse de su forma
 * @param actaId el Meeting Paper que la pantalla tiene abierto
 * @returns `true` si la pantalla debe revalidar su acta
 */
export function escrituraAlcanzaAlActa (detalle: unknown, actaId: number): boolean {
  if (detalle === null || typeof detalle !== 'object') return false

  const id = (detalle as { actaId?: unknown }).actaId

  if (id === null) return true

  return typeof id === 'number' && id === actaId
}
