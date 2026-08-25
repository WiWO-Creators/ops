'use client'

import { useMemo, type ReactElement } from 'react'
import { PanelRecurso } from './PanelRecurso'
import { TICKETS } from '@/definiciones/tickets'
import type { Capacidad } from '@/datos/tipos'

/**
 * Pestaña Tickets del Proyecto.
 *
 * Solo lectura desde aca, igual que en el panel: todas las escrituras de un ticket viven en su propio
 * modulo, y duplicarlas en la vista del proyecto seria mantener dos formularios del mismo recurso.
 *
 * @param proyectoId el proyecto que se esta mirando
 * @param capacidades capacidades sobre `tasks`, que es el area que rige los tickets del proyecto
 */
export function PanelTickets ({
  proyectoId,
  capacidades
}: { proyectoId: number, capacidades: Capacidad[] }): ReactElement {
  const definicion = useMemo(
    () => ({ ...TICKETS, ruta: `projects/${encodeURIComponent(String(proyectoId))}/tickets` }),
    [proyectoId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(t) => t.id} capacidades={capacidades} />
}
