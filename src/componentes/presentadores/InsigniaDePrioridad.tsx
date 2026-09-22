import { Insignia } from '@/componentes/presentadores/Insignia'
import { pintarPrioridad, type CatalogoDePrioridad } from '@/dominio/prioridades'

interface PropsInsigniaDePrioridad {
  /** El `priority` de la entidad, tal como lo devuelve la API. */
  valor: unknown
  catalogo: CatalogoDePrioridad
  /**
   * Qué pintar si el id no está en la escala conocida.
   *
   * Es lo que la pantalla pintaba antes de existir esta pieza: la etiqueta del catálogo con su
   * color. Se pasa en vez de resolverse acá porque cada pantalla ya lo tiene resuelto de maneras
   * distintas —`valorDeCatalogo`, el objeto anidado del recurso— y volver a pedirlo sería una
   * segunda lectura del mismo dato.
   */
  respaldo?: { etiqueta: string, color?: string | null }
  tamano?: 'chico' | 'medio'
}

/**
 * La prioridad de una Tarea o de un ticket, como insignia con color.
 *
 * Existe para los tres sitios que pintan una prioridad sin pasar por `TablaRecurso` ni por
 * `EstadoDelPortal`: el detalle de la Tarea, la Tarea compartida por enlace público y la pantalla
 * de pared. Sin esto, cada uno resolvía el color por su cuenta y la pantalla de pared directamente
 * no lo hacía.
 *
 * El tono sale de `dominio/prioridades` y no del catálogo. El porqué está ahí; lo corto es que una
 * prioridad es una escala de urgencia y le toca la paleta semántica, que está validada a contraste,
 * y no un hexadecimal pensado para un punto de 8px.
 */
export function InsigniaDePrioridad ({
  valor,
  catalogo,
  respaldo,
  tamano = 'chico'
}: PropsInsigniaDePrioridad) {
  const prioridad = pintarPrioridad(valor, catalogo)

  if (prioridad !== null) {
    return <Insignia tono={prioridad.tono} tamano={tamano}>{prioridad.etiqueta}</Insignia>
  }

  // Un id fuera de la escala: se muestra lo que haya, sin inventarle un tono. Pintar de rojo un
  // valor que no se sabe leer es peor que mostrarlo gris.
  if (respaldo === undefined) return null

  return (
    <Insignia tamano={tamano} color={respaldo.color ?? undefined}>{respaldo.etiqueta}</Insignia>
  )
}
