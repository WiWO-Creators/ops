'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { TableroFiltrable } from '@/componentes/datos/TableroFiltrable'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { pedirSobre } from '@/datos/cliente'
import { listaDe, opcionesDeFiltros } from '@/datos/catalogos'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { filtrosDeCamposPersonalizados } from '@/definiciones/filtros'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { procesosDelEspacio } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'
import { AgregarAlHito } from './AgregarAlHito'
import { MenuEstadoTarea } from './MenuEstadoTarea'
import { COLUMNA_SIN_CATEGORIZAR, cuerpoMoverHito, ordenarColumnasHitos } from './hitos'
import { segundosAHoraMinuto } from './formatos'
import type { ColumnaTablero, CuerpoMover, GrupoTablero } from '@/componentes/datos/tablero'
import type { DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'
import type { DefinicionCampoPersonalizado, EstadoLookup, Hito, Lookups, TarjetaHito } from '@/datos/recursos'

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
  /** Nombre del Proyecto. Lo pide el camino "Traer de otro proyecto" del "+", que lo muestra. */
  proyectoNombre: string
  /** Cuando es `true` el backend no manda las tareas completadas. Es el valor por defecto del panel. */
  excluirCompletadas: boolean
  /** Habilita el "+" de cada columna. Viene de la capacidad `create` sobre tareas. */
  puedeCrear: boolean
  puedeEditar: boolean
  /**
   * Habilita el menu de estado de cada tarjeta. Viene de la capacidad `edit` sobre **tareas**, que
   * no es la misma que `puedeEditar` —esa es `edit_milestones` sobre el Espacio y manda sobre el
   * orden de las columnas—. Sin ella la tarjeta no muestra el control.
   */
  puedeEditarTareas: boolean
}

/**
 * Definición del tablero de Hitos con el catálogo completo de filtros de tareas.
 *
 * `columnasDesde` no se usa aca —las columnas llegan dentro de la respuesta del tablero, no de
 * `/lookups`— pero el tipo lo exige, asi que se declara la clave que mas se le parece.
 */
function definicionDeHitos (
  proyectoId: number,
  excluirCompletadas: boolean,
  campos: DefinicionCampoPersonalizado[],
  estados: EstadoLookup[],
  puedeEditarTareas: boolean,
  refrescar: () => void
): DefinicionRecurso<TarjetaHito> {
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
      presentarTarjeta: (fila) => (
        <TarjetaDeHito
          tarea={fila as TarjetaHito}
          estados={estados}
          puedeEditarTareas={puedeEditarTareas}
          onEstadoCambiado={refrescar}
        />
      )
    }
  }
}

export function TableroHitos ({
  proyectoId,
  proyectoNombre,
  excluirCompletadas,
  puedeCrear,
  puedeEditar,
  puedeEditarTareas
}: PropsTableroHitos): ReactElement {
  const [catalogos, setCatalogos] = useState<{ lookups: Lookups, campos: DefinicionCampoPersonalizado[], hitos: Hito[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * El `recargar` del motor, guardado al pasar.
   *
   * Cambiar el estado desde una tarjeta obliga a refrescar el tablero: con "Excluir completadas"
   * encendido la tarjeta tiene que irse, y el contador de la columna cambia igual. El motor entrega
   * su `recargar` **solo** al gancho de la cabecera de columna (`accionDeColumna`), asi que se lo
   * toma de ahi en vez de montar un segundo `fetch` del tablero: dos caminos de recarga terminan
   * mostrando cosas distintas, que es justo lo que ese gancho documenta que hay que evitar.
   *
   * La cabecera de cada columna se pinta antes que sus tarjetas, asi que para cuando una tarjeta
   * puede llamarlo ya esta guardado.
   */
  const recargarTablero = useRef<(() => Promise<void>) | null>(null)

  const refrescar = useCallback(() => { void recargarTablero.current?.() }, [])

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

  const estados = catalogos === null ? [] : listaDe(catalogos.lookups, 'task_statuses')
  const definicion = definicionDeHitos(
    proyectoId,
    excluirCompletadas,
    catalogos?.campos ?? [],
    estados,
    puedeEditarTareas,
    // `refrescar` lee la referencia, pero solo cuando una tarjeta confirma un cambio de estado:
    // nunca durante el render. La regla no puede distinguir las dos cosas porque el callback viaja
    // dentro de la definicion, que si se arma en el render.
    // eslint-disable-next-line react-hooks/refs
    refrescar
  )
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
      // Antes de cualquier salida: las tarjetas lo necesitan tambien en las columnas sin "+".
      recargarTablero.current = recargar

      if (!puedeCrear || columna.id === COLUMNA_SIN_CATEGORIZAR) return null

      return (
        <AgregarAlHito
          proyectoId={proyectoId}
          proyectoNombre={proyectoNombre}
          hito={{ id: columna.id, name: columna.name }}
          prioridades={prioridades}
          onListo={recargar}
        />
      )
    },
    [puedeCrear, proyectoId, proyectoNombre, prioridades]
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
      rutaOrdenColumnas={puedeEditar ? `${definicion.ruta}/orden` : undefined}
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
 *
 * La insignia de estado es ademas un menu (`MenuEstadoTarea`): las columnas de este kanban son
 * hitos, asi que arrastrar una tarjeta **no** cambia su estado, y avanzarlo obligaba a abrir el
 * modal. Solo se pinta con la capacidad `edit` sobre tareas; sin ella la tarjeta queda como estaba,
 * sin insignia, porque la unica razon de mostrarla aca es poder tocarla.
 *
 * El tachado del nombre sigue leyendo `tarea.status` —el dato de la API— y no el optimista del
 * menu: se pone al dia con la recarga del tablero que dispara el cambio, un instante despues de la
 * insignia. Sostener un segundo estado espejado en la tarjeta para ganar ese instante costaria mas
 * de lo que arregla, y si la API rechaza el cambio el tachado nunca llego a mentir.
 */
function TarjetaDeHito ({
  tarea,
  estados,
  puedeEditarTareas,
  onEstadoCambiado
}: {
  tarea: TarjetaHito
  estados: EstadoLookup[]
  puedeEditarTareas: boolean
  onEstadoCambiado: () => void
}): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set(PARAMETRO_TAREA, String(tarea.id))

  return (
    <div className="flex flex-col gap-2">
      {puedeEditarTareas && (
        <MenuEstadoTarea
          tareaId={tarea.id}
          nombreTarea={tarea.name}
          estado={tarea.status}
          catalogo={estados}
          onCambiado={onEstadoCambiado}
        />
      )}

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
