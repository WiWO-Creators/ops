import { useEffect, useState } from 'react'
import { pedirSobre } from '@/datos/cliente'
import type { ConfiguracionTiposEspacio, Hito, TipoDeProcesoDelEspacio } from '@/datos/recursos'
import { NINGUNO, type DestinoDelAlta } from './modelo'

/** Los catálogos de tipos e hitos del Espacio elegido. */
export interface TiposYHitos {
  tipos: TipoDeProcesoDelEspacio[]
  hitos: Hito[]
  /** Por qué no hay tipos ni hitos cuando la consulta falló; `null` si no falló. */
  avisoTipos: string | null
  /** Vacía los catálogos y el aviso. */
  olvidar: () => void
}

/**
 * Trae los tipos de Proceso y los hitos que ofrece el Espacio elegido.
 *
 * Los tipos no salen de `lookups.task_types`: la API valida el tipo contra
 * `tblproject_task_types` —la relacion Espacio <-> tipo— y rechaza con `422 no_pertenece_al_espacio`
 * cualquier otro id, ademas de que el catalogo global repite los mismos tres nombres una vez por
 * Espacio. Sin Espacio no hay tipo posible: el selector queda deshabilitado hasta que se elija uno.
 *
 * @param abierto si el alta está abierta
 * @param destino el primer Espacio elegido y si hay varios
 * @returns los catálogos del Espacio, el aviso de fallo y cómo vaciarlos
 */
export function useTiposYHitos (abierto: boolean, { espacio, multiple }: Pick<DestinoDelAlta, 'espacio' | 'multiple'>): TiposYHitos {
  const [tipos, setTipos] = useState<TipoDeProcesoDelEspacio[]>([])
  const [hitos, setHitos] = useState<Hito[]>([])
  const [avisoTipos, setAvisoTipos] = useState<string | null>(null)

  useEffect(() => {
    // Con varios destinos no se piden: cada Espacio ofrece los suyos y la API rechaza un tipo o un
    // hito que no sea del Espacio de la tarea, así que no hay una lista común que mostrar.
    if (!abierto || espacio === NINGUNO || multiple) return

    const control = new AbortController()

    void Promise.all([
      pedirSobre<ConfiguracionTiposEspacio>(`projects/${espacio}/task-types`, control.signal),
      pedirSobre<Hito[]>(`projects/${espacio}/milestones`, control.signal)
    ]).then(([sobre, lista]) => {
      if (!control.signal.aborted) {
        setTipos(sobre.data.task_types)
        setHitos(lista.data)
      }
    })
      .catch(() => {
        // Sin tipos el alta sigue funcionando: se dice y se deja crear la tarea sin tipo.
        if (!control.signal.aborted) setAvisoTipos('No se pudieron traer los tipos y los hitos de este proyecto. Vuelve a elegirlo para reintentar.')
      })

    return () => { control.abort() }
  }, [espacio, abierto, multiple])

  return {
    tipos,
    hitos,
    avisoTipos,
    olvidar: () => {
      setHitos([])
      setTipos([])
      setAvisoTipos(null)
    }
  }
}
