/**
 * Que Espacios puede recibir una Tarea, y como se lee una Licitacion en un selector.
 *
 * Aparte de la carga (`@/datos/espacios-destino`) porque son reglas de presentacion y de mezcla de
 * catalogos: se prueban sin navegador y sin API.
 */
import type { Licitacion, Referencia } from '@/datos/recursos'

/** Lo minimo que hace falta de una Licitacion para ofrecerla como destino de una Tarea. */
export type LicitacionDestino = Pick<Licitacion, 'id' | 'company' | 'espacio'>

/** Los Espacios que puede recibir una Tarea, y cuales de ellos son Licitaciones. */
export interface EspaciosDestino {
  /** Proyectos y Licitaciones en una sola lista, que es lo que consume el selector. */
  espacios: Referencia[]
  /** Los ids de `espacios` que son Licitaciones, para rotularlos y agruparlos. */
  licitaciones: ReadonlySet<number>
}

/**
 * Como se lee una Licitacion en un selector de Espacios.
 *
 * Lleva la empresa delante porque el nombre del Espacio de una licitacion suele ser el del proceso
 * ("Mantencion 2026") y no dice a quien se le esta postulando, que es justo lo que se necesita para
 * no crear la tarea en la licitacion equivocada. Si el nombre ya empieza por la empresa no se
 * repite: "Colbun — Colbun: mantencion" no informa mas que "Colbun: mantencion".
 *
 * @param licitacion la licitacion tal como llega de `GET /licitaciones`
 * @returns el texto que ve quien elige el destino
 */
export function nombreDeLicitacion (licitacion: LicitacionDestino): string {
  const espacio = licitacion.espacio.name.trim()
  const empresa = licitacion.company.trim()

  if (espacio === '') return empresa
  if (empresa === '' || espacio.toLowerCase().startsWith(empresa.toLowerCase())) return espacio

  return `${empresa} — ${espacio}`
}

/**
 * Junta los dos catalogos en la lista unica que consume el selector.
 *
 * Las Licitaciones van **despues** de los Proyectos y no intercaladas: el destino habitual de una
 * tarea es un Proyecto, y el selector ya las separa con un rotulo.
 *
 * Una Licitacion que tambien viniera en `projects` —la ganada, si alguna vez llegara a pedirse sin
 * el filtro de estado— no se duplica: manda la fila del Proyecto y el id no entra al conjunto de
 * licitaciones.
 *
 * @param proyectos lo que devolvio `GET /projects`
 * @param licitaciones lo que devolvio `GET /licitaciones`, o vacio si no se pudo pedir
 * @returns la lista combinada y el conjunto de ids que son Licitacion
 */
export function combinarDestinos (
  proyectos: readonly Referencia[],
  licitaciones: readonly LicitacionDestino[]
): EspaciosDestino {
  const yaEstan = new Set(proyectos.map((proyecto) => proyecto.id))
  const nuevas = licitaciones.filter((licitacion) => !yaEstan.has(licitacion.id))

  return {
    espacios: [
      ...proyectos,
      ...nuevas.map((licitacion) => ({ id: licitacion.id, name: nombreDeLicitacion(licitacion) }))
    ],
    licitaciones: new Set(nuevas.map((licitacion) => licitacion.id))
  }
}
