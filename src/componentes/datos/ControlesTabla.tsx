'use client'

import { POR_PAGINA_MAXIMO } from '@/datos/consulta'
import type { DefinicionRecurso, EstadoConsulta, Filtro, OpcionFiltro } from '@/definiciones/tipos'
import type { Paginacion } from '@/datos/tipos'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { opcionesPorPagina } from './tabla'

/**
 * Controles de una vista de lista: busqueda, filtros, columnas y paginacion.
 *
 * No tienen estado propio: reciben el estado de la consulta y avisan de los cambios. El unico dueño
 * del estado es la URL, y eso vive en `TablaRecurso`.
 */

/**
 * Radix Select no acepta un item con valor vacio, y "sin filtrar" necesita ser una opcion elegible.
 * El centinela viaja solo por la UI: se traduce a lista vacia antes de tocar el estado.
 */
const SIN_FILTRO = '__todos__'

interface PropsControles<T> {
  definicion: DefinicionRecurso<T>
  estado: EstadoConsulta
  /** Claves de las columnas visibles. */
  visibles: string[]
  /**
   * Opciones de los filtros que las sacan de `/lookups`, indexadas por `Filtro.desdeLookup`.
   *
   * Las resuelve el servidor y bajan ya hechas: si el motor pidiera `/lookups` por su cuenta, cada
   * tabla de la pantalla lo pediria otra vez, y ademas lo haria despues de pintar — con los filtros
   * apareciendo tarde delante de quien ya empezo a usarlos.
   */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  onCambiar: (parcial: Partial<EstadoConsulta>) => void
  onVisibles: (claves: string[]) => void
  /**
   * Oculta el menu de columnas.
   *
   * Lo usan las presentaciones que no son una tabla: elegir columnas ahi no cambia nada de lo que se
   * ve, y un control que no hace nada es peor que uno ausente.
   */
  sinColumnas?: boolean
}

/**
 * Barra de controles sobre la tabla.
 *
 * @param onCambiar recibe el pedazo de estado que cambio; quien llama decide como aplicarlo
 * @param onVisibles recibe la lista completa de columnas visibles
 */
export function ControlesTabla<T> ({
  definicion,
  estado,
  visibles,
  opcionesDeFiltro = {},
  onCambiar,
  onVisibles,
  sinColumnas = false
}: PropsControles<T>) {
  /** Cambia un filtro y vuelve a la primera pagina: la 7 de un listado nuevo casi nunca existe. */
  function cambiarFiltro (clave: string, valores: string[]) {
    onCambiar({ filtros: { ...estado.filtros, [clave]: valores }, pagina: 1 })
  }

  function alternarColumna (clave: string) {
    const activa = visibles.includes(clave)
    const siguiente = definicion.columnas
      .map((columna) => columna.clave)
      .filter((c) => (c === clave ? !activa : visibles.includes(c)))

    // Una tabla sin ninguna columna no es una vista, es un error: la ultima no se puede apagar.
    if (siguiente.length > 0) onVisibles(siguiente)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {definicion.busqueda && (
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(evento) => {
            evento.preventDefault()
            const campo = new FormData(evento.currentTarget).get('q')
            onCambiar({ busqueda: typeof campo === 'string' ? campo : '', pagina: 1 })
          }}
        >
          <Entrada
            type="search"
            name="q"
            // Sin debounce: se busca al enviar. Una peticion por tecla es la forma mas facil de
            // convertir una lista grande en una tormenta de 422 y de scroll saltando solo.
            aria-label={`Buscar ${definicion.titulo.plural.toLowerCase()}`}
            placeholder={`Buscar ${definicion.titulo.plural.toLowerCase()}…`}
            defaultValue={estado.busqueda}
            key={estado.busqueda}
            className="w-56"
          />
          <Boton type="submit" tamano="chico">Buscar</Boton>
        </form>
      )}

      {definicion.filtros.map((filtro) => (
        <ControlFiltro
          key={filtro.clave}
          filtro={filtro}
          valores={estado.filtros[filtro.clave] ?? []}
          opcionesDeFiltro={opcionesDeFiltro}
          onCambiar={(valores) => cambiarFiltro(filtro.clave, valores)}
        />
      ))}

      {!sinColumnas && (
      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton tamano="chico" variante="sutil">Columnas</Boton>
        </DisparadorMenu>
        <ContenidoMenu align="end">
          {definicion.columnas.map((columna) => (
            <ItemMenu
              key={columna.clave}
              // Sin esto el menu se cierra al primer clic y hay que reabrirlo por cada columna.
              onSelect={(evento) => {
                evento.preventDefault()
                alternarColumna(columna.clave)
              }}
            >
              <Marca activa={visibles.includes(columna.clave)} />
              {columna.encabezado}
            </ItemMenu>
          ))}
        </ContenidoMenu>
      </MenuContextual>
      )}
    </div>
  )
}

