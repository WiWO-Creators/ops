import type { EstadoSla } from '../datos/recursos.ts'

/**
 * Presentacion del compromiso de plazo (ETA, desviacion y SLA).
 *
 * **El calculo lo hace el backend.** `eta`, `desviacion_dias` y `estado_sla` llegan ya resueltos
 * dentro del Proceso, con su regla de dias habiles y su origen de reloj. Repetir esa cuenta aca
 * daria dos verdades sobre el mismo plazo, y la que se ve en pantalla seria la equivocada. Lo unico
 * que vive en este archivo es como se leen esos tres valores.
 *
 * Regla de oro, valida en todas las superficies: un Proceso sin tipo, sin ETA configurado, sin
 * aprobar todavia o sin `due_date` devuelve `null`, y en pantalla es un guion. Nunca un cero: un
 * cero se lee como "cumple".
 *
 * Los imports son relativos y con extension porque `pruebas/sla.test.js` corre con el runner de
 * Node, que resuelve rutas de archivo y no el alias `@/` de Next.
 */

/** Guion que ocupa el lugar de un dato que no existe. Mismo criterio que la columna Iteraciones. */
export const SIN_DATO = '—'

/**
 * Texto de una desviacion en dias contra el vencimiento comprometido.
 *
 * El signo se escribe con el menos tipografico (U+2212) y no con el guion del teclado: en cifras
 * tabulares el guion queda a media altura y se lee como una raya de separacion.
 *
 * @param dias Dias contra `due_date`. **Positivo = tarde.** `null` si el Proceso no tiene `due_date`.
 * @returns El texto listo para pintar, o `null` si no hay desviacion que mostrar.
 */
export function formatearDesviacion (dias: number | null | undefined): string | null {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null

  if (dias === 0) return 'a tiempo'

  return dias > 0 ? `+${dias} d` : `−${Math.abs(dias)} d`
}

/**
 * Como se lee cada estado de SLA.
 *
 * `en_plazo` no lleva color: lo normal solo confirma, y el color queda para lo que pide accion.
 * Los tonos son los de `Insignia`, para que la senal sea la misma en las cinco superficies donde
 * aparece.
 */
export const SLA: Record<EstadoSla, { etiqueta: string, tono: 'contorno' | 'aviso' | 'peligro' }> = {
  en_plazo: { etiqueta: 'En plazo', tono: 'contorno' },
  en_riesgo: { etiqueta: 'En riesgo', tono: 'aviso' },
  incumplido: { etiqueta: 'Incumplido', tono: 'peligro' }
}

/**
 * `true` si el valor es un estado de SLA que el contrato declara.
 *
 * La API puede sumar un estado nuevo antes que el frontend: sin esta comprobacion, un valor
 * desconocido indexaria el mapa con `undefined` y reventaria al pintar.
 */
export function esEstadoSla (valor: unknown): valor is EstadoSla {
  return typeof valor === 'string' && Object.hasOwn(SLA, valor)
}
