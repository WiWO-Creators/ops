/**
 * Piezas que comparten los adaptadores de documentos (`acta`, `tarea`, `ticket-borrador`): leer lo que
 * contesta el board y decidir qué errores HTTP merecen un reintento.
 */

export type Objeto = Record<string, unknown>

/**
 * `true` si el valor es un objeto simple (ni arreglo ni `null`).
 *
 * @param valor lo que se quiere revisar
 */
export function esObjeto (valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/**
 * Abre el sobre `{data: …}` del contrato de la API, si lo trae.
 *
 * @param datos el cuerpo que contestó el board
 * @returns el contenido, o `null` si el cuerpo no es un objeto
 */
export function desenvolver (datos: unknown): Objeto | null {
  if (!esObjeto(datos)) return null

  return esObjeto(datos.data) ? datos.data : datos
}

/**
 * Si un estado HTTP es pasajero y el guardado debe reintentarse más tarde.
 *
 * @param estado el código HTTP
 * @returns `true` para 5xx, 429 y 408
 */
export function esperaTransitoria (estado: number): boolean {
  return estado >= 500 || estado === 429 || estado === 408
}
