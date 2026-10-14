import { ESTADO_COMPLETO, ESTADO_FACTURADO } from './tareas.ts'

/**
 * La regla que traduce un estado destino a la escritura que la API acepta.
 *
 * La API **no** cambia el estado por `PATCH /tasks/{id}`: el cambio arrastra una cascada —cierre de
 * los cronometros abiertos, sellado y limpieza de `datefinished`, fila en el feed del proyecto— y
 * por eso vive detras de dos acciones (`modules/api/Escritura/EstadoProceso.php`). Elegir mal la
 * accion no devuelve error: guarda el estado y se saltea la cascada, que es peor que fallar.
 *
 * Las tres cubren el catalogo entero, sea cual sea su tamaño —los estados se crean y se retiran
 * desde el panel de Perfex—: `mark-complete` para "Completo", `mark-billed` para "Facturado" y `reopen` con el `status` destino para
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
  /**
   * Cuerpo JSON, o nada: `mark-complete` y `mark-billed` no llevan, salvo el adjunto del correo de
   * entrega (`delivery_file_id`) al completar.
   */
  cuerpo: { status: number } | { delivery_file_id: number } | undefined
}

/**
 * Traduce un estado destino a la accion de la API que lo aplica con su cascada.
 *
 * @param tareaId id del Proceso
 * @param estado id del estado destino, del catalogo `task_statuses` de `/lookups`
 * @param archivoEntrega adjunto de la tarea que viaja en el correo «tu tarea termino» a los
 *        seguidores-contacto. Solo cuenta al completar; con otro estado se ignora —la API lo
 *        rechazaria—, y un id inutilizable tambien: sin archivo la tarea se completa sin correo
 * @returns la ruta y el cuerpo del `POST`, o `null` si alguno de los dos ids no es utilizable —un
 *          `NaN` que llega desde un `<select>` no tiene que convertirse en una peticion
 */
export function accionDeEstado (tareaId: number, estado: number, archivoEntrega?: number | null): AccionDeEstado | null {
  if (!Number.isSafeInteger(tareaId) || tareaId <= 0) return null
  if (!Number.isSafeInteger(estado) || estado <= 0) return null

  const id = encodeURIComponent(String(tareaId))

  if (estado === ESTADO_COMPLETO) {
    const conArchivo = archivoEntrega !== undefined && archivoEntrega !== null
      && Number.isSafeInteger(archivoEntrega) && archivoEntrega > 0

    return {
      ruta: `tasks/${id}/actions/mark-complete`,
      cuerpo: conArchivo ? { delivery_file_id: archivoEntrega } : undefined
    }
  }
  if (estado === ESTADO_FACTURADO) return { ruta: `tasks/${id}/actions/mark-billed`, cuerpo: undefined }

  return { ruta: `tasks/${id}/actions/reopen`, cuerpo: { status: estado } }
}

/**
 * Lo que la API cuenta del cronometro cuando una tarea pasa a "En progreso" (`meta.timer`).
 *
 * `code` es uno de `iniciado`, `no_asignado`, `sin_jornada`, `facturada` o `no_disponible`. El cambio
 * de estado se aplica siempre; esto solo dice si ademas arranco el cronometro de quien lo hizo.
 */
export interface ArranqueDeCronometro {
  started: boolean
  code: string
  message: string | null
}

/**
 * Lee el bloque `meta.timer` de la respuesta de un cambio de estado.
 *
 * @param meta el `meta` del envelope tal como llego, sin garantias
 * @returns el arranque, o `null` si la respuesta no trae uno valido —la API lo omite cuando el cambio
 *          no fue a En progreso o la persona ya tenia un cronometro corriendo en la tarea
 */
export function leerArranque (meta: unknown): ArranqueDeCronometro | null {
  if (meta === null || typeof meta !== 'object' || !('timer' in meta)) return null

  const timer = (meta as { timer: unknown }).timer

  if (timer === null || typeof timer !== 'object') return null

  const { started, code, message } = timer as Record<string, unknown>

  if (typeof started !== 'boolean' || typeof code !== 'string') return null

  return { started, code, message: typeof message === 'string' && message.trim() !== '' ? message : null }
}
