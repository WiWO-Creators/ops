'use client'

import { useEffect, useState } from 'react'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import type { EstadoLookup, Lookups } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'

export interface CatalogosDePropuestas {
  prioridades: EstadoLookup[]
  personas: StaffReferencia[]
  /** Por qué no se pueden cambiar los responsables, si el equipo no cargó. */
  errorEquipo: string | null
}

/**
 * Las prioridades y el equipo que hacen falta para editar propuestas.
 *
 * Los catálogos solo se piden si hay algo que editar. Un acta de la que no salió ninguna tarea
 * —que son la mayoría de las viejas— no tiene por qué gastar dos peticiones para dibujar una línea
 * que dice que no hay nada. `cargarAsignables` además comparte la respuesta con el resto de la
 * pestaña, así que casi siempre ya está.
 *
 * @param activo si hay propuestas pendientes y permiso para editarlas
 * @param rutaLookups la ruta de los catálogos, que sale de la fuente
 * @returns las prioridades, el equipo y el error del equipo
 */
export function useCatalogosDePropuestas (activo: boolean, rutaLookups: string): CatalogosDePropuestas {
  const [prioridades, setPrioridades] = useState<EstadoLookup[]>([])
  const [personas, setPersonas] = useState<StaffReferencia[]>([])
  const [errorEquipo, setErrorEquipo] = useState<string | null>(null)

  useEffect(() => {
    if (!activo) return

    let vivo = true

    void leerDelBff<Lookups>(rutaLookups).then((resultado) => {
      // Sin catálogo la insignia de prioridad no se pinta —ver `EstadoDeTarea`— y el resto de la
      // fila se sigue editando: una lista de "#1" y "#4" no dice nada que valga la pena mostrar.
      if (vivo && resultado.ok) setPrioridades(resultado.datos.task_priorities)
    })

    void cargarAsignables()
      .then((lista) => {
        if (!vivo) return

        setPersonas(lista)
        setErrorEquipo(null)
      })
      .catch((fallo: unknown) => {
        if (!vivo) return

        setErrorEquipo(fallo instanceof Error
          ? fallo.message
          : 'No se pudo cargar el equipo: los responsables no se pueden cambiar desde aquí.')
      })

    return () => { vivo = false }
  }, [activo, rutaLookups])

  return { prioridades, personas, errorEquipo }
}
