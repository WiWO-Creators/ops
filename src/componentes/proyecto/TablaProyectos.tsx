'use client'

import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { enriquecerColumnas, type AccionesDeFila } from './ColumnasProyecto'
import { espaciosConCampos } from '@/definiciones/espacios'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { CampoPersonalizadoMeta, Espacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'

interface PropsTablaProyectos {
  inicial: ResultadoLista<Espacio>
  capacidades: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** Campos personalizados de `projects`; los marcados `show_on_table` se vuelven columna. */
  campos: CampoPersonalizadoMeta[]
  acciones: Omit<AccionesDeFila, 'capacidades'>
}

/**
 * Listado de Proyectos en tabla.
 *
 * No reimplementa nada: arma la definicion —base + columnas de campos personalizados + presentadores
 * ricos— y se la pasa al motor. La definicion se compone acá y no en `vistas.tsx` porque depende de
 * datos que solo existen en tiempo de ejecucion (que campos personalizados hay) y de manejadores que
 * abren dialogos, y una funcion no puede cruzar la frontera de Server Component.
 */
export function TablaProyectos ({ inicial, capacidades, opcionesDeFiltro, campos, acciones }: PropsTablaProyectos) {
  const definicion = useMemo(() => {
    const base = espaciosConCampos(campos)

    return { ...base, columnas: enriquecerColumnas(base.columnas, { capacidades, ...acciones }) }
  }, [campos, capacidades, acciones])

  return (
    <TablaRecurso
      definicion={definicion}
      claveFila={(espacio) => espacio.id}
      inicial={inicial}
      capacidades={capacidades}
      opcionesDeFiltro={opcionesDeFiltro}
      board="projects"
    />
  )
}
