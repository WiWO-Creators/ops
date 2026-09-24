'use client'

import { TareasAsignadas } from '@/componentes/mis-tareas/TareasAsignadas'
import { GLOSARIO } from '@/dominio/glosario'
import type { CatalogosDeTareas } from '@/datos/recursos'

/**
 * El orden de la lista: primero lo nuevo y lo que está en curso, después lo devuelto con cambios, lo
 * que espera al cliente y al final lo completo (`sort=etapa` de la API); dentro de cada escalón, la
 * prioridad más alta arriba, y a igual prioridad, lo que vence antes.
 */
const ORDEN_DEL_AREA = 'etapa,-priority,due_date'

interface Props {
  /** Las áreas del EQUIPO (`tblareas`) cuyo trabajo se lista. Vacía, no se dibuja nada. */
  areaIds: number[]
  titulo: string
  catalogos: CatalogosDeTareas
}

/**
 * Las Tareas abiertas que tiene asignadas la gente de una o varias áreas.
 *
 * Filtra por `filter[area_asignado]`, el área del equipo de quien la tiene asignada, y no por el
 * campo "Área" de la compañía que lleva cada Tarea: lo que se está mirando es el organigrama, así que
 * el trabajo de un área es el de su gente. Qué Tareas alcanza cada quien lo recorta la API.
 *
 * La tabla es la misma de "Mis Tareas" y de la ficha de una persona; solo cambia el filtro fijo y el
 * orden.
 *
 * @returns la sección con la tabla paginada, o nada si no hay áreas
 */
export function TareasDelArea ({ areaIds, titulo, catalogos }: Props) {
  if (areaIds.length === 0) return null

  const plural = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <TareasAsignadas
      alcance={`filter[area_asignado]=${areaIds.join(',')}`}
      orden={ORDEN_DEL_AREA}
      titulo={titulo}
      estados={catalogos.estados}
      prioridades={catalogos.prioridades}
      vacio={{
        titulo: `No hay ${plural} abiertas`,
        descripcion: `Cuando alguien del área tenga ${plural} asignadas van a aparecer acá, las nuevas y en curso primero.`
      }}
    />
  )
}
