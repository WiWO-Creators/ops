/**
 * Reglas de "Mis Tareas": de donde viene cada asignacion y como se pide cada mitad de la hoja.
 *
 * === Por que hacen falta dos consultas y no una ===
 *
 * La hoja separa lo que cuelga de un Espacio de lo que no, y esa separacion la hace el BACKEND, no
 * un filtrado en el navegador: con paginacion, partir la pagina que llego significaria mostrar "12
 * de 340" sobre un recuento que no es el de ninguna de las dos listas. `project_id` esta declarado
 * como filtro de `GET /tasks` —la expresion `CASE WHEN rel_type = "project" THEN rel_id END`— y el
 * nucleo de la API acepta los operadores `__empty` / `__not_empty` sobre cualquier filtro declarado,
 * asi que las dos mitades salen de la misma whitelist y cada una trae su propio total.
 *
 * === Licitacion contra Proyecto ===
 *
 * No hay nada en la Tarea que lo diga: una Licitacion **es** un Espacio (misma fila, mismo id), asi
 * que sus Tareas llegan con `rel_type = "project"` igual que las de un Proyecto. La unica forma de
 * distinguirlas es preguntarle a `GET /licitaciones` que ids de Espacio son suyos, y eso es lo que
 * recibe `origenDeTarea` como conjunto. Sin la lista —la instalacion no tiene el modulo, o la API
 * respondio 403— todo se lee como Proyecto, que es exactamente como se leia antes.
 *
 * === Privada no es huerfana ===
 *
 * Una Tarea **privada** es la que no cuelga de ningun Espacio y tiene dueño; en esta hoja el dueño
 * es siempre quien mira, porque toda la hoja va filtrada por `assignee`. Una Tarea **huerfana** es
 * la que no tiene Espacio NI responsable, y por eso ninguna de las privadas lo es. La distincion no
 * se toca aca: esto solo nombra el origen de lo que ya esta asignado.
 */
import { GLOSARIO } from './glosario.ts'
import type { Proceso } from '@/datos/recursos'

/** Deja solo las Tareas que cuelgan de un Espacio —Proyectos y Licitaciones—. */
export const SOLO_CON_ESPACIO = 'filter[project_id__not_empty]=1'

/** Deja solo las que no cuelgan de ninguno: las privadas. */
export const SOLO_SIN_ESPACIO = 'filter[project_id__empty]=1'

/**
 * De donde viene una Tarea.
 *
 * `otro` es el caso raro y no un error: una Tarea colgada de un Cliente o de un Ticket —relaciones
 * que Perfex admite y este panel no crea— tampoco tiene Espacio, pero llamarla privada seria mentir.
 */
export type ClaseDeOrigen = 'licitacion' | 'espacio' | 'privada' | 'otro'

export interface OrigenDeTarea {
  clase: ClaseDeOrigen
  /** Que es, para la insignia: "Licitación", "Proyecto", "Privada". */
  tipo: string
  /** Como se llama el Espacio del que cuelga, o `null` cuando no cuelga de ninguno. */
  nombre: string | null
  /** Ficha del origen, o `null` cuando no hay nada que abrir. */
  href: string | null
}

/**
 * Nombra el origen de una Tarea para la columna "Origen".
 *
 * @param tarea La Tarea tal como la devuelve `GET /tasks`.
 * @param licitaciones Ids de Espacio que son Licitaciones. Vacio = todo Espacio se lee como Proyecto.
 * @returns Que es el origen, como se llama y a donde lleva.
 */
export function origenDeTarea (tarea: Proceso, licitaciones: ReadonlySet<number>): OrigenDeTarea {
  const espacio = tarea.project

  if (espacio !== null) {
    const esLicitacion = licitaciones.has(espacio.id)

    return {
      clase: esLicitacion ? 'licitacion' : 'espacio',
      tipo: esLicitacion ? GLOSARIO.licitacion.singular : GLOSARIO.espacio.singular,
      nombre: espacio.name,
      href: esLicitacion ? `/licitaciones/${espacio.id}` : `/espacios/${espacio.id}`
    }
  }

  // Sin relacion de ningun tipo: es de quien la tiene asignada y de nadie mas.
  if (tarea.rel_type === null || tarea.rel_type === '') {
    return { clase: 'privada', tipo: 'Privada', nombre: null, href: null }
  }

  return {
    clase: 'otro',
    tipo: `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`,
    nombre: null,
    href: null
  }
}
