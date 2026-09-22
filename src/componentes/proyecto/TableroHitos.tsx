'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { TableroFiltrable } from '@/componentes/datos/TableroFiltrable'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { CodigoCopiable } from '@/componentes/presentadores/CodigoCopiable'
import { pedirSobre } from '@/datos/cliente'
import { listaDe, opcionesDeFiltros } from '@/datos/catalogos'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { filtrosDeCamposPersonalizados } from '@/definiciones/filtros'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { procesosDelEspacio } from '@/definiciones/procesos'
import { procesosDelContacto } from '@/definiciones/portal-proyectos'
import { GLOSARIO } from '@/dominio/glosario'
import { AgregarAlHito } from './AgregarAlHito'
import { BotonDuplicarTarea } from './DuplicarTarea'
import { MenuEstadoTarea } from './MenuEstadoTarea'
import { COLUMNA_SIN_CATEGORIZAR, cuerpoMoverHito, ordenarColumnasHitos } from './hitos'
import { segundosAHoraMinuto } from './formatos'
import type { ColumnaTablero, CuerpoMover, GrupoTablero } from '@/componentes/datos/tablero'
import type { DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'
import type { FuenteDeProyecto } from '@/dominio/fuente-proyecto'
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
  /**
   * De donde bajan los datos del Proyecto.
   *
   * Es lo unico que separa el kanban del equipo del del cliente. Sin ella el tablero pedia a tres
   * rutas del equipo escritas a mano —los Hitos, el catalogo y los campos personalizados— y montarlo
   * en el portal daba tres 403 en vez de un tablero.
   */
  fuente: FuenteDeProyecto
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
  fuente: FuenteDeProyecto,
  proyectoId: number,
  excluirCompletadas: boolean,
  campos: DefinicionCampoPersonalizado[],
  estados: EstadoLookup[],
  puedeEditarTareas: boolean,
  refrescar: () => void
): DefinicionRecurso<TarjetaHito> {
  const esDelPortal = fuente.sujeto === 'portal'

  return {
    ruta: fuente.hitos,
    titulo: GLOSARIO.hito,
    columnas: [{ clave: 'name', encabezado: 'Nombre', presentar: (t) => t.name }],
    // Los filtros de la barra son los del sujeto que mira, no siempre los del equipo: la whitelist
    // del contacto acepta 22 de los ~40, asi que ofrecerle los del panel seria mandarlo a un 422 por
    // cada control que toque. Y sus campos personalizados no existen — `camposDeTareas` es `null`—,
    // asi que la lista llega vacia y no agrega nada.
    filtros: esDelPortal
      ? procesosDelContacto(proyectoId).filtros
      : [...procesosDelEspacio(proyectoId).filtros, ...filtrosDeCamposPersonalizados(campos)],
    ordenables: ['order'],
    ordenPorDefecto: 'order',
    busqueda: true,
    includes: [],
    consultaFija: `excluir_completadas=${String(excluirCompletadas)}`,
    tablero: {
      columnasDesde: 'milestones',
      // Sin ruta de mover, el motor no ofrece arrastre ni menu "Mover a…". El portal es de solo
      // lectura por construccion —su guarda rechaza todo lo que no sea GET antes de mirar la ruta—,
      // asi que un tablero arrastrable solo podria fallar.
      rutaMover: esDelPortal ? undefined : 'tasks/:id/mover-hito',
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
  fuente,
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
    // Los campos personalizados son del equipo: `camposDeTareas` en `null` significa que este sujeto
    // no tiene ese recurso, y se resuelve con lista vacia en vez de con una rama por sujeto. Pedirlo
    // igual seria un 403 que tumbaria las tres llamadas del `Promise.all`.
    const campos = fuente.camposDeTareas === null
      ? Promise.resolve({ data: [] as DefinicionCampoPersonalizado[] })
      : pedirSobre<DefinicionCampoPersonalizado[]>(fuente.camposDeTareas, control.signal)

    void Promise.all([
      pedirSobre<Lookups>(fuente.lookups, control.signal),
      campos,
      pedirSobre<Hito[]>(`${fuente.hitos}?per_page=100`, control.signal)
    ]).then(([lookups, campos, hitos]) => {
      if (!control.signal.aborted) setCatalogos({ lookups: lookups.data, campos: campos.data, hitos: hitos.data })
    }).catch((fallo: unknown) => {
      if (!control.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los filtros.')
    })
    return () => { control.abort() }
  }, [fuente, proyectoId])

  const estados = catalogos === null ? [] : listaDe(catalogos.lookups, 'task_statuses')
  const esDelPortal = fuente.sujeto === 'portal'
  const definicion = definicionDeHitos(
    fuente,
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

  /**
   * El "Duplicar…" de cada tarjeta, al lado de "Mover a…".
   *
   * Pide la capacidad `create` sobre tareas y no `edit`: duplicar es un alta, y la API la exige. Sin
   * ella el boton no se pinta, porque ofrecerlo seria ofrecer un 403.
   *
   * El `recargar` que entrega el motor es el mismo del arrastre: la copia entra por el hito del
   * original, asi que la columna donde acaba de aparecer tiene que volver a pedirse.
   */
  const accionDeTarjeta = useCallback(
    (tarjeta: TarjetaHito, recargar: () => Promise<void>) => puedeCrear
      ? (
        <BotonDuplicarTarea
          tareaId={tarjeta.id}
          nombreTarea={tarjeta.name}
          onDuplicada={() => { void recargar() }}
        />
        )
      : null,
    [puedeCrear]
  )

  if (error) return <ErrorEstado detalle={error} />
  if (catalogos === null) return <Cargando mensaje="Cargando filtros…" />

  return (
    <TableroFiltrable<TarjetaHito>
      definicion={definicion}
      ruta={definicion.ruta}
      // `undefined` para el contacto, y no es un detalle: `board` es lo que hace que
      // `ControlesTabla` pida `filter-presets`, que es una ruta del equipo. Con `tasks` fijo, el
      // kanban del cliente la pedia con su sesion y el 401 tumbaba la pantalla entera — el aviso
      // decia "Esto no se pudo cargar" y no se veia ni una columna. Sin `board`, la deduccion de
      // `tableroDePresets()` devuelve `null` para cualquier ruta que empiece con `portal/`.
      board={esDelPortal ? undefined : 'tasks'}
      opcionesDeFiltro={opciones}
      mensajeError={`No se pudo cargar el tablero de ${GLOSARIO.hito.plural.toLowerCase()}.`}
      tituloVacio={`Sin ${GLOSARIO.hito.plural.toLowerCase()}`}
      descripcionVacio={`Los ${GLOSARIO.hito.plural.toLowerCase()} parten el proyecto en entregas con fecha. Crea el primero con "Nuevo ${GLOSARIO.hito.singular.toLowerCase()}".`}
      adaptarCuerpo={adaptar}
      ordenarColumnas={ordenar}
      accionDeColumna={accionDeColumna}
      accionDeTarjeta={accionDeTarjeta}
      rutaOrdenColumnas={puedeEditar ? `${definicion.ruta}/orden` : undefined}
    />
  )
}

/**
 * Tarjeta de una tarea dentro del kanban de hitos.
 *
 * Muestra lo mismo que la del panel: quienes la tienen asignada, el nombre —tachado si esta
 * completa—, el tiempo registrado y el rango de fechas, mas la patente en un chip que se copia de
 * un clic (`CodigoCopiable`). La patente es el codigo con el que la tarea se nombra fuera de la
 * pantalla —en un mensaje, en una reunion—, y hasta ahora habia que abrir el detalle para leerla.
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
      {(puedeEditarTareas || tarea.patente !== null) && (
        <div className="flex items-start gap-2">
          {puedeEditarTareas && (
            <MenuEstadoTarea
              tareaId={tarea.id}
              nombreTarea={tarea.name}
              estado={tarea.status}
              catalogo={estados}
              onCambiado={onEstadoCambiado}
            />
          )}

          {/* Sin patente no se pinta nada, igual que en `CabeceraProyecto`: un `#12` no es el
              codigo con el que se nombra la tarea fuera de la pantalla. */}
          {tarea.patente !== null && (
            <CodigoCopiable
              valor={tarea.patente}
              className="bg-superficie-hundida ml-auto shrink-0"
            />
          )}
        </div>
      )}

      {/* `?? []`: el contacto no recibe la clave salvo que el Proyecto encienda los responsables. */}
      {(tarea.assignees ?? []).length > 0 && <GrupoAvatares personas={tarea.assignees ?? []} maximo={4} />}

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
        {/* Sin la clave no se pinta un `00:00`: el Proyecto no comparte las horas, y un cero diria
            que nadie trabajo. Ausencia no es cero. */}
        {tarea.total_logged_seconds !== undefined && (
          <>
            <span data-numerico>{segundosAHoraMinuto(tarea.total_logged_seconds)}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <Fecha valor={tarea.start_date} />
        <span aria-hidden="true">→</span>
        <Fecha valor={tarea.due_date} comoVencimiento />
      </div>
    </div>
  )
}