interface PropsControlFiltro {
  filtro: Filtro
  valores: string[]
  /** Opciones ya resueltas para los filtros que las sacan de `/lookups`. */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  onCambiar: (valores: string[]) => void
}

/** Un filtro, con el control que corresponde a su `tipo`. */
function ControlFiltro ({ filtro, valores, opcionesDeFiltro = {}, onCambiar }: PropsControlFiltro) {
  if (filtro.tipo === 'rangoFechas') {
    return <FiltroRangoFechas filtro={filtro} valores={valores} onCambiar={onCambiar} />
  }

  const opciones = opcionesDe(filtro, opcionesDeFiltro)

  // Un filtro que saca sus opciones de `/lookups` no se dibuja hasta que alguien se las pase: un
  // desplegable vacio no filtra nada y ocupa el mismo lugar que uno que si funciona.
  if (opciones.length === 0) return null

  if (filtro.tipo === 'multiple') {
    return <FiltroMultiple filtro={filtro} opciones={opciones} valores={valores} onCambiar={onCambiar} />
  }

  return <FiltroSimple filtro={filtro} opciones={opciones} valores={valores} onCambiar={onCambiar} />
}

/**
 * Opciones de un filtro segun su tipo y su origen.
 *
 * El booleano las trae puestas: el backend espera `1`/`0` y no tiene sentido declararlas en cada
 * definicion. Las de `desdeLookup` llegan resueltas desde el servidor, porque los catalogos de Perfex
 * son configurables y codificarlos aca garantiza que se rompan cuando alguien agregue una etapa.
 */
function opcionesDe (filtro: Filtro, desdeServidor: Record<string, OpcionFiltro[]>): OpcionFiltro[] {
  if (filtro.tipo === 'booleano') {
    return filtro.opciones ?? [
      { valor: '1', etiqueta: 'Sí' },
      { valor: '0', etiqueta: 'No' }
    ]
  }

  if (filtro.opciones !== undefined) return filtro.opciones

  return filtro.desdeLookup === undefined ? [] : desdeServidor[filtro.desdeLookup] ?? []
}

interface PropsFiltroConOpciones extends PropsControlFiltro {
  opciones: OpcionFiltro[]
}

