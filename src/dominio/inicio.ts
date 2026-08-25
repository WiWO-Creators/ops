import type { Proceso } from '../datos/recursos.ts'
import { estadoVencimiento } from '../lib/fechas.ts'

/** Lo que devuelve `estadoVencimiento`. Se deriva en vez de duplicar la union en dos archivos. */
type EstadoVencimiento = ReturnType<typeof estadoVencimiento>

/** Los tramos que la pantalla de inicio muestra, en el orden en que se leen. */
const TRAMOS_ACTIVOS = ['vencido', 'hoy', 'proximo'] as const

export type TramoInicio = typeof TRAMOS_ACTIVOS[number]

/**
 * Cuantos procesos se listan por tramo.
 *
 * Un tramo "Vencidos" con treinta filas deja de ser un resumen y pasa a ser el listado, que ya existe
 * y tiene filtros. Cinco entran de un vistazo; el resto se anuncia con su numero y se va a ver alla.
 */
const POR_TRAMO = 5

export interface GrupoInicio {
  tramo: TramoInicio
  etiqueta: string
  /** Los primeros `POR_TRAMO`, no todos. */
  procesos: Proceso[]
  /** Cuantos hay en total en el tramo, incluidos los que no se listan. */
  total: number
}

const ETIQUETAS: Record<TramoInicio, string> = {
  vencido: 'Vencidos',
  hoy: 'Hoy',
  proximo: 'Próximos días'
}

/**
 * Agrupa los procesos de quien mira por cercania del vencimiento.
 *
 * Solo devuelve los tres tramos accionables. Lo que vence dentro de un mes no es trabajo de hoy, y
 * ponerlo en la misma lista hace que lo urgente deje de destacarse: eso se cuenta aparte con
 * `cuantosMasAdelante`.
 *
 * Un tramo sin procesos no aparece en el resultado — un encabezado "Vencidos" sobre una lista vacia
 * se lee como un error de carga.
 *
 * @param procesos los procesos ya filtrados por asignacion
 * @param hoy dia de referencia, inyectable para poder probar sin depender del reloj
 * @returns los grupos no vacios, de mas urgente a menos
 */
export function agruparPorVencimiento (procesos: Proceso[], hoy = new Date()): GrupoInicio[] {
  return TRAMOS_ACTIVOS
    .map((tramo) => {
      const delTramo = procesos.filter((proceso) => tramoDe(proceso, hoy) === tramo)

      return {
        tramo,
        etiqueta: ETIQUETAS[tramo],
        procesos: delTramo.slice(0, POR_TRAMO),
        total: delTramo.length
      }
    })
    .filter((grupo) => grupo.total > 0)
}

/**
 * Cuenta los procesos que la pantalla no lista.
 *
 * Son dos poblaciones distintas y las dos importan: los que estan en la respuesta pero fuera de los
 * tramos accionables (vencen dentro de un mes, o no tienen fecha), y los que ni siquiera llegaron
 * porque la peticion trae una pagina. Sin el `total` de la API el numero mentiria por lo bajo justo
 * para quien mas trabajo tiene encima.
 *
 * @param procesos los procesos que devolvio la API en esta pagina
 * @param total cuantos hay en total segun `meta.pagination`; sin el, se asume que llegaron todos
 * @param hoy dia de referencia
 * @returns cuantos procesos propios no aparecen listados en el inicio
 */
export function cuantosNoListados (procesos: Proceso[], total = procesos.length, hoy = new Date()): number {
  const listados = agruparPorVencimiento(procesos, hoy)
    .reduce((suma, grupo) => suma + grupo.procesos.length, 0)

  return Math.max(0, total - listados)
}

/**
 * Encuentra el proceso donde quien mira dejo un cronometro corriendo.
 *
 * `timer_activo` viaja en cada proceso del listado, asi que esto no cuesta una peticion extra. Se
 * compara contra `staffId` porque el campo puede traer el cronometro de otra persona sobre la misma
 * tarea: mostrarlo como propio invitaria a detener el trabajo de un companero.
 *
 * @param procesos los procesos del listado
 * @param staffId id de quien mira
 * @returns el proceso con el cronometro propio abierto, o `null`
 */
export function procesoConCronometro (procesos: Proceso[], staffId: number): Proceso | null {
  return procesos.find((proceso) => proceso.timer_activo?.staff_id === staffId) ?? null
}

/** Tramo de un proceso. `due_date` puede faltar, y ahi `estadoVencimiento` responde `sin-fecha`. */
function tramoDe (proceso: Proceso, hoy: Date): EstadoVencimiento {
  return estadoVencimiento(proceso.due_date, hoy)
}

