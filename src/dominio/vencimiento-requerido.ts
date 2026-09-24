import { relTypeDeRelacion } from './espacios-destino.ts'

/**
 * Fecha de vencimiento exigida por el cliente.
 *
 * La regla vive en la API (`VencimientoPorCliente`): una Tarea cuyo cliente no esta habilitado para
 * ir sin fecha tiene que llevar `due_date`. El cliente sale de la relacion —`customer` es el cliente
 * mismo, `project` es el `clientid` del Proyecto— y una Tarea sin cliente puede ir sin fecha
 * siempre. Si no, `422` con `due_date: ['requerido_por_cliente']`.
 *
 * Lo que hay aca es la cortesia del formulario: saber de antemano que relaciones hay que consultar,
 * juntar las respuestas y cortar el guardado antes del viaje. **Quien decide sigue siendo la API**:
 * una consulta que falla no bloquea nada, y el `422` llega igual.
 */

/** El texto del corte, el mismo que arma `mensajeConDetalles` con el `422` de la API. */
export const MENSAJE_VENCIMIENTO_REQUERIDO = 'Este cliente exige fecha de vencimiento.'

/** Una relacion que puede llevar a un cliente, con la forma que pide la consulta. */
export interface RelacionConCliente {
  rel_type: 'project' | 'customer'
  rel_id: number
}

/**
 * La relacion que hay que consultar, o `null` si no puede llevar a ningun cliente.
 *
 * Solo `project` —Proyecto, Licitacion y Upsell— y `customer` llegan a un cliente. Un `rel_type`
 * retirado, una relacion sin elegir o un id que no es un entero positivo no se consultan: la API
 * tampoco les encontraria cliente, y la respuesta seria `false` de todos modos.
 *
 * @param relacion la relacion del selector o un `rel_type` crudo (`''` sin relacion)
 * @param relacionId el id elegido, como texto o numero
 * @returns la relacion lista para la consulta, o `null`
 */
export function relacionQuePuedeExigir (relacion: string, relacionId: string | number | null): RelacionConCliente | null {
  const relType = relTypeDeRelacion(relacion)

  if (relType !== 'project' && relType !== 'customer') return null
  if (relacionId === null || relacionId === '') return null

  const id = Number(relacionId)

  if (!Number.isSafeInteger(id) || id < 1) return null

  return { rel_type: relType, rel_id: id }
}

/**
 * La ruta del BFF que contesta si una relacion exige fecha.
 *
 * @param relacion la relacion a consultar
 * @returns `tasks/vencimiento-requerido?rel_type=…&rel_id=…`
 */
export function rutaDeVencimientoRequerido (relacion: RelacionConCliente): string {
  return `tasks/vencimiento-requerido?rel_type=${encodeURIComponent(relacion.rel_type)}&rel_id=${encodeURIComponent(String(relacion.rel_id))}`
}

/**
 * Si alguna de las respuestas exige fecha.
 *
 * El alta en varios Proyectos crea una Tarea por destino con la misma fecha: si uno solo la exige,
 * la fecha hace falta. Una respuesta `null` es una consulta que fallo y no cuenta: no se bloquea por
 * no saber, que para eso esta el `422` de la API.
 *
 * @param respuestas lo que contesto cada consulta; `null` si fallo
 * @returns `true` si al menos una contesto que si
 */
export function algunaExigeVencimiento (respuestas: ReadonlyArray<boolean | null>): boolean {
  return respuestas.some((respuesta) => respuesta === true)
}

/**
 * El corte previo al guardado: falta la fecha y la relacion la exige.
 *
 * @param requerido si la relacion final exige fecha
 * @param vencimiento la fecha del formulario, `YYYY-MM-DD` o `''`
 * @returns el mensaje del corte, o `null` si se puede guardar
 */
export function errorDeVencimientoRequerido (requerido: boolean, vencimiento: string): string | null {
  return requerido && vencimiento.trim() === '' ? MENSAJE_VENCIMIENTO_REQUERIDO : null
}

/** Lo que dice el masivo cuando el lote entero se rechaza por la fecha. */
export const MENSAJE_MASIVO_VENCIMIENTO_REQUERIDO =
  'Alguna tarea no tiene fecha de vencimiento y el cliente de destino la exige.'

/**
 * El mensaje del `422` de `POST /tasks/bulk` cuando la causa es la fecha exigida.
 *
 * Mover en lote a un Proyecto rechaza el lote entero si una sola Tarea sin fecha cae en un cliente
 * que la exige. «Este cliente exige…» ahi confunde —son varias Tareas y el cliente es el del
 * destino—, asi que el masivo lo dice a su manera.
 *
 * @param detalles los `details` del error del contrato
 * @returns el mensaje del masivo, o `null` si el error es otro
 */
export function mensajeMasivoDeVencimiento (detalles: Record<string, unknown> | undefined): string | null {
  const motivos = detalles?.due_date

  return Array.isArray(motivos) && motivos.includes('requerido_por_cliente')
    ? MENSAJE_MASIVO_VENCIMIENTO_REQUERIDO
    : null
}
