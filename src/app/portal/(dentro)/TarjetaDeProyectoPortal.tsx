import Link from 'next/link'
import type { ReactElement } from 'react'
import { InsigniaDeCatalogo } from '@/componentes/datos/celdas-tickets'
import { BarraProgreso } from '@/componentes/presentadores/BarraProgreso'
import type { EspacioPortal } from '@/datos/portal'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'

/**
 * Un proyecto del portal como tarjeta, para pantallas angostas.
 *
 * Elige lo que el cliente mira de pie: nombre, estado, avance, cuantas tareas siguen abiertas y
 * cuando se entrega. El inicio queda para la tabla.
 *
 * @param props.proyecto la fila del listado
 * @param props.catalogos los catalogos de la tabla, para nombrar el estado
 * @returns la tarjeta, con el nombre como enlace a la ficha del proyecto
 */
export function TarjetaDeProyectoPortal ({
  proyecto,
  catalogos
}: {
  proyecto: EspacioPortal
  catalogos?: Record<string, OpcionFiltro[]>
}): ReactElement {
  return (
    <article className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex w-full flex-col gap-3 border p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base leading-snug text-pretty">
          <Link
            href={`/portal/proyectos/${proyecto.id}`}
            className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
          >
            {proyecto.name}
          </Link>
        </h3>
        <InsigniaDeCatalogo valor={proyecto.status} catalogo={catalogos?.project_statuses} />
      </div>

      <div className="flex items-center gap-3">
        <BarraProgreso porcentaje={proyecto.progress} className="h-1.5 flex-1" />
        <span className="text-texto-tenue text-sm tabular-nums">{proyecto.progress}%</span>
      </div>

      <p className="text-texto-tenue flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          {proyecto.counts.tasks_open} {GLOSARIO.proceso.plural.toLowerCase()} abiertas
        </span>
        <span>Entrega: {formatearFecha(proyecto.deadline)}</span>
      </p>
    </article>
  )
}
