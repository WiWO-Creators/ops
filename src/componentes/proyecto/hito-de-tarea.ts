import { TOPE_DE_HITOS } from './hitos.ts'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * Logica pura del menu que cambia el Hito de una Tarea desde su ficha.
 *
 * Vive fuera del `.tsx` por la razon de siempre en este proyecto: Node sabe despojar los tipos de un
 * `.ts` pero no el JSX, asi que una funcion declarada dentro del componente no se puede probar. Aca
 * no hay React ni `fetch`: la peticion la hace quien la llama.
 */

/**
 * Ruta del BFF que trae los hitos de un Espacio, ya paginada al tope que acepta la API.
 *
 * No hay catalogo global de hitos —un hito pertenece a un Espacio— y por eso la ficha no los puede
 * pedir junto con `/lookups`: hasta que no se sabe de que Espacio es la Tarea no hay lista que traer.
 *
 * @param espacioId id del Espacio de la Tarea
 * @returns la ruta relativa para `pedirRespuesta`, sin barra inicial
 */
export function rutaHitosDeEspacio (espacioId: number): string {
  return `projects/${encodeURIComponent(String(espacioId))}/milestones?per_page=${TOPE_DE_HITOS}`
}

/**
 * Nombre que se pinta para un hito elegido.
 *
 * El cambio se dibuja en optimista antes de que la API conteste, asi que la etiqueta sale de las
 * opciones ya cargadas y no de la Tarea, que todavia trae el hito viejo. El respaldo cubre el estado
 * inicial, cuando el menu nunca se abrio y no hay opciones que mirar.
 *
 * @param opciones las opciones del menu, tal como las arma `opcionesDeFiltroDeHito`
 * @param id id del hito elegido — `0` es la columna sintetica "Sin hito"
 * @param respaldo que mostrar si ese id no esta entre las opciones
 * @returns la etiqueta a pintar
 */
export function etiquetaDeHito (opciones: OpcionFiltro[], id: number, respaldo: string): string {
  return opciones.find((opcion) => opcion.valor === String(id))?.etiqueta ?? respaldo
}
