import type { PropuestaDeTarea, PropuestasDelActa, ResultadoDeCreacion } from '@/definiciones/actas'

/** Estado de la primera carga. El error es un texto listo para mostrar, no un envelope. */
export type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: PropuestasDelActa }

/**
 * Qué operación está en vuelo. Una sola a la vez: las tres escriben sobre la misma lista.
 *
 * Al crear se guarda desde qué fila se pidió —`null` si fue la tanda de abajo— para que el spinner
 * aparezca en el botón que se apretó y no en todos los que crean.
 */
export type EnCurso =
  | null
  | { que: 'proponiendo' }
  | { que: 'creando', fila: number | null }
  | { que: 'descartando', id: number }

/**
 * Aplica un cambio a las propuestas de una carga lista; cualquier otra fase queda como estaba.
 *
 * @param carga el estado actual
 * @param cambio recibe las propuestas y devuelve las nuevas
 * @returns la carga con las propuestas cambiadas
 */
function conItems (carga: Carga, cambio: (items: PropuestaDeTarea[]) => PropuestaDeTarea[]): Carga {
  if (carga.fase !== 'listo') return carga

  return { fase: 'listo', datos: { ...carga.datos, items: cambio(carga.datos.items) } }
}

/**
 * Cambia una sola propuesta de la lista, sin volver a pedirla entera.
 *
 * @param carga el estado actual
 * @param propuesta la propuesta como la devolvió la API
 * @returns la carga con esa propuesta reemplazada
 */
export function conPropuesta (carga: Carga, propuesta: PropuestaDeTarea): Carga {
  return conItems(carga, (items) => items.map((item) => item.id === propuesta.id ? propuesta : item))
}

/**
 * Saca una propuesta de la lista.
 *
 * @param carga el estado actual
 * @param id la propuesta descartada
 * @returns la carga sin esa propuesta
 */
export function sinPropuesta (carga: Carga, id: number): Carga {
  return conItems(carga, (items) => items.filter((item) => item.id !== id))
}

/**
 * Baja a "Ya creadas" las propuestas que la API convirtió en Procesos; el resto queda igual.
 *
 * @param carga el estado actual
 * @param creadas las filas creadas de la respuesta de `POST .../crear`
 * @returns la carga con esas propuestas marcadas como creadas
 */
export function conCreadas (carga: Carga, creadas: ResultadoDeCreacion['creadas']): Carga {
  const creadasPorId = new Map(creadas.map((fila) => [fila.propuesta_id, fila]))

  return conItems(carga, (items) => items.map((item) => {
    const creada = creadasPorId.get(item.id)

    if (creada === undefined) return item

    return { ...item, estado: 'creada', task_id: creada.task_id, task_name: creada.name }
  }))
}

/**
 * La confirmación de lo creado, o `null` si no se creó ninguna.
 *
 * @param cuantas las Tareas creadas
 */
export function avisoDeCreadas (cuantas: number): string | null {
  if (cuantas === 0) return null

  return cuantas === 1 ? 'Se creó 1 tarea.' : `Se crearon ${cuantas} tareas.`
}

/**
 * El error de las que no se pudieron crear, con el motivo de cada una, o `null` si no falló ninguna.
 *
 * @param fallidas las filas fallidas de la respuesta de `POST .../crear`
 */
export function errorDeFallidas (fallidas: ResultadoDeCreacion['fallidas']): string | null {
  if (fallidas.length === 0) return null

  return `No se pudieron crear ${fallidas.length === 1 ? '1 tarea' : `${fallidas.length} tareas`}: ${fallidas.map((fila) => fila.error).join(' · ')}`
}
