import type { GrupoGantt } from '@/datos/recursos'

/**
 * Logica pura del diagrama de Gantt: convertir fechas en posiciones de barra.
 *
 * El diagrama se dibuja con CSS propio, sin libreria: lo unico que hace falta es traducir cada rango
 * de fechas a un porcentaje de desplazamiento y de ancho sobre la linea de tiempo del proyecto.
 *
 * Sin imports de valor: el runner de Node no resuelve el alias `@/` fuera de `import type`.
 */

/** Un dia en milisegundos. */
const DIA = 86400000

/** Linea de tiempo del diagrama, en dias UTC desde la epoca. */
export interface RangoGantt {
  /** Primer dia representado. */
  inicio: number
  /** Ultimo dia representado. */
  fin: number
  /** Cantidad de dias que abarca, siempre >= 1. */
  dias: number
}

/**
 * Convierte una fecha `YYYY-MM-DD` en dias UTC desde la epoca.
 *
 * Se parte el texto en vez de usar `new Date(valor)` porque el constructor interpreta la cadena en
 * hora local segun el navegador y corre la fecha un dia hacia atras al oeste de Greenwich.
 *
 * @param valor fecha del contrato, o `null`
 * @returns el dia, o `null` si no viene o no tiene la forma esperada
 */
export function diaDeFecha (valor: string | null | undefined): number | null {
  if (typeof valor !== 'string') return null

  const partes = valor.slice(0, 10).split('-').map(Number)
  const [anio, mes, dia] = partes

  if (anio === undefined || mes === undefined || dia === undefined) return null
  if (partes.some((n) => !Number.isFinite(n))) return null

  return Date.UTC(anio, mes - 1, dia) / DIA
}

/**
 * Calcula la linea de tiempo que cubre a todos los grupos y todas sus tareas.
 *
 * @param grupos los grupos tal como los devuelve `GET /projects/{id}/gantt`
 * @returns el rango, o `null` si ninguna fila trae fechas utilizables — sin fechas no hay diagrama
 */
export function rangoDeGantt (grupos: GrupoGantt[]): RangoGantt | null {
  const dias: number[] = []

  for (const grupo of grupos) {
    for (const valor of [grupo.start, grupo.end]) {
      const dia = diaDeFecha(valor)
      if (dia !== null) dias.push(dia)
    }

    for (const tarea of grupo.tareas) {
      for (const valor of [tarea.start, tarea.end]) {
        const dia = diaDeFecha(valor)
        if (dia !== null) dias.push(dia)
      }
    }
  }

  if (dias.length === 0) return null

  const inicio = Math.min(...dias)
  const fin = Math.max(...dias)

  return { inicio, fin, dias: Math.max(1, fin - inicio + 1) }
}

/** Posicion de una barra dentro de la linea de tiempo, en porcentaje del ancho total. */
export interface Barra {
  izquierda: number
  ancho: number
}

/**
 * Ubica una barra dentro del rango.
 *
 * Una fila con una sola fecha se dibuja como un dia: una barra de ancho cero seria invisible y
 * ocultaria informacion que si existe.
 *
 * @param desde fecha de inicio del tramo
 * @param hasta fecha de fin del tramo
 * @param rango la linea de tiempo del diagrama
 * @returns el desplazamiento y el ancho en porcentaje, o `null` si el tramo no tiene ninguna fecha
 */
export function barraDeGantt (
  desde: string | null,
  hasta: string | null,
  rango: RangoGantt
): Barra | null {
  const a = diaDeFecha(desde)
  const b = diaDeFecha(hasta)

  if (a === null && b === null) return null

  const primero = Math.min(a ?? b ?? rango.inicio, b ?? a ?? rango.inicio)
  const ultimo = Math.max(a ?? b ?? rango.inicio, b ?? a ?? rango.inicio)

  const inicio = Math.max(rango.inicio, primero)
  const fin = Math.min(rango.fin, ultimo)

  if (fin < inicio) return null

  return {
    izquierda: ((inicio - rango.inicio) / rango.dias) * 100,
    ancho: Math.max(((fin - inicio + 1) / rango.dias) * 100, 100 / rango.dias)
  }
}
