'use client'

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { TableroFiltrable } from '@/componentes/datos/TableroFiltrable'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { pedirSobre } from '@/datos/cliente'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { filtrosDeCamposPersonalizados } from '@/definiciones/filtros'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { procesosDelEspacio } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'
import { AgregarAlHito } from './AgregarAlHito'
import { COLUMNA_SIN_CATEGORIZAR, cuerpoMoverHito, ordenarColumnasHitos } from './hitos'
import { segundosAHoraMinuto } from './formatos'
import type { ColumnaTablero, CuerpoMover, GrupoTablero } from '@/componentes/datos/tablero'
import type { DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'
import type { DefinicionCampoPersonalizado, Hito, Lookups, TarjetaHito } from '@/datos/recursos'

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
  /** Habilita el "+" de cada columna. Viene de la capacidad `create` sobre tareas. */
  puedeCrear: boolean
}

/**
 * Definición del tablero de Hitos con el catálogo completo de filtros de tareas.
 *
 * `columnasDesde` no se usa aca —las columnas llegan dentro de la respuesta del tablero, no de
 * `/lookups`— pero el tipo lo exige, asi que se declara la clave que mas se le parece.
 */
function definicionDeHitos (proyectoId: number, excluirCompletadas: boolean, campos: DefinicionCampoPersonalizado[]): DefinicionRecurso<TarjetaHito> {
  return {
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/milestones`,
    titulo: GLOSARIO.hito,
    columnas: [{ clave: 'name', encabezado: 'Nombre', presentar: (t) => t.name }],
    filtros: [...procesosDelEspacio(proyectoId).filtros, ...filtrosDeCamposPersonalizados(campos)],
    ordenables: ['order'],
    ordenPorDefecto: 'order',
    busqueda: true,
    includes: [],
    consultaFija: `excluir_completadas=${String(excluirCompletadas)}`,
    tablero: {
      columnasDesde: 'milestones',
      rutaMover: 'tasks/:id/mover-hito',
      presentarTarjeta: (fila) => <TarjetaDeHito tarea={fila as TarjetaHito} />
    }
  }
}

export function TableroHitos ({ proyectoId, excluirCompletadas, puedeCrear }: PropsTableroHitos): ReactElement {
  const [catalogos, setCatalogos] = useState<{ lookups: Lookups, campos: DefinicionCampoPersonalizado[], hitos: Hito[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()
    void Promise.all([
      pedirSobre<Lookups>('lookups', control.signal),
      pedirSobre<DefinicionCampoPersonalizado[]>('custom-fields?para=tasks', control.signal),
      pedirSobre<Hito[]>(`projects/${proyectoId}/milestones?per_page=100`, control.signal)
    ]).then(([lookups, campos, hitos]) => {
      if (!control.signal.aborted) setCatalogos({ lookups: lookups.data, campos: campos.data, hitos: hitos.data })
    }).catch((fallo: unknown) => {
      if (!control.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los filtros.')
    })
    return () => { control.abort() }
  }, [proyectoId])

  const definicion = definicionDeHitos(proyectoId, excluirCompletadas, catalogos?.campos ?? [])
  const opciones: Record<string, OpcionFiltro[]> | undefined = catalogos === null ? undefined : {
    ...opcionesDeFiltros(definicion, catalogos.lookups),
    milestones: [{ valor: '0', etiqueta: 'Sin hito' }, ...catalogos.hitos.map((hito) => ({ valor: String(hito.id), etiqueta: hito.name }))]
  }
  const prioridades = useMemo<OpcionFiltro[]>(() => catalogos?.lookups.task_priorities.map((prioridad) => ({ valor: String(prioridad.id), etiqueta: prioridad.name })) ?? [], [catalogos])

  // Estables entre renders: `Tablero` los usa dentro de un `useCallback` y una identidad nueva por
  // render volveria a pedir el tablero en bucle.
  const ordenar = useCallback(
    (grupos: Array<GrupoTablero<TarjetaHito>>) => ordenarColumnasHitos(grupos),
    []
  )
  const adaptar = useCallback((cuerpo: CuerpoMover) => cuerpoMoverHito(cuerpo), [])

  /**
   * El "+" de la cabecera de cada columna.
   *
   * La sintetica "Sin categorizar" queda afuera: no es un hito, y agregarle algo es crear una tarea
   * suelta, que ya se hace desde la pestaña Tareas.
   */
  const accionDeColumna = useCallback(
    (columna: ColumnaTablero, recargar: () => Promise<void>) => {
      if (!puedeCrear || columna.id === COLUMNA_SIN_CATEGORIZAR) return null

      return (
        <AgregarAlHito
          proyectoId={proyectoId}
          hito={{ id: columna.id, name: columna.name }}
          prioridades={prioridades}
          onListo={recargar}
        />
      )
    },
    [puedeCrear, proyectoId, prioridades]
  )

  if (error) return <ErrorEstado detalle={error} />
  if (catalogos === null) return <Cargando mensaje="Cargando filtros…" />

  return (
    <TableroFiltrable<TarjetaHito>
      definicion={definicion}
      ruta={definicion.ruta}
      board="tasks"
      opcionesDeFiltro={opciones}
      mensajeError={`No se pudo cargar el tablero de ${GLOSARIO.hito.plural.toLowerCase()}.`}
      tituloVacio={`Sin ${GLOSARIO.hito.plural.toLowerCase()}`}
      descripcionVacio={`Los ${GLOSARIO.hito.plural.toLowerCase()} parten el proyecto en entregas con fecha. Crea el primero con "Nuevo ${GLOSARIO.hito.singular.toLowerCase()}".`}
      adaptarCuerpo={adaptar}
      ordenarColumnas={ordenar}
      accionDeColumna={accionDeColumna}
    />
  )
}

/**
 * Tarjeta de una tarea dentro del kanban de hitos.
 *
 * Muestra lo mismo que la del panel: quienes la tienen asignada, el nombre —tachado si esta
 * completa—, el tiempo registrado y el rango de fechas.
 *
 * El nombre es un enlace a `?tarea={id}` y no un texto plano: es el mismo modal de detalle que abre
 * la tabla y el tablero de Tareas, y hasta ahora este kanban era el unico listado desde el que una
 * tarea no se podia abrir. Enlace y no `onClick` por lo mismo que en `TarjetaTarea`: se abre en otra
 * pestaña, se copia y **no le roba el `dragstart` a la tarjeta**, que sigue siendo arrastrable.
 */
function TarjetaDeHito ({ tarea }: { tarea: TarjetaHito }): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set(PARAMETRO_TAREA, String(tarea.id))

  return (
    <div className="flex flex-col gap-2">
      {tarea.assignees.length > 0 && <GrupoAvatares personas={tarea.assignees} maximo={4} />}

      <Link
        href={`?${siguientes.toString()}`}
        scroll={false}
        className={
          tarea.status === 5
            ? 'text-texto-tenue hover:text-acento text-sm underline-offset-4 line-through hover:underline'
            : 'text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline'
        }
      >
        {tarea.name}
      </Link>

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
