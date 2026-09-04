'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { TableroFiltrable } from '@/componentes/datos/TableroFiltrable'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { pedirSobre } from '@/datos/cliente'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { PROCESOS } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'
import { cuerpoMoverHito, ordenarColumnasHitos } from './hitos'
import { segundosAHoraMinuto } from './formatos'
import type { CuerpoMover, GrupoTablero } from '@/componentes/datos/tablero'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import type { Lookups, TarjetaHito } from '@/datos/recursos'

/**
 * Kanban de Hitos: una columna por hito, mas la sintetica "Sin categorizar".
 *
 * **No es un tablero nuevo**: es el motor `Tablero` con otra definicion. Arrastre, menu "Mover a…",
 * paginacion por columna, movimiento optimista y reversion ante error ya viven ahi, y reescribirlos
 * seria mantener dos kanban.
 *
 * Dos cosas lo distinguen del tablero de estados, y por eso el motor las recibe como ganchos:
 * el endpoint de mover nombra `hito` a lo que aquel llama `columna`, y la columna 0 va siempre
 * primera y desaparece cuando no tiene tareas.
 */

interface PropsTableroHitos {
  proyectoId: number
  /** Cuando es `true` el backend no manda las tareas completadas. Es el valor por defecto del panel. */
  excluirCompletadas: boolean
}

/**
 * Los filtros del tablero de Hitos son los de tarea, no los del hito: las tarjetas SON tareas
 * agrupadas por hito. Se toman prestados de `PROCESOS` en vez de declararse de nuevo —mismo
 * `desdeLookup`, misma whitelist que ya valida el backend— salvo `project_id` y `milestone_id`, que
 * acá no tienen sentido: el proyecto ya lo dice la ruta, y el hito ya lo dice la columna.
 */
const CLAVES_FILTRO_HITOS = ['status', 'priority', 'billable', 'vence']

/**
 * Definicion del tablero de Hitos.
 *
 * `columnasDesde` no se usa aca —las columnas llegan dentro de la respuesta del tablero, no de
 * `/lookups`— pero el tipo lo exige, asi que se declara la clave que mas se le parece.
 */
function definicionDeHitos (proyectoId: number, excluirCompletadas: boolean): DefinicionRecurso<TarjetaHito> {
  return {
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/milestones`,
    titulo: GLOSARIO.hito,
    columnas: [{ clave: 'name', encabezado: 'Nombre', presentar: (t) => t.name }],
    filtros: PROCESOS.filtros.filter((filtro) => CLAVES_FILTRO_HITOS.includes(filtro.clave)),
    ordenables: ['order'],
    ordenPorDefecto: 'order',
    busqueda: false,
    includes: [],
    consultaFija: `excluir_completadas=${String(excluirCompletadas)}`,
    tablero: {
      columnasDesde: 'milestones',
      rutaMover: 'tasks/:id/mover-hito',
      presentarTarjeta: (fila) => <TarjetaDeHito tarea={fila as TarjetaHito} />
    }
  }
}

export function TableroHitos ({ proyectoId, excluirCompletadas }: PropsTableroHitos): ReactElement {
  const [lookups, setLookups] = useState<Lookups | null>(null)

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<Lookups>('lookups', control.signal)
      .then((sobre) => { if (!control.signal.aborted) setLookups(sobre.data) })
      .catch(() => {})

    return () => { control.abort() }
  }, [])

  const definicion = definicionDeHitos(proyectoId, excluirCompletadas)

  // Estables entre renders: `Tablero` los usa dentro de un `useCallback` y una identidad nueva por
  // render volveria a pedir el tablero en bucle.
  const ordenar = useCallback(
    (grupos: Array<GrupoTablero<TarjetaHito>>) => ordenarColumnasHitos(grupos),
    []
  )
  const adaptar = useCallback((cuerpo: CuerpoMover) => cuerpoMoverHito(cuerpo), [])

  return (
    <TableroFiltrable<TarjetaHito>
      definicion={definicion}
      ruta={definicion.ruta}
      board="milestones"
      opcionesDeFiltro={lookups === null ? undefined : opcionesDeFiltros(definicion, lookups)}
      mensajeError={`No se pudo cargar el tablero de ${GLOSARIO.hito.plural.toLowerCase()}.`}
      tituloVacio={`Sin ${GLOSARIO.hito.plural.toLowerCase()}`}
      descripcionVacio={`Los ${GLOSARIO.hito.plural.toLowerCase()} parten el proyecto en entregas con fecha. Crea el primero con "Nuevo ${GLOSARIO.hito.singular.toLowerCase()}".`}
      adaptarCuerpo={adaptar}
      ordenarColumnas={ordenar}
    />
  )
}

/**
 * Tarjeta de una tarea dentro del kanban de hitos.
 *
 * Muestra lo mismo que la del panel: quienes la tienen asignada, el nombre —tachado si esta
 * completa—, el tiempo registrado y el rango de fechas.
 */
function TarjetaDeHito ({ tarea }: { tarea: TarjetaHito }): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {tarea.assignees.length > 0 && <GrupoAvatares personas={tarea.assignees} maximo={4} />}

      <span
        className={
          tarea.status === 5
            ? 'text-texto-tenue text-sm line-through'
            : 'text-texto text-sm font-medium'
        }
      >
        {tarea.name}
      </span>

      <div className="text-texto-tenue flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span data-numerico>{segundosAHoraMinuto(tarea.total_logged_seconds)}</span>
        <span aria-hidden="true">·</span>
        <Fecha valor={tarea.start_date} />
        <span aria-hidden="true">→</span>
        <Fecha valor={tarea.due_date} comoVencimiento />
      </div>
    </div>
  )
}