/** Filtro de un solo valor: desplegable con una opcion para no filtrar. */
function FiltroSimple ({ filtro, opciones, valores, onCambiar }: PropsFiltroConOpciones) {
  return (
    <Selector
      value={valores[0] ?? SIN_FILTRO}
      onValueChange={(valor) => onCambiar(valor === SIN_FILTRO ? [] : [valor])}
    >
      <DisparadorSelector aria-label={filtro.etiqueta} marcador={filtro.etiqueta} className="w-44" />
      <ContenidoSelector>
        <Opcion value={SIN_FILTRO}>{filtro.etiqueta}: todos</Opcion>
        {opciones.map((opcion) => (
          <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}

/** Filtro de varios valores: menu con marcas, que el backend traduce a `IN`. */
function FiltroMultiple ({ filtro, opciones, valores, onCambiar }: PropsFiltroConOpciones) {
  const etiqueta = valores.length === 0 ? filtro.etiqueta : `${filtro.etiqueta} (${valores.length})`

  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton tamano="chico">{etiqueta}</Boton>
      </DisparadorMenu>
      <ContenidoMenu align="start">
        {opciones.map((opcion) => (
          <ItemMenu
            key={opcion.valor}
            onSelect={(evento) => {
              evento.preventDefault()
              onCambiar(
                valores.includes(opcion.valor)
                  ? valores.filter((v) => v !== opcion.valor)
                  : [...valores, opcion.valor]
              )
            }}
          >
            <Marca activa={valores.includes(opcion.valor)} />
            {opcion.etiqueta}
          </ItemMenu>
        ))}
      </ContenidoMenu>
    </MenuContextual>
  )
}

/**
 * Filtro de rango de fechas: dos `<input type="date">` nativos.
 *
 * Nativos y no un calendario propio porque el nativo ya trae teclado, formato local y el calendario
 * del sistema operativo. Viajan como `desde,hasta`, que es lo que el backend espera del rango.
 */
function FiltroRangoFechas ({ filtro, valores, onCambiar }: PropsControlFiltro) {
  const desde = valores[0] ?? ''
  const hasta = valores[1] ?? ''

  /**
   * Un extremo suelto se envia igual.
   *
   * `date_from` y `date_to` son dos filtros independientes de la whitelist, cada uno un `>=` o un
   * `<=`: verificado contra la API, los tres casos responden 200. Descartar el rango hasta tener las
   * dos fechas obligaba a elegir una fecha final que nadie queria poner.
   */
  function cambiar (nuevoDesde: string, nuevoHasta: string) {
    onCambiar(nuevoDesde === '' && nuevoHasta === '' ? [] : [nuevoDesde, nuevoHasta])
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Dos campos de fecha sin nombre no dicen que fecha filtran. El `aria-label` de cada extremo
          resuelve el lector de pantalla; esto resuelve el resto de la gente. */}
      <span className="text-texto-tenue text-xs">{filtro.etiqueta}</span>
      <Entrada
        type="date"
        aria-label={`${filtro.etiqueta}: desde`}
        value={desde}
        max={hasta === '' ? undefined : hasta}
        onChange={(evento) => cambiar(evento.target.value, hasta)}
        className="w-36"
      />
      <span className="text-texto-sutil text-xs">a</span>
      <Entrada
        type="date"
        aria-label={`${filtro.etiqueta}: hasta`}
        value={hasta}
        min={desde === '' ? undefined : desde}
        onChange={(evento) => cambiar(desde, evento.target.value)}
        className="w-36"
      />
    </div>
  )
}

/** Marca de seleccion de los menus. Ocupa lugar siempre, para que la lista no salte al marcar. */
function Marca ({ activa }: { activa: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-acento shrink-0">
      {activa && (
        <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

interface PropsPaginacion {
  paginacion: Paginacion | undefined
  onCambiar: (parcial: Partial<EstadoConsulta>) => void
}

/**
 * Paginacion de la tabla, leida de `meta.pagination`.
 *
 * Sin `meta` no se dibuja nada: inventar "pagina 1 de 1" cuando el backend no dijo cuantas hay es
 * afirmar algo que no se sabe.
 */
export function PaginacionTabla ({ paginacion, onCambiar }: PropsPaginacion) {
  if (paginacion === undefined) return null

  const { page, per_page: porPagina, total, total_pages: totalPaginas } = paginacion

  return (
    <div className="text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs">
      <p aria-live="polite">
        Página {page} de {Math.max(1, totalPaginas)} · {total} en total
      </p>

      <div className="flex items-center gap-2">
        <Selector
          value={String(porPagina)}
          onValueChange={(valor) => onCambiar({ porPagina: Number(valor), pagina: 1 })}
        >
          <DisparadorSelector aria-label="Filas por página" className="w-24" />
          <ContenidoSelector>
            {opcionesPorPagina(POR_PAGINA_MAXIMO, porPagina).map((cantidad) => (
              <Opcion key={cantidad} value={String(cantidad)}>{cantidad}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>

        <Boton tamano="chico" disabled={page <= 1} onClick={() => onCambiar({ pagina: page - 1 })}>
          Anterior
        </Boton>
        <Boton tamano="chico" disabled={page >= totalPaginas} onClick={() => onCambiar({ pagina: page + 1 })}>
          Siguiente
        </Boton>
      </div>
    </div>
  )
}
