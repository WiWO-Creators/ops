'use client'

import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { PORTAL_TAREAS } from '@/definiciones/portal-proyectos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { TareaPortal } from '@/datos/portal'

/**
 * Las tareas del proyecto, con el motor de tabla.
 *
 * La ruta se completa aca porque `PORTAL_TAREAS` cuelga de un proyecto y no existe sola. Y va de
 * este lado de la frontera por lo mismo que el resto: una definicion esta llena de funciones, y una
 * funcion no cruza de un Server Component a uno cliente.
 *
 * El vencimiento se pinta con el presentador unico y no con el texto de la definicion: `PORTAL_TAREAS`
 * es un `.ts` que corren las pruebas con el despojador de tipos de Node, y ahi no cabe JSX.
 */
export function TablaDeTareas ({
  proyectoId,
  inicial,
  opcionesDeFiltro
}: {
  proyectoId: number
  inicial: ResultadoLista<TareaPortal>
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}) {
  const definicion = useMemo(
    () => ({
      ...PORTAL_TAREAS,
      ruta: `portal/projects/${proyectoId}/tasks`,
      columnas: PORTAL_TAREAS.columnas.map((columna) => (
        columna.clave === 'due_date'
          ? { ...columna, presentar: (t: TareaPortal) => <Fecha valor={t.due_date} comoVencimiento /> }
          : columna
      ))
    }),
    [proyectoId]
  )

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      claveFila={(t) => t.id}
      opcionesDeFiltro={opcionesDeFiltro}
    />
  )
}
