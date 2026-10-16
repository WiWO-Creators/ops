import type { Document } from '@hocuspocus/server'

import { registrar } from '../registro.ts'
import type { EstadoDeDocumento } from './tipos.ts'

/**
 * Piezas que comparten los adaptadores de documentos (`acta`, `tarea`, `ticket-borrador`): leer lo que
 * contesta el board, decidir qué errores HTTP merecen un reintento y qué hacer cuando el board niega
 * guardar como una persona.
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

/**
 * El board negó guardar como `estado.ultimoEditor` (403/404): esa persona no puede escribir aquí.
 *
 * No se cierra el documento para todos. Se la descarta: deja de figurar como autora, no vuelve a
 * contarse en `onChange`, sus conexiones abiertas pasan a solo lectura y el último editor pasa a ser
 * otra persona que haya escrito desde el último guardado. Sus cambios ya mezclados en el documento no
 * se pueden separar, así que se guardan con quien sí tiene permiso (o se descartan si no queda nadie,
 * recargando del board).
 *
 * @param documento el documento abierto
 * @param estado el estado del documento
 * @param nombre el nombre del documento, para el registro
 * @returns `true` si queda otra persona con quien reintentar el guardado
 */
export function descartarEditorSinPermiso (documento: Document, estado: EstadoDeDocumento, nombre: string): boolean {
  const descartado = estado.ultimoEditor

  if (descartado === null) return false

  estado.vetados.add(descartado)
  estado.autores.delete(descartado)
  estado.ultimoEditor = [...estado.autores].at(-1) ?? null
  registrar({ evento: 'guardado_sin_permiso', documento: nombre, staff: descartado, quedan: estado.autores.size })

  for (const conexion of documento.connections.keys()) {
    if ((conexion.context as { staffId?: number } | undefined)?.staffId === descartado) conexion.readOnly = true
  }

  return estado.ultimoEditor !== null
}
