'use client'

import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { PORTAL_TAREAS } from '@/definiciones/portal-proyectos'
import type { ResultadoLista } from '@/definiciones/tipos'
import type { TareaPortal } from '@/datos/portal'

/**
 * Las tareas del proyecto, con el motor de tabla.
 *
 * La ruta se completa aca porque `PORTAL_TAREAS` cuelga de un proyecto y no existe sola. Y va de
 * este lado de la frontera por lo mismo que el resto: una definicion esta llena de funciones, y una
 * funcion no cruza de un Server Component a uno cliente.
 */
export function TablaDeTareas ({
  proyectoId,
  inicial
}: {
  proyectoId: number
  inicial: ResultadoLista<TareaPortal>
}) {
  const definicion = useMemo(
    () => ({ ...PORTAL_TAREAS, ruta: `portal/projects/${proyectoId}/tasks` }),
    [proyectoId]
  )

  return <TablaRecurso definicion={definicion} inicial={inicial} claveFila={(t) => t.id} />
}
