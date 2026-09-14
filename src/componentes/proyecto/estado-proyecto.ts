import type { TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { EstadoLookup } from '@/datos/recursos'

/**
 * Los dos estados de `project_statuses` que la cabecera pinta con la paleta del sistema.
 *
 * El resto conserva el color que traiga el catalogo: son estados que el panel puede crear y
 * renombrar, y ninguna paleta fija podria seguirles el ritmo. Estos dos si, porque son los que hay
 * que leer sin leer: si el espacio ya esta cerrado o si todavia pide trabajo.
 */
export const ESTADO_EN_DESARROLLO = 2
export const ESTADO_FINALIZADO = 4

/** Los dos estados que la cabecera pinta con la paleta del sistema y anima. */
export const ESTADOS_DESTACADOS = [ESTADO_FINALIZADO, ESTADO_EN_DESARROLLO]

/**
 * Resuelve como se pinta la pildora de estado de la cabecera.
 *
 * Solo dos estados se pintan con la paleta del sistema, y el criterio es "que pide algo de alguien":
 * **finalizado va en verde** porque es el unico que ya no pide nada, y **en desarrollo va en rojo**
 * porque es el que si. Los demas —no iniciado, en espera, cancelado— caen al color del catalogo, que
 * la `Insignia` dibuja como punto y no como fondo: son estados que el panel puede crear y renombrar,
 * y ademas repartir el rojo entre tres estados lo dejaria sin significar nada.
 *
 * @param status id de `project_statuses` que trae el proyecto
 * @param color color del catalogo para ese estado, o `null` si no lo tiene
 * @returns las props de `Insignia` que corresponden a ese estado
 */
export function pildoraDeEstado (status: number, color: string | null): {
  tono?: TonoInsignia
  color?: string | null
} {
  if (status === ESTADO_FINALIZADO) return { tono: 'exito' }
  if (status === ESTADO_EN_DESARROLLO) return { tono: 'peligro' }

  return { color }
}

/**
 * Traduce un id de estado contra `project_statuses`.
 *
 * Existe para el menu de la cabecera, que pinta en optimista: al elegir otro estado hay que
 * mostrarlo antes de que la API confirme, y para eso hace falta resolver un id que todavia no viene
 * en la ficha.
 *
 * @param status id de `project_statuses`
 * @param catalogo `project_statuses` de `lookups`
 * @param respaldo que mostrar si el catalogo no conoce ese id
 * @returns nombre legible y color del estado
 */
export function estadoDelCatalogo (
  status: number,
  catalogo: EstadoLookup[],
  respaldo: { nombre: string, color: string | null }
): { nombre: string, color: string | null } {
  const encontrado = catalogo.find((item) => item.id === status)

  if (encontrado === undefined) return respaldo

  return { nombre: encontrado.name, color: encontrado.color ?? null }
}
