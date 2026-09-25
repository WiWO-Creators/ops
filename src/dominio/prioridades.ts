import type { TonoInsignia } from '@/componentes/presentadores/Insignia'

/**
 * El tono con el que se pinta cada prioridad, y su nombre en español.
 *
 * === POR QUÉ UN MAPA PROPIO Y NO EL COLOR DE LA API ===
 *
 * `/lookups` trae un color por prioridad de Tarea (`#777`, `#03a9f4`, `#ff6f00`, `#fc2d42`) y la
 * `Insignia` ya lo usa para el punto y el borde. Pero el punto es la señal más débil que tiene el
 * componente, y como fondo esos hexadecimales no sirven: están elegidos para puntos de 8px en el
 * Bootstrap 3 de Perfex, no para contrastar contra texto. Eso está escrito en `Insignia` y no se
 * toca acá.
 *
 * La salida es un tono de la paleta semántica, y el par tinta/relleno de cada uno está medido en
 * los dos temas por `pruebas/contraste.test.js`. Una prioridad no es una categoría cualquiera: es
 * una escala con un extremo que pide atención, así que le corresponde la misma familia de colores
 * que a los avisos del sistema y no una rampa decorativa.
 *
 * === Y ADEMÁS RESUELVE LOS TICKETS ===
 *
 * `ticket_priorities` viene SIN color y en inglés (`Low`, `Medium`, `High`): son las etiquetas por
 * defecto de Perfex, que nadie tradujo. Un mapa por id les da color y nombre de una vez, sin
 * depender de que alguien entre al panel a arreglarlas.
 *
 * === POR QUÉ NO SE APAGA SI ALGUIEN EDITA EL PANEL ===
 *
 * Los estados de Tarea los administra el cliente y por eso su color viene de la base. Las
 * prioridades no: son cuatro, fijas, y significan lo mismo en todos los Proyectos. Un mapa en el
 * código no se desincroniza porque alguien toque un color en Perfex.
 */
interface PrioridadPintada {
  /** Nombre en español, que reemplaza al del catálogo cuando éste viene en inglés. */
  etiqueta: string
  tono: TonoInsignia
}

/**
 * Prioridades de una Tarea (`task_priorities`), por id.
 *
 * `Bajo` va en `contorno` y no en `neutro` a propósito: lo más común es que una Tarea esté en la
 * prioridad de abajo, y con relleno gris la tabla entera se llena de insignias que compiten con las
 * que sí importan. Sin relleno, el ojo va directo a las dos de arriba.
 */
const DE_TAREA: Record<number, PrioridadPintada> = {
  1: { etiqueta: 'Baja', tono: 'contorno' },
  2: { etiqueta: 'Media', tono: 'acento' },
  3: { etiqueta: 'Alta', tono: 'aviso' },
  4: { etiqueta: 'Urgente', tono: 'peligro' }
}

/**
 * Prioridades de un ticket (`ticket_priorities`), por id.
 *
 * Son tres y no cuatro, y no son las mismas que las de Tarea: la `3` de un ticket es su máximo
 * —`High`— mientras que la `3` de una Tarea todavía tiene `Urgente` encima. Por eso el tope de
 * ticket es `peligro` y el de Tarea también, cada uno en su escala. Mapearlos con una sola tabla
 * dejaría el ticket más urgente pintado de ámbar.
 */
const DE_TICKET: Record<number, PrioridadPintada> = {
  1: { etiqueta: 'Baja', tono: 'contorno' },
  2: { etiqueta: 'Media', tono: 'acento' },
  3: { etiqueta: 'Alta', tono: 'peligro' }
}

/** Los catálogos de `/lookups` que esta pieza sabe pintar. */
export type CatalogoDePrioridad = 'task_priorities' | 'ticket_priorities'

/**
 * Cómo pintar una prioridad.
 *
 * Devuelve `null` cuando el valor no es una prioridad conocida, y ahí quien llama sigue con lo que
 * hacía antes —la insignia del catálogo, con su etiqueta cruda—. No se inventa un tono para un id
 * desconocido: un color elegido al azar sobre una escala de urgencia miente.
 *
 * @param valor el `priority` de la entidad, como número o como el texto que trae la URL
 * @param catalogo de qué escala es ese número
 */
export function pintarPrioridad (
  valor: unknown,
  catalogo: CatalogoDePrioridad
): PrioridadPintada | null {
  if (valor === null || valor === undefined || valor === '') return null

  const id = Number(valor)
  if (!Number.isInteger(id)) return null

  const tabla = catalogo === 'task_priorities' ? DE_TAREA : DE_TICKET

  return tabla[id] ?? null
}
