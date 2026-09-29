import { LOCALE } from '../lib/fechas.ts'
import type { ComparacionMensual, ReporteMensual, TareaDelReporte } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'

/**
 * Lectura del reporte mensual del cliente (`GET /portal/reporte-mensual`).
 *
 * Todo lo que la pantalla decide sobre los datos vive acá y no en los componentes: que escribir
 * cuando un mes se compara contra otro, como se agrupan las tareas por Proyecto, que serie de la
 * tendencia existe. Son funciones puras y por eso se prueban sin navegador.
 */

/** El resumen del mes, normalizado: la API lo manda como `[]` cuando ningun bloque tiene pestaña. */
export type ResumenDelReporte = Exclude<ReporteMensual['resumen'], []>

/**
 * El resumen como objeto, aunque la API lo haya mandado como lista vacia.
 *
 * @param reporte el reporte tal como llego
 * @returns las cifras disponibles; una clave ausente es un bloque que el cliente no ve
 */
export function resumenDelReporte (reporte: Pick<ReporteMensual, 'resumen'>): ResumenDelReporte {
  return Array.isArray(reporte.resumen) ? {} : reporte.resumen
}

/**
 * El nombre del mes, en minuscula y sin año: «agosto».
 *
 * @param mes `YYYY-MM`
 * @returns el nombre del mes, o el texto recibido si no es un mes
 */
export function nombreDelMes (mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)

  if (anio === undefined || numero === undefined || !Number.isInteger(anio) || numero < 1 || numero > 12) return mes

  return new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(anio, numero - 1, 1)))
}

/**
 * La cifra del mes dicha contra el mes anterior: «3 más que en agosto».
 *
 * @param comparacion la cifra del mes y la del anterior
 * @param mesAnterior `YYYY-MM` del mes con que se compara
 * @param formatear como se escribe la diferencia, con su unidad; por omision, el numero a secas
 * @returns la frase de la comparacion
 */
export function frenteAlAnterior (
  comparacion: ComparacionMensual,
  mesAnterior: string,
  formatear: (valor: number) => string = (valor) => String(valor)
): string {
  const mes = nombreDelMes(mesAnterior)
  const diferencia = comparacion.actual - comparacion.anterior

  if (diferencia === 0) return `igual que en ${mes}`

  return diferencia > 0
    ? `${formatear(diferencia)} más que en ${mes}`
    : `${formatear(-diferencia)} menos que en ${mes}`
}

/**
 * Segundos como horas legibles: «12 h 30 min», «45 min», «0 h».
 *
 * @param segundos total de segundos; lo negativo o no finito cuenta como cero
 * @returns el texto
 */
export function formatearHoras (segundos: number): string {
  const seguro = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  const horas = Math.floor(seguro / 3600)
  const minutos = Math.floor((seguro % 3600) / 60)

  if (horas === 0) return minutos === 0 ? '0 h' : `${minutos} min`

  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`
}

/** Un Proyecto con sus tareas, en el orden en que llegaron. */
export interface GrupoDeProyecto {
  proyecto: Referencia
  tareas: TareaDelReporte[]
}

/**
 * Agrupa las tareas por Proyecto sin reordenarlas: la API ya las manda en el orden que importa.
 *
 * @param tareas las tareas de un bloque
 * @returns un grupo por Proyecto, en el orden de su primera tarea
 */
export function agruparPorProyecto (tareas: readonly TareaDelReporte[]): GrupoDeProyecto[] {
  const grupos = new Map<number, GrupoDeProyecto>()

  for (const tarea of tareas) {
    const grupo = grupos.get(tarea.project.id) ?? { proyecto: tarea.project, tareas: [] }
    grupo.tareas.push(tarea)
    grupos.set(tarea.project.id, grupo)
  }

  return [...grupos.values()]
}

/**
 * Donde se abre una tarea en el portal: su Proyecto, pestaña Tareas, con la ficha abierta.
 *
 * @param tarea la tarea del reporte
 * @param parametro el nombre del parametro de la ficha (`PARAMETRO_TAREA`)
 * @returns la ruta
 */
export function enlaceATarea (tarea: Pick<TareaDelReporte, 'id' | 'project'>, parametro: string): string {
  return `/portal/proyectos/${tarea.project.id}?tab=tasks&${parametro}=${tarea.id}`
}

/**
 * Donde se abre un Meeting Paper en el portal.
 *
 * @param reunion el acta del reporte
 * @returns la ruta
 */
export function enlaceAReunion (reunion: { id: number, project: Referencia }): string {
  return `/portal/proyectos/${reunion.project.id}?tab=actas&acta=${reunion.id}`
}

/** Las series que puede traer la tendencia, en el orden en que se dibujan. */
export type SerieDeReporte = 'completadas' | 'entregables' | 'reuniones'

/** La tendencia lista para dibujar. */
export interface LecturaDeTendenciaDelReporte {
  /** Las series que llegaron: una clave ausente es una pestaña que el cliente no ve. */
  series: SerieDeReporte[]
  meses: Array<{ mes: string, rotulo: string, valores: Partial<Record<SerieDeReporte, number>> }>
  /** El mayor valor de todas las series, para la escala comun; nunca menor que 1. */
  maximo: number
  /** Si todos los valores son cero: no hay nada que comparar. */
  vacia: boolean
}

/**
 * Lee la tendencia de seis meses del reporte.
 *
 * @param tendencia la serie tal como llego, o `undefined` si no vino
 * @returns la lectura, o `null` si la serie no vino
 */
export function leerTendenciaDelReporte (
  tendencia: ReporteMensual['tendencia']
): LecturaDeTendenciaDelReporte | null {
  if (tendencia === undefined || tendencia.length === 0) return null

  const posibles: SerieDeReporte[] = ['completadas', 'entregables', 'reuniones']
  const series = posibles.filter((serie) => tendencia.some((punto) => typeof punto[serie] === 'number'))
  let maximo = 0

  const meses = tendencia.map((punto) => {
    const valores: Partial<Record<SerieDeReporte, number>> = {}

    for (const serie of series) {
      const valor = punto[serie] ?? 0
      valores[serie] = valor
      maximo = Math.max(maximo, valor)
    }

    return { mes: punto.mes, rotulo: nombreDelMes(punto.mes).slice(0, 3), valores }
  })

  return { series, meses, maximo: Math.max(1, maximo), vacia: maximo === 0 }
}

/**
 * El alto de una barra en porcentaje de la escala, con un minimo visible para lo que no es cero.
 *
 * @param valor el valor
 * @param maximo el tope de la escala
 * @returns el alto, 0 a 100
 */
export function altoRelativo (valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0

  return Math.max(4, Math.round((valor * 100) / maximo))
}
