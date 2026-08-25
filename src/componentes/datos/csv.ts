/**
 * Exportacion a CSV de lo que la vista esta mostrando.
 *
 * Vive en un `.ts` aparte del componente para poder probarse con el runner de Node, y no depende de
 * React ni del DOM: recibe filas y columnas y devuelve texto.
 *
 * Sin `import` de valores con alias `@/`: el runner de Node no resuelve el alias.
 */

import type { Columna } from '@/definiciones/tipos'

/**
 * Texto de una celda a partir de lo que devolvio `presentar`.
 *
 * Los presentadores de una definicion devuelven `ReactNode`. Los de este proyecto devuelven texto o
 * numero, pero un elemento JSX se colaria como "[object Object]": por eso lo que no es primitivo sale
 * vacio, que es honesto, en vez de basura dentro de la planilla.
 *
 * @param valor Lo que devolvio el presentador de la columna.
 * @returns El texto de la celda; cadena vacia si no habia nada que escribir.
 */
export function celdaComoTexto (valor: unknown): string {
  if (valor === null || valor === undefined || typeof valor === 'boolean') return ''
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : ''
  if (typeof valor === 'string') return valor

  return ''
}

/**
 * Escapa un campo segun RFC 4180.
 *
 * Se entrecomilla siempre que aparezca el separador, una comilla o un salto de linea; las comillas
 * internas se duplican. Sin esto, un nombre de proyecto con coma parte la fila en dos columnas.
 */
function escapar (texto: string): string {
  if (!/[",\r\n]/.test(texto)) return texto

  return `"${texto.replace(/"/g, '""')}"`
}

/**
 * Arma el contenido de un CSV a partir de las columnas visibles y las filas en pantalla.
 *
 * Exporta exactamente lo que se ve: las columnas que quedaron activas y la pagina vigente. No vuelve
 * a pedir nada al servidor, porque exportar "todo" a espaldas de los filtros es la forma mas facil de
 * entregar una planilla que no coincide con la pantalla que la origino.
 *
 * @param columnas Columnas visibles, en el orden en que se muestran.
 * @param filas Filas de la pagina vigente.
 * @returns El CSV completo, con encabezado y saltos `\r\n`.
 */
export function armarCsv<T> (columnas: Array<Columna<T>>, filas: T[]): string {
  const lineas = [columnas.map((columna) => escapar(columna.encabezado)).join(',')]

  for (const fila of filas) {
    lineas.push(columnas.map((columna) => escapar(celdaComoTexto(columna.presentar(fila)))).join(','))
  }

  return lineas.join('\r\n')
}

/**
 * Nombre del archivo de la exportacion, con la fecha del dia.
 *
 * @param recurso Nombre visible del recurso en plural. Ej: `Proyectos`.
 * @param hoy Fecha de referencia; parametro para poder probarlo.
 * @returns Un nombre sin espacios ni acentos, terminado en `.csv`.
 */
export function nombreDeExportacion (recurso: string, hoy: Date): string {
  const base = recurso
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()

  return `${base}-${hoy.toISOString().slice(0, 10)}.csv`
}
