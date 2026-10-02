/**
 * Cómo se llama cada tramo del semáforo y en qué orden se lista.
 *
 * Vive en un `.ts` sin React para que lo compartan la pantalla de Focals —fichas, barra y recuento
 * escrito— y las pruebas: antes el mismo tramo se llamaba "Crítico", "Críticas", "críticos" y "en
 * rojo" según el rincón. Los colores y tonos, que son de presentación, siguen en `TRAMOS` de
 * `SemaforoCliente.tsx`.
 */

import type { SemaforoCliente } from '../datos/recursos'

/**
 * Los tramos de más urgente a menos urgente.
 *
 * Rojo primero y no el orden alfabético ni el del tipo: la pantalla existe para encontrar lo que
 * está mal, y lo primero que se lee tiene que ser eso.
 */
export const ORDEN_DE_TRAMOS: readonly SemaforoCliente[] = ['rojo', 'amarillo', 'verde', 'sin_datos']

/** Las palabras de un tramo, para contar y para nombrar la ficha. */
export interface PalabrasDeTramo {
  /** Con una unidad: "1 crítico". */
  singular: string
  /** Con varias unidades o con cero: "3 críticos". */
  plural: string
  /** Cuando lo que se cuenta son cuentas y no Proyectos: "Críticas". Concuerda en género. */
  deCuentas: string
}

/** Las palabras de cada tramo. Es la única definición: fichas, recuento y resumen la leen de acá. */
export const PALABRAS_DE_TRAMO: Record<SemaforoCliente, PalabrasDeTramo> = {
  rojo: { singular: 'crítico', plural: 'críticos', deCuentas: 'Críticas' },
  amarillo: { singular: 'en atención', plural: 'en atención', deCuentas: 'En atención' },
  verde: { singular: 'al día', plural: 'al día', deCuentas: 'Al día' },
  sin_datos: { singular: 'sin datos', plural: 'sin datos', deCuentas: 'Sin datos' }
}

/**
 * "1 crítico", "3 críticos", "2 al día": la cantidad con la palabra del tramo concordada.
 *
 * @param tramo el tramo que se cuenta
 * @param cantidad cuántos hay; sólo `1` va en singular
 */
export function contarConPalabra (tramo: SemaforoCliente, cantidad: number): string {
  const palabras = PALABRAS_DE_TRAMO[tramo]

  return `${cantidad} ${cantidad === 1 ? palabras.singular : palabras.plural}`
}
