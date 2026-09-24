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
 * Las Tareas abiertas de una o varias áreas, completas.
 *
 * Filtra por `filter[area_equipo]`, que une las dos maneras en que una Tarea es de un área: la tiene
 * asignada alguien del área, o lleva el área marcada en su campo "Área". Con solo la primera, un área
 * cuyo trabajo se reparte a gente de otras aparecía casi vacía. Qué Tareas alcanza cada quien lo
 * recorta la API.
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
      alcance={`filter[area_equipo]=${areaIds.join(',')}`}
      orden={ORDEN_DEL_AREA}
      titulo={titulo}
      estados={catalogos.estados}
      prioridades={catalogos.prioridades}
      vacio={{
        titulo: `No hay ${plural} abiertas`,
        descripcion: `Las ${plural} asignadas a gente del área o marcadas con el área van a aparecer acá, las nuevas y en curso primero.`
      }}
    />
  )
}
