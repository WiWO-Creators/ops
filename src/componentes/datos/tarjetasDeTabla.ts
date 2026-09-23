/**
 * Cómo se reparte una fila de tabla cuando se dibuja como tarjeta en el teléfono.
 *
 * Es la decisión pura; `EtiquetadorDeTabla` mide el DOM y escribe el resultado en `data-rol`, y
 * `estilos/movil.css` lo pinta.
 */

/**
 * - `principal`: el título de la tarjeta, a lo ancho y en negrita.
 * - `secundaria`: un dato con su etiqueta encima, en la grilla de dos columnas.
 * - `control-inicio` / `control-fin`: columnas sin encabezado visible (casillas, menú de acciones)
 *   que van a la esquina izquierda o derecha según estén antes o después del título.
 * - `oculta`: no se muestra en la tarjeta.
 */
export type RolDeColumna = 'principal' | 'secundaria' | 'control-inicio' | 'control-fin' | 'oculta'

/** Prioridad que una pantalla puede fijar a mano en `CeldaEncabezado`. */
export type PrioridadDeColumna = 'principal' | 'secundaria' | 'oculta'

export interface ColumnaDeTabla {
  /** Texto visible del encabezado. Vacío = columna de control. */
  etiqueta: string
  /** Columna angosta (id, número, fecha corta): mala candidata a título. */
  angosta: boolean
  /** Prioridad explícita, o `null` para que decida la heurística. */
  prioridad: PrioridadDeColumna | null
}

/**
 * Asigna un rol a cada columna.
 *
 * Sin prioridades explícitas, el título son las primeras `principales` columnas con encabezado que
 * no sean angostas. El descarte de las angostas es lo que hace que "Mis Tareas" titule con el nombre
 * de la tarea y no con su número: la columna del id va primero, pero es angosta.
 *
 * @param columnas encabezados en orden
 * @param principales cuántas columnas forman el título; un valor no entero o negativo vale 1
 * @returns un rol por columna, en el mismo orden
 */
export function repartirColumnas (columnas: ColumnaDeTabla[], principales = 1): RolDeColumna[] {
  const cupo = Number.isInteger(principales) && principales >= 0 ? principales : 1
  const conEtiqueta = (columna: ColumnaDeTabla) => columna.etiqueta.trim() !== ''

  const explicitas = columnas.some((columna) => columna.prioridad === 'principal')
  const titulo = new Set<number>()

  if (explicitas) {
    columnas.forEach((columna, indice) => { if (columna.prioridad === 'principal') titulo.add(indice) })
  } else {
    const candidatas = columnas
      .map((columna, indice) => ({ columna, indice }))
      .filter(({ columna }) => conEtiqueta(columna) && columna.prioridad === null)
    const anchas = candidatas.filter(({ columna }) => !columna.angosta)
    for (const { indice } of (anchas.length > 0 ? anchas : candidatas).slice(0, cupo)) titulo.add(indice)
  }

  // Sin titulo, todos los controles van a la esquina derecha: no hay "antes del titulo".
  const primerTitulo = titulo.size > 0 ? Math.min(...titulo) : -1

  return columnas.map((columna, indice) => {
    if (columna.prioridad === 'oculta') return 'oculta'
    if (titulo.has(indice)) return 'principal'
    if (!conEtiqueta(columna)) return indice < primerTitulo ? 'control-inicio' : 'control-fin'
    return 'secundaria'
  })
}

/**
 * Ubica cada celda de una fila en su columna, respetando `colSpan`.
 *
 * Una celda que abarca todas las columnas (el "Sin resultados" de una tabla vacía) se marca
 * `completa`: no es un dato con etiqueta, es la fila entera.
 *
 * @param extensiones el `colSpan` de cada celda, en orden
 * @param roles el rol de cada columna, de `repartirColumnas`
 * @returns por celda, el rol y el índice de la columna donde empieza
 */
export function ubicarCeldas (
  extensiones: number[],
  roles: RolDeColumna[]
): Array<{ rol: RolDeColumna | 'completa', columna: number }> {
  let columna = 0
  return extensiones.map((crudo) => {
    const extension = Number.isInteger(crudo) && crudo > 0 ? crudo : 1
    const inicio = columna
    columna += extension
    if (extension > 1 && extension >= roles.length) return { rol: 'completa', columna: inicio }
    return { rol: roles[inicio] ?? 'secundaria', columna: inicio }
  })
}
