'use client'

import type { ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import type { Etiqueta, ProcesoAmpliado } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { resolverEstado } from '@/dominio/estados-tarea'

/**
 * Tarjeta de una tarea en el tablero.
 *
 * Muestra lo mismo que la tarjeta del panel viejo: el borde superior con el color del estado, el
 * nombre, los asignados, los contadores de checklist, comentarios y adjuntos, el vencimiento y las
 * etiquetas. Los contadores van con su icono y su texto accesible: un "3" suelto no dice de que.
 *
 * **Sin insignia de estado, a proposito**: esta tarjeta solo se pinta dentro de un tablero, y la
 * columna que la contiene ya lleva el nombre del estado en su encabezado. Repetirlo en cada tarjeta
 * seria decir treinta veces lo que la columna dice una. El color del borde sale del mismo
 * `resolverEstado` que usan la tabla y `<EstadoDeTarea>`: el dato es uno solo, cambia como se pinta.
 *
 * **Declara el tipo minimo que dibuja**, no `Proceso`: el mismo tablero lo abre el cliente desde el
 * portal, y su contrato no manda asignados, contadores ni etiquetas. Con `Proceso` esos tres eran
 * `undefined` que el tipo juraba que existian, y la tarjeta se caia leyendo `.length`.
 */

/** Lo minimo que una tarjeta necesita. Lo opcional es lo que el contrato del cliente no manda. */
export interface ProcesoDeTarjeta {
  id: number
  name: string
  status: number
  due_date: string | null
  assignees?: StaffReferencia[]
  counts?: ProcesoAmpliado['counts']
  tags?: Etiqueta[]
}

interface PropsTarjeta {
  proceso: ProcesoDeTarjeta
  /** Catalogo de estados, para sacar el color del borde. */
  estados: OpcionFiltro[]
}

export function TarjetaTarea ({ proceso, estados }: PropsTarjeta): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set('tarea', String(proceso.id))

  const estado = resolverEstado(proceso.status, estados)

  return (
    <div className="flex flex-col gap-2">
      <span
        aria-hidden="true"
        className="rounded-control h-1 w-full"
        // El color del estado lo administra Perfex: es un dato, no un token del sistema.
        style={{ backgroundColor: estado.color ?? 'transparent' }}
      />

      <Link
        href={`?${siguientes.toString()}`}
        scroll={false}
        className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
      >
        {proceso.name}
      </Link>

      {proceso.assignees !== undefined && proceso.assignees.length > 0 && (
        <GrupoAvatares personas={proceso.assignees} />
      )}

      <div className="text-texto-sutil flex flex-wrap items-center gap-3 text-xs tabular-nums">
        {(proceso.counts?.checklist ?? 0) > 0 && (
          <span>
            <span aria-hidden="true">☑ </span>
            {proceso.counts?.checklist_done}/{proceso.counts?.checklist}
            <span className="sr-only"> ítems de la lista de control terminados</span>
          </span>
        )}
        {(proceso.counts?.comments ?? 0) > 0 && (
          <span>
            <span aria-hidden="true">💬 </span>
            {proceso.counts?.comments}
            <span className="sr-only"> comentarios</span>
          </span>
        )}
        {(proceso.counts?.attachments ?? 0) > 0 && (
          <span>
            <span aria-hidden="true">📎 </span>
            {proceso.counts?.attachments}
            <span className="sr-only"> adjuntos</span>
          </span>
        )}
        {/* Siempre visible, tambien sin plazo: la tarjeta dice "Sin fecha" en vez de callarse, que
            en un tablero se confunde con "no se cargo todavia". */}
        <Fecha valor={proceso.due_date} comoVencimiento />
      </div>

      {proceso.tags !== undefined && proceso.tags.length > 0 && <Etiquetas etiquetas={proceso.tags} />}
    </div>
  )
}
