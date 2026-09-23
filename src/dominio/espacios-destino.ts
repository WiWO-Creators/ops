/**
 * Que Espacios puede recibir una Tarea, y como se lee una Licitacion en un selector.
 *
 * Aparte de la carga (`@/datos/espacios-destino`) porque son reglas de presentacion y de mezcla de
 * catalogos: se prueban sin navegador y sin API.
 */
import type { Licitacion, Referencia, Upsell } from '@/datos/recursos'

/** Lo minimo que hace falta de una Licitacion para ofrecerla como destino de una Tarea. */
export type LicitacionDestino = Pick<Licitacion, 'id' | 'company' | 'espacio'>

/** Lo minimo que hace falta de un Upsell para ofrecerlo como destino de una Tarea. */
export type UpsellDestino = Pick<Upsell, 'id' | 'client' | 'espacio'>

/** Los Espacios que puede recibir una Tarea, y cuales de ellos son Licitaciones o Upsells. */
export interface EspaciosDestino {
  /** Proyectos, Licitaciones y Upsells en una sola lista. */
  espacios: Referencia[]
  /** Los ids de `espacios` que son Licitaciones. */
  licitaciones: ReadonlySet<number>
  /** Los ids de `espacios` que son Upsells. */
  upsells: ReadonlySet<number>
}

/**
 * Con que se relaciona una Tarea, tal como lo elige quien la crea o la edita.
 *
 * Proyecto, Licitacion y Upsell son las tres un Espacio —viajan como `rel_type` `project` con el id
 * del Espacio—; se separan solo para que el selector ofrezca cada catalogo por su lado. Cliente es
 * la unica relacion que no es un Espacio.
 */
export type RelacionTarea = 'project' | 'licitacion' | 'upsell' | 'customer'

/** Las relaciones que se ofrecen, en el orden del selector. */
export const RELACIONES_TAREA: readonly RelacionTarea[] = ['project', 'licitacion', 'upsell', 'customer']

/**
 * Los `rel_type` de Perfex que el panel ya no ofrece, con el nombre que se les muestra.
 *
 * Siguen existiendo en Tareas viejas: la edicion los muestra para no borrarlos en silencio, pero no
 * se pueden elegir de nuevo.
 */
export const RELACIONES_RETIRADAS: Readonly<Record<string, string>> = {
  lead: 'Prospecto',
  contract: 'Contrato',
  ticket: 'Ticket',
  invoice: 'Factura',
  estimate: 'Presupuesto',
  proposal: 'Propuesta',
  expense: 'Gasto'
}

/** True si la relacion es un Espacio —Proyecto, Licitacion o Upsell— y no un Cliente. */
export function esRelacionDeEspacio (relacion: string): boolean {
  return relacion === 'project' || relacion === 'licitacion' || relacion === 'upsell'
}

/**
 * El `rel_type` que entiende la API para una relacion del selector.
 *
 * @param relacion la relacion elegida, o un `rel_type` retirado que la Tarea ya tenia
 * @returns `project` para los tres Espacios; el mismo valor para cualquier otro
 */
export function relTypeDeRelacion (relacion: string): string {
  return esRelacionDeEspacio(relacion) ? 'project' : relacion
}

/**
 * De que clase es un Espacio del catalogo.
 *
 * @param id el id del Espacio
 * @param destinos el catalogo cargado
 * @returns `licitacion` o `upsell` si lo es; `project` para todo lo demas, incluido un id ausente
 */
export function claseDeEspacio (
  id: number, destinos: Pick<EspaciosDestino, 'licitaciones' | 'upsells'>
): 'project' | 'licitacion' | 'upsell' {
  if (destinos.licitaciones.has(id)) return 'licitacion'
  if (destinos.upsells.has(id)) return 'upsell'

  return 'project'
}

/**
 * Los Espacios del catalogo que pertenecen a una clase, para el selector de esa clase.
 *
 * @param destinos el catalogo cargado
 * @param clase la relacion elegida; para `customer` no hay Espacios
 * @returns la parte del catalogo de esa clase, en su orden
 */
export function espaciosDeClase (
  destinos: Pick<EspaciosDestino, 'licitaciones' | 'upsells'> & { espacios: readonly Referencia[] },
  clase: RelacionTarea
): Referencia[] {
  if (clase === 'customer') return []

  return destinos.espacios.filter((espacio) => claseDeEspacio(espacio.id, destinos) === clase)
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
  return nombreConEmpresa(licitacion.company, licitacion.espacio.name)
}

/**
 * Como se lee un Upsell en un selector: el cliente delante, por el mismo motivo que la Licitacion.
 *
 * @param upsell el upsell tal como llega de `GET /upsells`
 * @returns el texto que ve quien elige el destino
 */
export function nombreDeUpsell (upsell: UpsellDestino): string {
  return nombreConEmpresa(upsell.client?.company ?? '', upsell.espacio.name)
}

/**
 * Antepone la empresa al nombre del Espacio, salvo que ya empiece por ella.
 *
 * @param empresa a quien se le vende o se le postula
 * @param nombre el nombre del Espacio
 */
function nombreConEmpresa (empresa: string, nombre: string): string {
  const espacio = nombre.trim()
  const limpia = empresa.trim()

  if (espacio === '') return limpia
  if (limpia === '' || espacio.toLowerCase().startsWith(limpia.toLowerCase())) return espacio

  return `${limpia} — ${espacio}`
}

/**
 * Junta los catalogos en la lista unica que consume el selector.
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
 * @param upsells lo que devolvio `GET /upsells`, o vacio si no se pudo pedir
 * @returns la lista combinada y los conjuntos de ids que son Licitacion y Upsell
 */
export function combinarDestinos (
  proyectos: readonly Referencia[],
  licitaciones: readonly LicitacionDestino[],
  upsells: readonly UpsellDestino[] = []
): EspaciosDestino {
  const yaEstan = new Set(proyectos.map((proyecto) => proyecto.id))
  const nuevas = licitaciones.filter((licitacion) => !yaEstan.has(licitacion.id))

  for (const licitacion of nuevas) yaEstan.add(licitacion.id)

  const nuevos = upsells.filter((upsell) => !yaEstan.has(upsell.id))

  return {
    espacios: [
      ...proyectos,
      ...nuevas.map((licitacion) => ({ id: licitacion.id, name: nombreDeLicitacion(licitacion) })),
      ...nuevos.map((upsell) => ({ id: upsell.id, name: nombreDeUpsell(upsell) }))
    ],
    licitaciones: new Set(nuevas.map((licitacion) => licitacion.id)),
    upsells: new Set(nuevos.map((upsell) => upsell.id))
  }
}
