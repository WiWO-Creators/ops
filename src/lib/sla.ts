import type { EstadoSla } from '../datos/recursos.ts'
import { formatearFecha } from './fechas.ts'

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
 *
 * `entregado` es el estado que la API agrego al medir el plazo contra la **entrega efectiva** y no
 * contra el cierre: la tarea se entrego dentro del plazo, el reloj se detuvo ahi y lo que falta es
 * la respuesta del cliente. Va en `acento` —el mismo tono que la aprobacion `pendiente`, que dice
 * exactamente lo mismo: la pelota esta del otro lado—. No puede ser `aviso` ni `peligro` porque no
 * hay nada que corregir; no puede ser `exito` porque el verde del sistema esta reservado a lo que
 * ya se resolvio bien; y no puede ser `contorno` porque quedaria indistinguible de `en_plazo`, que
 * es el caso opuesto: ahi el reloj sigue corriendo.
 *
 * **Entregar tarde NO es `entregado`, sigue siendo `incumplido`.** Lo unico que cambio para ese
 * estado es que la desviacion queda congelada en el dia de la entrega en vez de crecer sola
 * mientras el cliente no contesta.
 */
export const SLA: Record<EstadoSla, { etiqueta: string, tono: 'contorno' | 'acento' | 'aviso' | 'peligro' }> = {
  en_plazo: { etiqueta: 'En plazo', tono: 'contorno' },
  en_riesgo: { etiqueta: 'En riesgo', tono: 'aviso' },
  entregado: { etiqueta: 'Entregado', tono: 'acento' },
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

/**
 * Como se lee la fecha de entrega efectiva: el dia en que el trabajo salio hacia el cliente.
 *
 * Es el dato que explica los dos estados nuevos del plazo. Con `entregado` dice por que el reloj se
 * detuvo y quien tiene ahora la pelota; con `incumplido` dice por que la desviacion dejo de crecer,
 * que es la pregunta que abria la ficha. **La coletilla de la espera solo sale en `entregado`**: una
 * entrega tardia pudo haberse respondido hace semanas, y prometer una espera que ya termino es peor
 * que no decir nada.
 *
 * El sujeto es el equipo, como en todo este bloque —"Pedir aprobacion al cliente", "Dijo el
 * cliente"—: quien lee es quien entrego, y el que responde es el cliente.
 *
 * @param entregadoEn Fecha `YYYY-MM-DD` de la entrega efectiva, o `null` si nunca se entrego.
 * @param estado Estado de SLA que acompaña a la fecha; solo `entregado` agrega la espera.
 * @returns El texto listo para pintar, o `null` si no hay entrega que contar.
 */
export function textoDeEntrega (
  entregadoEn: string | null | undefined,
  estado?: string | null
): string | null {
  if (typeof entregadoEn !== 'string' || entregadoEn === '') return null

  const fecha = formatearFecha(entregadoEn)

  // `formatearFecha` devuelve el guion largo ante una fecha que no puede leer, y "Entregado el —" es
  // peor que el silencio.
  if (fecha === SIN_DATO) return null

  return estado === 'entregado'
    ? `Entregado el ${fecha}, esperando la respuesta del cliente.`
    : `Entregado el ${fecha}.`
}
