import { ASISTENTE, GLOSARIO } from './glosario.ts'

/**
 * Cuándo un acta que se está corrigiendo dejó de ser la que se abrió.
 *
 * El editor trabaja sobre una copia: mientras la persona escribe, el Orbe o alguien más pueden
 * guardar una versión nueva. El guardado manda `revision` (el `date_updated` con el que se abrió el
 * editor) y la API contesta 409 si ya no coincide; esto decide cuándo avisarlo antes de que la
 * persona intente guardar y qué decirle.
 */

/** Lo que se necesita para saber si el acta cambió bajo el editor. */
export interface EstadoDeCorreccion {
  /** El editor está abierto. */
  editando: boolean
  /** Lo que se corrige es una traducción: su guardado no compara versiones. */
  esTraduccion: boolean
  /** La API ya rechazó un guardado con 409. */
  conflicto: boolean
  /** El `date_updated` con el que se abrió el editor. */
  revisionBase: string | null
  /** El `date_updated` del acta a la vista ahora (puede haberse recargado). */
  revisionActual: string | null
}

/**
 * Indica si hay que avisar que el acta cambió mientras se corregía.
 *
 * Una traducción no se compara: su PATCH no trae versión, y que cambie el original no invalida lo
 * que se escribe sobre ella.
 *
 * @param estado el estado de la corrección
 * @returns `true` si se muestra el aviso con la acción de recargar
 */
export function hayCambioAjeno (estado: EstadoDeCorreccion): boolean {
  if (!estado.editando || estado.esTraduccion) return false
  if (estado.conflicto) return true

  return estado.revisionBase !== null && estado.revisionActual !== null && estado.revisionBase !== estado.revisionActual
}

/**
 * Indica si un guardado falló porque el acta cambió desde la versión enviada.
 *
 * @param estado el código HTTP de la respuesta, si hubo
 * @param mandoRevision si el guardado llevaba `revision` (sin ella un 409 es otra cosa)
 * @returns `true` si es el conflicto de versión
 */
export function esConflictoDeRevision (estado: number | undefined, mandoRevision: boolean): boolean {
  return estado === 409 && mandoRevision
}

/**
 * El texto del aviso de cambio ajeno.
 *
 * @param conflicto `true` si la API ya rechazó el guardado; `false` si solo se detectó el cambio
 * @returns el mensaje para la persona
 */
export function textoDeCambioAjeno (conflicto: boolean): string {
  const quien = `${ASISTENTE} u otra persona`
  const que = `este ${GLOSARIO.acta.singular}`
  const salida = 'Tu texto sigue en el editor. Si recargas para ver la versión nueva, se descarta lo que escribiste.'

  return conflicto
    ? `${quien} cambió ${que} antes de que guardaras, así que no se guardó nada. ${salida}`
    : `${quien} cambió ${que} mientras lo corregías. ${salida}`
}

/** Lo que el aviso en vivo `acta` dice del cambio: cuál acta y de qué Espacio (`null` si no lo trae). */
export interface CambioDeActaEnVivo {
  id: number | null
  espacio_id: number | null
}

/** Lo que se sabe de la pantalla que recibe el aviso en vivo de un acta. */
export interface PantallaDeActa {
  /** El Espacio del panel de actas. */
  espacioId: number
  /** El acta abierta en el detalle, o `null` si lo que se ve es la lista. */
  actaAbiertaId: number | null
  /** Se corrige en edición conjunta: el servicio ya fusiona los cambios en el documento compartido. */
  conjunta: boolean
}

/**
 * Indica si el aviso en vivo `acta` toca a este Espacio.
 *
 * El aviso llega por la sala del Espacio, así que `espacio_id` casi siempre coincide; se comprueba
 * igual porque un aviso de otro Espacio no debe recargar nada. Sin `espacio_id` se asume que sí.
 *
 * @param cambio el aviso del bus
 * @param espacioId el Espacio del panel
 * @returns `true` si la lista de actas debe revalidarse
 */
export function debeRevalidarListaDeActas (cambio: CambioDeActaEnVivo, espacioId: number): boolean {
  return cambio.espacio_id === null || cambio.espacio_id === espacioId
}

/**
 * Indica si el acta abierta debe revalidarse por un aviso en vivo.
 *
 * Revalidar no pisa nada: el editor normal lleva su propia copia, y es justo la revisión nueva la que
 * enciende el aviso de cambio ajeno (`hayCambioAjeno`) en vez de reemplazar lo que se escribe. La
 * única excepción es la edición conjunta, donde el servicio ya fusiona el cambio en el documento
 * compartido y una lectura aparte solo traería una versión intermedia. Un aviso sin id (el servicio
 * no supo cuál) cuenta como «puede ser esta».
 *
 * @param cambio el aviso del bus
 * @param pantalla el Espacio, el acta abierta y si se corrige en conjunto
 * @returns `true` si el detalle debe volver a pedir su acta en silencio
 */
export function debeRevalidarActaAbierta (cambio: CambioDeActaEnVivo, pantalla: PantallaDeActa): boolean {
  if (pantalla.actaAbiertaId === null || pantalla.conjunta) return false
  if (!debeRevalidarListaDeActas(cambio, pantalla.espacioId)) return false

  return cambio.id === null || cambio.id === pantalla.actaAbiertaId
}
