/**
 * Las propuestas externas de la persona (`GET /ia/propuestas`).
 *
 * Módulo propio por lo mismo que `datos/accesos.ts`: lo consumen la bandeja y el contador de la
 * barra, y la forma viene de un contrato aparte (`docs/contrato-api.md`, § «Servidor MCP externo»).
 * Mientras el backend de esa ruta no esté desplegado, un 404 se lee como «no hay propuestas» y no
 * como un fallo: la sección no puede romper el panel entero.
 */
import { ErrorApi } from './errores.ts'
import { leerPropuestas, type PropuestaExterna } from '../dominio/propuestas.ts'

/** Qué se pide: lo que espera respuesta, o todo el historial reciente. */
export type FiltroDePropuestas = 'pendiente' | 'todas'

/**
 * La ruta de la API para un filtro.
 *
 * @param estado el filtro
 */
export function rutaDePropuestas (estado: FiltroDePropuestas): string {
  return `ia/propuestas?estado=${estado}`
}

/**
 * Convierte lo que devolvió la API en propuestas, o en lista vacía si la ruta no existe todavía.
 *
 * @param datos el `data` de la respuesta
 */
export function propuestasDe (datos: unknown): PropuestaExterna[] {
  return leerPropuestas(datos)
}

/**
 * `true` si el error es «esa ruta no existe»: el backend anterior a las propuestas externas.
 *
 * @param error lo que lanzó la petición
 */
export function esRutaAusente (error: unknown): boolean {
  return error instanceof ErrorApi && (error.codigo === 'not_found' || error.estado === 404)
}
