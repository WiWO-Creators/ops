import { ESTADO_COMPLETO } from './tareas.ts'

/**
 * La regla que traduce un estado destino a la escritura que la API acepta.
 *
 * La API **no** cambia el estado por `PATCH /tasks/{id}`: el cambio arrastra una cascada —cierre de
 * los cronometros abiertos, sellado y limpieza de `datefinished`, fila en el feed del proyecto— y
 * por eso vive detras de dos acciones (`modules/api/Escritura/EstadoProceso.php`). Elegir mal la
 * accion no devuelve error: guarda el estado y se saltea la cascada, que es peor que fallar.
 *
 * Las dos cubren el catalogo entero, sea cual sea su tamaño —los estados se crean y se retiran
 * desde el panel de Perfex—: `mark-complete` para "Completo" y `reopen` con el `status` destino para
 * cualquier otro, venga la tarea de estar completa o no —`reabrir()` limpia `datefinished` aunque ya
 * estuviera vacio—.
 *
 * Vive fuera del `.tsx` por la razon de siempre en este proyecto: Node sabe despojar los tipos de un
 * `.ts` pero no el JSX, asi que una funcion declarada dentro del componente no se puede probar. Aca
 * no hay React ni `fetch`: la peticion la hace quien la llama.
 */

/** La accion de la API que aplica un estado destino, ya con su ruta y su cuerpo. */
export interface AccionDeEstado {
  /** Ruta del BFF, sin barra inicial. */
  ruta: string
  /** Cuerpo JSON, o nada: `mark-complete` no lleva. */
  cuerpo: { status: number } | undefined
}

/**
 * Traduce un estado destino a la accion de la API que lo aplica con su cascada.
 *
 * @param tareaId id del Proceso
 * @param estado id del estado destino, del catalogo `task_statuses` de `/lookups`
 * @returns la ruta y el cuerpo del `POST`, o `null` si alguno de los dos ids no es utilizable —un
 *          `NaN` que llega desde un `<select>` no tiene que convertirse en una peticion
 */
export function accionDeEstado (tareaId: number, estado: number): AccionDeEstado | null {
  if (!Number.isSafeInteger(tareaId) || tareaId <= 0) return null
  if (!Number.isSafeInteger(estado) || estado <= 0) return null

  const id = encodeURIComponent(String(tareaId))

  return estado === ESTADO_COMPLETO
    ? { ruta: `tasks/${id}/actions/mark-complete`, cuerpo: undefined }
    : { ruta: `tasks/${id}/actions/reopen`, cuerpo: { status: estado } }
}
