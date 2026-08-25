import type { ColumnaHito, TarjetaHito } from '@/datos/recursos'
import type { CuerpoMover, FilaConId, GrupoTablero } from '@/componentes/datos/tablero'

/**
 * Logica pura del kanban y de la tabla de Hitos.
 *
 * Vive fuera del `.tsx` porque Node sabe despojar los tipos de un `.ts` pero no el JSX: una funcion
 * declarada dentro del componente no se puede probar. Aca no hay React ni `fetch`.
 *
 * Sin imports de valor: los `import type` desaparecen al despojar tipos, pero un import normal con el
 * alias `@/` no lo resolveria el runner de Node.
 */

/** Id de la columna sintetica "Sin categorizar": las tareas sin hito viven ahi. */
export const COLUMNA_SIN_CATEGORIZAR = 0

/** Un grupo del kanban de hitos, con la columna enriquecida que manda el contrato. */
export type GrupoHito = GrupoTablero<TarjetaHito> & { columna: ColumnaHito }

/**
 * Ordena las columnas del kanban y descarta la sintetica cuando esta vacia.
 *
 * "Sin categorizar" va **siempre primera** aunque su `order` no sea el menor, porque no es un hito
 * sino el cajon de lo que todavia no se clasifico; y se omite si no tiene tareas, igual que en el
 * panel: una columna permanentemente vacia solo ocupa ancho.
 *
 * El resto se ordena por `order` y no por `id`: `milestone_order` es lo que la persona arrastro en el
 * panel, y los ids siguen el orden en que se crearon los hitos.
 *
 * @param grupos columnas tal como llegaron de la API
 * @returns una copia ordenada y podada
 */
export function ordenarColumnasHitos<T extends FilaConId> (
  grupos: Array<GrupoTablero<T>>
): Array<GrupoTablero<T>> {
  return [...grupos]
    .filter((g) => g.columna.id !== COLUMNA_SIN_CATEGORIZAR || g.tarjetas.length > 0)
    .sort((a, b) => {
      if (a.columna.id === COLUMNA_SIN_CATEGORIZAR) return -1
      if (b.columna.id === COLUMNA_SIN_CATEGORIZAR) return 1

      return a.columna.order - b.columna.order
    })
}

/**
 * Avance de un hito en porcentaje.
 *
 * @param counts contadores del hito
 * @returns el porcentaje, o `null` si el hito no tiene tareas — dividir por cero daria `NaN`, y
 *          pintar 0% mentiria: un hito sin tareas no esta atrasado, esta vacio
 */
export function avanceDeHito (counts: { tasks: number, tasks_done: number }): number | null {
  if (counts.tasks <= 0) return null

  return (counts.tasks_done / counts.tasks) * 100
}

/**
 * Traduce el cuerpo de "mover" al nombre que usa el endpoint de Hitos.
 *
 * El motor de tablero habla de `columna`, porque el kanban de estados es su caso original; el
 * contrato de `POST /tasks/{id}/mover-hito` llama `hito` a lo mismo. Se traduce en un solo lugar en
 * vez de bifurcar el motor.
 *
 * @param cuerpo el cuerpo que arma `moverTarjeta`
 * @returns el cuerpo con la clave que espera la API de Hitos
 */
export function cuerpoMoverHito (cuerpo: CuerpoMover): {
  hito: number
  posicion: number
  columna_completa: number[]
} {
  return {
    hito: cuerpo.columna,
    posicion: cuerpo.posicion,
    columna_completa: cuerpo.columna_completa
  }
}
