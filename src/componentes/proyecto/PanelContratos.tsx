'use client'

import { useMemo, type ReactElement } from 'react'
import { PanelRecurso } from './PanelRecurso'
import { CONTRATOS } from '@/definiciones/contratos'

/**
 * Pestaña Contratos del Proyecto.
 *
 * Solo lectura: el panel viejo tampoco ofrece crear un contrato desde aca.
 *
 * @param proyectoId el proyecto que se esta mirando
 */
export function PanelContratos ({ proyectoId }: { proyectoId: number }): ReactElement {
  const definicion = useMemo(
    () => ({ ...CONTRATOS, ruta: `projects/${encodeURIComponent(String(proyectoId))}/contracts` }),
    [proyectoId]
  )

  return <PanelRecurso definicion={definicion} claveFila={(c) => c.id} />
}
