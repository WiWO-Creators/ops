'use client'

import type { ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import type { ProcesoAmpliado } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * Tarjeta de una tarea en el tablero.
 *
 * Muestra lo mismo que la tarjeta del panel viejo: el borde superior con el color de la prioridad, el
 * nombre, los asignados, los contadores de checklist, comentarios y adjuntos, el vencimiento y las
 * etiquetas. Los contadores van con su icono y su texto accesible: un "3" suelto no dice de que.
 */

interface PropsTarjeta {
  proceso: ProcesoAmpliado
  /** Catalogo de prioridades, para sacar el color del borde. */
  prioridades: OpcionFiltro[]
}

export function TarjetaTarea ({ proceso, prioridades }: PropsTarjeta): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set('tarea', String(proceso.id))

  const prioridad = prioridades.find((opcion) => opcion.valor === String(proceso.priority))

  return (
    <div className="flex flex-col gap-2">
      <span
        aria-hidden="true"
        className="rounded-control h-1 w-full"
        // El color de la prioridad lo administra Perfex: es un dato, no un token del sistema.
        style={{ backgroundColor: prioridad?.color ?? 'transparent' }}
      />

      <Link
        href={`?${siguientes.toString()}`}
        scroll={false}
        className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
      >
        {proceso.name}
      </Link>

      {proceso.assignees.length > 0 && <GrupoAvatares personas={proceso.assignees} />}

      <div className="text-texto-sutil flex flex-wrap items-center gap-3 text-xs tabular-nums">
        {proceso.counts.checklist > 0 && (
          <span>
            <span aria-hidden="true">☑ </span>
            {proceso.counts.checklist_done}/{proceso.counts.checklist}
            <span className="sr-only"> ítems de la lista de control terminados</span>
          </span>
        )}
        {proceso.counts.comments > 0 && (
          <span>
            <span aria-hidden="true">💬 </span>
            {proceso.counts.comments}
            <span className="sr-only"> comentarios</span>
          </span>
        )}
        {proceso.counts.attachments > 0 && (
          <span>
            <span aria-hidden="true">📎 </span>
            {proceso.counts.attachments}
            <span className="sr-only"> adjuntos</span>
          </span>
        )}
        {proceso.due_date !== null && <Fecha valor={proceso.due_date} comoVencimiento />}
      </div>

      {proceso.tags.length > 0 && <Etiquetas etiquetas={proceso.tags} />}
    </div>
  )
}
