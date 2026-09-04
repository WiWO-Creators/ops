'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ControlesTabla, PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { PresetsFiltro } from '@/componentes/datos/PresetsFiltro'
import { clavesVisiblesPorDefecto, columnasVisibles, resolverInsignia } from '@/componentes/datos/tabla'
import { retrasoDeAparicion } from '@/componentes/datos/TablaRecurso'
import { armarCsv, nombreDeExportacion } from '@/componentes/datos/csv'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { TarjetaProyecto } from './TarjetaProyecto'
import { TablaProyectos } from './TablaProyectos'
import { PastillasEstado } from './PastillasEstado'
import { DialogoCopiarProyecto } from './DialogoCopiarProyecto'
import { DialogoEliminarProyecto } from './DialogoEliminarProyecto'
import { FormularioProyecto } from './FormularioProyecto'
import { DialogoDesdePlantilla } from './DialogoDesdePlantilla'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { Capacidad } from '@/datos/tipos'
import type { CampoPersonalizadoMeta, EstadisticaEstado, Espacio, PlantillaEspacio } from '@/datos/recursos'
import { ESPACIOS, espaciosConCampos } from '@/definiciones/espacios'
import type { EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/**
 * Listado de Proyectos en tarjetas, y el alternador que lo intercambia con la tabla.
 *
 * Nada de esto reimplementa el motor: la consulta se lee y se arma con `leerConsulta` /
 * `construirConsulta`, los controles son los de `ControlesTabla` y el paginador es
 * `PaginacionTabla`. Lo unico propio es como se pinta cada fila.
 *
 * A diferencia de `TablaRecurso`, la vista de tarjetas no pide la pagina desde el navegador: al
 * escribir la consulta en la URL, Next vuelve a ejecutar la pagina de servidor y baja las filas ya
 * resueltas. Duplicar aca el `fetch` al BFF seria una segunda copia de la misma logica —y una
 * peticion de mas— para obtener exactamente lo mismo.
 */

export type Vista = 'tarjetas' | 'tabla'

const VISTAS: readonly OpcionSegmentada[] = [
  // `tabla` primero aunque la de por defecto sea `tarjetas`: el control arranca por la misma opcion
  // en todo el producto, asi la persona no tiene que releerlo al cambiar de pantalla.
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tarjetas', etiqueta: 'Tarjetas', icono: 'tarjetas' }
]

/**
 * Query de la URL con la vista anexada, conservando filtros, orden y pagina.
 *
 * @param params parametros vigentes
 * @param vista presentacion elegida
 * @returns la query lista para `router.replace`, con `?` inicial
 */
function conVista (params: URLSearchParams, vista: Vista): string {
  const query = new URLSearchParams(params.toString())
  query.set('vista', vista)

  return `?${query.toString()}`
}

interface PropsVistaEspacios {
  /** Pagina ya resuelta en el servidor para la consulta que dice la URL. */
  inicial: ResultadoLista<Espacio>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** Vista que pedia la URL al entrar. Por defecto, tarjetas. */
  vistaInicial: Vista
  /** Contadores por estado de `GET /projects/stats`. `null` si el backend no los pudo dar. */
  estadisticas: EstadisticaEstado[] | null
  /** Por que no hay contadores, si es que no los hay. */
  errorEstadisticas?: string | null
  /** Campos personalizados de `projects`; los `show_on_table` se vuelven columna de la tabla. */
  campos: CampoPersonalizadoMeta[]
  /**
   * Plantillas visibles, para el alta "desde plantilla". Vacio cuando no hay ninguna o cuando la
   * instalacion todavia no tiene el recurso.
   */
  plantillas: PlantillaEspacio[]
}

/**
 * Listado de Proyectos: pastillas de estado, barra de acciones y las dos presentaciones.
 *
 * La vista vive en la URL (`?vista=`) y en ningun otro lado: asi un enlace la conserva. El motor de
 * tabla preserva los parametros que no son suyos al filtrar, de modo que filtrar dentro de la tabla
 * ya no devuelve a las tarjetas.
 *
 * Los dialogos de copia, alta/edicion y borrado viven aca y no dentro de la tabla: la tabla se
 * desmonta al cambiar de presentacion, y un dialogo a medio completar no puede depender de eso.
 */
export function VistaEspacios ({
  inicial,
  capacidades = [],
  opcionesDeFiltro,
  vistaInicial,
  estadisticas,
  errorEstadisticas = null,
  campos,
  plantillas
}: PropsVistaEspacios) {
  const router = useRouter()
  const params = useSearchParams()
  const vista: Vista = params.get('vista') === 'tabla' ? 'tabla' : vistaInicial

  const [aCopiar, setACopiar] = useState<Espacio | null>(null)
  const [aEliminar, setAEliminar] = useState<Espacio | null>(null)
  const [aEditar, setAEditar] = useState<Espacio | 'nuevo' | null>(null)
  const [desdePlantilla, setDesdePlantilla] = useState(false)
  // Cambia en cada refresco para remontar la tabla: el motor toma su pagina inicial una sola vez, asi
  // que sin remontar seguiria mostrando la de antes aunque el servidor ya haya devuelto otra.
  const [generacion, setGeneracion] = useState(0)
  const [refrescando, iniciarRefresco] = useTransition()

  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), ESPACIOS),
    [params]
  )

  /** Reescribe la consulta en la URL conservando la presentacion elegida. */
  const cambiarConsulta = useCallback(
    (parcial: Partial<EstadoConsulta>) => {
      const query = new URLSearchParams(construirConsulta({ ...estado, ...parcial }, ESPACIOS))
      query.set('vista', params.get('vista') === 'tabla' ? 'tabla' : 'tarjetas')

      router.replace(`?${query.toString()}`, { scroll: false })
    },
    [estado, params, router]
  )

  /** Vuelve a pedir la pagina al servidor y remonta la tabla con lo que llegue. */
  const refrescar = useCallback(() => {
    iniciarRefresco(() => {
      router.refresh()
      setGeneracion((n) => n + 1)
    })
  }, [router])

  const acciones = useMemo(
    () => ({
      onCopiar: (espacio: Espacio) => { setACopiar(espacio) },
      onEditar: (espacio: Espacio) => { setAEditar(espacio) },
      onEliminar: (espacio: Espacio) => { setAEliminar(espacio) }
    }),
    []
  )

  function cambiarVista (elegida: Vista) {
    router.replace(conVista(params, elegida), { scroll: false })
  }

  return (
    <div className="flex flex-col gap-3">
      <PastillasEstado
        estadisticas={estadisticas}
        error={errorEstadisticas}
        seleccion={estado.filtros.status ?? []}
        onCambiar={(estados) => { cambiarConsulta({ filtros: { ...estado.filtros, status: estados }, pagina: 1 }) }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentado
          etiqueta="Presentación del listado"
          opciones={VISTAS}
          activo={vista}
          onElegir={(valor) => { cambiarVista(valor as Vista) }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Boton tamano="chico" variante="sutil" cargando={refrescando} onClick={refrescar}>
            Refrescar
          </Boton>
          <Boton
            tamano="chico"
            onClick={() => { descargarCsv(campos, inicial.filas, opcionesDeFiltro) }}
            disabled={inicial.filas.length === 0}
          >
            Exportar CSV
          </Boton>
          {/* La pantalla de plantillas es donde se arman; desde aca solo se entra a verla. Es un
              enlace y no un boton porque va a otra ruta. */}
          <Link
            href="/espacios/plantillas"
            className="text-texto-tenue hover:text-texto text-xs underline-offset-4 hover:underline"
          >
            Plantillas
          </Link>
          {capacidades.includes('create') && (
            <>
              <Boton tamano="chico" onClick={() => { setDesdePlantilla(true) }}>
                Desde plantilla
              </Boton>
              <Boton tamano="chico" variante="primario" onClick={() => { setAEditar('nuevo') }}>
                Nuevo {GLOSARIO.espacio.singular.toLowerCase()}
              </Boton>
            </>
          )}
        </div>
      </div>

      {vista === 'tabla'
        ? (
          <TablaProyectos
            key={generacion}
            inicial={inicial}
            capacidades={capacidades}
            opcionesDeFiltro={opcionesDeFiltro}
            campos={campos}
            acciones={acciones}
          />
          )
        : <TarjetasProyectos resultado={inicial} opcionesDeFiltro={opcionesDeFiltro} />}

      <DialogoCopiarProyecto
        espacio={aCopiar}
        clientes={opcionesDeFiltro?.clients ?? []}
        estadosDeTarea={opcionesDeFiltro?.task_statuses ?? []}
        onCerrar={() => { setACopiar(null) }}
        onCopiado={() => { setACopiar(null); refrescar() }}
      />

      <DialogoEliminarProyecto
        espacio={aEliminar}
        onCerrar={() => { setAEliminar(null) }}
        onEliminado={() => { setAEliminar(null); refrescar() }}
      />

      <DialogoDesdePlantilla
        abierto={desdePlantilla}
        plantillas={plantillas}
        clientes={opcionesDeFiltro?.clients ?? []}
        onCerrar={() => { setDesdePlantilla(false) }}
      />

      <FormularioProyecto
        destino={aEditar}
        clientes={opcionesDeFiltro?.clients ?? []}
        estados={opcionesDeFiltro?.project_statuses ?? []}
        onCerrar={() => { setAEditar(null) }}
        onGuardado={() => { setAEditar(null); refrescar() }}
      />
    </div>
  )
}

/**
 * Descarga como CSV lo que la vista esta mostrando.
 *
 * Exporta las columnas visibles por defecto —las mismas que abre la tabla— y la pagina vigente, con
 * sus filtros aplicados: volver a pedir "todo" al servidor entregaria una planilla que no coincide
 * con la pantalla desde la que se pidio.
 *
 * Las columnas que en pantalla son insignia se exportan con su **nombre**, no con el id: una planilla
 * con un "4" en la columna Estado no se puede leer sin tener el catalogo al lado.
 *
 * @param campos campos personalizados, para que sus columnas tambien salgan en la planilla
 * @param filas filas de la pagina vigente
 * @param catalogos opciones de `/lookups`, para resolver las insignias
 */
function descargarCsv (
  campos: CampoPersonalizadoMeta[],
  filas: Espacio[],
  catalogos: Record<string, OpcionFiltro[]> | undefined
) {
  const definicion = espaciosConCampos(campos)
  const columnas = columnasVisibles(definicion.columnas, clavesVisiblesPorDefecto(definicion.columnas))
    .map((columna) => {
      if (columna.comoInsignia === undefined) return columna

      const catalogo = catalogos?.[columna.comoInsignia]

      return {
        ...columna,
        presentar: (espacio: Espacio) =>
          resolverInsignia(columna.presentar(espacio), catalogo)?.etiqueta ?? columna.presentar(espacio)
      }
    })
  const url = URL.createObjectURL(
    // El BOM hace que Excel abra el archivo como UTF-8; sin el, "NESTLÉ" llega roto.
    new Blob([`﻿${armarCsv(columnas, filas)}`], { type: 'text/csv;charset=utf-8' })
  )
  const enlace = document.createElement('a')

  enlace.href = url
  enlace.download = nombreDeExportacion(GLOSARIO.espacio.plural, new Date())
  enlace.click()

  URL.revokeObjectURL(url)
}

interface PropsTarjetasProyectos {
  /** Pagina vigente, resuelta en el servidor para la consulta que dice la URL. */
  resultado: ResultadoLista<Espacio>
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}

/**
 * Grilla de tarjetas de Proyecto, con los mismos controles y paginador que la tabla.
 *
 * @param resultado filas y paginacion de la pagina vigente
 * @param opcionesDeFiltro catalogos de `/lookups`, para los filtros y para el color del estado
 */
export function TarjetasProyectos ({ resultado, opcionesDeFiltro }: PropsTarjetasProyectos) {
  const router = useRouter()
  const params = useSearchParams()
  const [pendiente, iniciarTransicion] = useTransition()

  // `ControlesTabla` incluye el selector de columnas, que en tarjetas no cambia nada. Se le pasa el
  // estado igual porque el control es del motor y no se toca desde aca.
  const [visibles, setVisibles] = useState(() => clavesVisiblesPorDefecto(ESPACIOS.columnas))

  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), ESPACIOS),
    [params]
  )

  /**
   * Aplica un cambio parcial de la consulta escribiendolo en la URL, igual que el motor de tabla.
   *
   * `replace` y no `push`: cada filtro seria una entrada del historial. La transicion mantiene la
   * grilla anterior en pantalla mientras el servidor resuelve la nueva pagina, en vez de vaciarla.
   */
  function cambiar (parcial: Partial<EstadoConsulta>) {
    const query = new URLSearchParams(construirConsulta({ ...estado, ...parcial }, ESPACIOS))
    query.set('vista', 'tarjetas')

    iniciarTransicion(() => { router.replace(`?${query.toString()}`, { scroll: false }) })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Misma fila que en la tabla: los presets son del tablero `projects`, no de la presentacion,
          asi que un preset guardado desde tarjetas se abre despues desde la tabla y al reves. Van
          aca —y no en `VistaEspacios`— porque en la rama de tabla los pinta `TablaRecurso`. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ControlesTabla
          definicion={ESPACIOS}
          estado={estado}
          visibles={visibles}
          opcionesDeFiltro={opcionesDeFiltro}
          onCambiar={cambiar}
          onVisibles={setVisibles}
          sinColumnas
        />
        <PresetsFiltro
          board="projects"
          filtrosActuales={estado.filtros}
          onAplicar={(filtros) => { cambiar({ filtros, pagina: 1 }) }}
        />
      </div>

      {resultado.filas.length === 0
        ? (
          <Vacio
            titulo={`No hay ${ESPACIOS.titulo.plural.toLowerCase()}`}
            descripcion="Probá quitando filtros o buscando otra cosa."
          />
          )
        : (
          <div className="relative" aria-busy={pendiente}>
            {/* Igual que en la tabla: refrescar atenua las tarjetas viejas en vez de taparlas, y el
                aviso va en un chip sobre la esquina. Sin indicador, la atenuacion se lee como un fallo. */}
            {pendiente && <CargandoConOrbe mensaje="Actualizando…" className="absolute right-2 top-2 z-10" />}
            <ul
              className={cn(
                'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3',
                pendiente && 'opacity-60 transition-opacity'
              )}
            >
              {/* Misma regla que en la tabla: el escalonado es del montaje. El `key` por id hace que
                  un refresco reutilice los mismos `<li>`, asi que las tarjetas ya pintadas no vuelven
                  a entrar mientras el chip de "Actualizando…" hace su trabajo. */}
              {resultado.filas.map((espacio, indice) => (
                <li
                  key={espacio.id}
                  className="animate-entrar-abajo flex"
                  style={{ animationDelay: retrasoDeAparicion(indice) }}
                >
                  <TarjetaProyecto
                    espacio={espacio}
                    estados={opcionesDeFiltro?.project_statuses}
                    className="w-full"
                  />
                </li>
              ))}
            </ul>
          </div>
          )}

      <PaginacionTabla paginacion={resultado.paginacion} onCambiar={cambiar} />
    </div>
  )
}
