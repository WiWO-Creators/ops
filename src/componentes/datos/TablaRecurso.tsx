'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { alternarOrden, construirConsulta, direccionDe, leerConsulta } from '@/datos/consulta'
import type { Columna, DefinicionRecurso, EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { Capacidad, Sobre } from '@/datos/tipos'
import type { TableroDePreset } from '@/datos/recursos'
import { leerError } from '@/datos/errores'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { MenuAccionesFila } from '@/componentes/datos/MenuAccionesFila'
import { cn } from '@/lib/clases'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from './Tabla'
import { ControlesTabla, PaginacionTabla } from './ControlesTabla'
import { useFiltrosEnUrl } from './useFiltrosEnUrl'
import {
  clavesVisiblesPorDefecto,
  columnasVisibles,
  debeAdoptarInicial,
  debePedirPagina,
  esControlDeFila,
  hayFiltrosPuestos,
  mensajeDeError,
  ordenarLocalmente,
  paginarLocalmente,
  podarPorPermisos,
  rutaDeAccion,
  unirConsultas,
  urlConParametro as urlConParametroGlobal,
  type CuerpoError
} from './tabla'
import { resolverEstado } from '@/dominio/estados-tarea'
import { pintarPrioridad } from '@/dominio/prioridades'

/**
 * Motor de tabla declarativo.
 *
 * Renderiza la lista de cualquier recurso a partir de su `DefinicionRecurso`: doce modulos no
 * escriben doce tablas casi iguales, escriben doce definiciones.
 *
 * El estado de la vista vive en la URL y no en `useState`, a proposito: asi una vista filtrada se
 * comparte con un enlace, "atras" hace lo que la persona espera y recargar no la pierde. La URL usa
 * exactamente la query que entiende la API (`construirConsulta`), asi que no hay dos formatos que
 * mantener sincronizados.
 */

interface PropsTablaRecurso<T> {
  definicion: DefinicionRecurso<T>
  /** Primera pagina, ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<T>
  /**
   * Controles propios de cada fila, a la izquierda del menu de acciones.
   *
   * El menu declarativo solo sabe de llamadas sin cuerpo ni confirmacion (`AccionRecurso`). Lo que
   * necesita un formulario o un dialogo —editar una persona, borrarla transfiriendo su trabajo— se
   * pinta por aca. `recargar` vuelve a pedir la pagina: el backend es quien sabe como quedo.
   */
  filaExtra?: (fila: T, recargar: () => void) => ReactNode
  /** Identificador de la fila. Se usa como `key` de React y como `:id` de las acciones. */
  claveFila: (fila: T) => string | number
  /**
   * Clases extra de una fila, para marcarla por su contenido. Ej: una tarea vencida.
   *
   * Es una funcion y no un campo de la definicion porque la marca depende de "hoy", no del recurso:
   * la misma fila se marca o no segun cuando se mire.
   */
  claseFila?: (fila: T) => string | undefined
  /**
   * Hace la fila clickeable: al hacer clic se escribe este parametro en la URL con el valor de la
   * fila, y quien mire esa URL abre el detalle.
   *
   * Es opcional y por defecto no esta: una tabla que no lo declara se comporta exactamente como
   * antes. La fila **no** es la unica via —eso no seria accesible—: la definicion tiene que traer
   * ademas un enlace real en alguna celda, que es el que usa el teclado. El clic de la fila es la
   * comodidad del mouse, no la funcionalidad.
   *
   * Con `superficial` el paso se escribe con `window.history.pushState`, que `useSearchParams` sigue,
   * y no con `router.push`: abrir el detalle no vuelve a renderizar la pagina en el servidor. Es para
   * los modales que se piden solos desde el navegador (el de tickets); «atras» lo cierra igual.
   *
   * @see esControlDeFila para los controles que se quedan con su propio clic.
   */
  abrirEn?: { clave: string, valor: (fila: T) => string | number, superficial?: boolean }
  /**
   * Reacciona al clic de una fila con un callback en vez de (o ademas de) navegar.
   *
   * Es para el caso de "elegir una fila abre un panel que no vive en la URL" —el organigrama en
   * lista, que abre `PanelDePersona` sobre la persona elegida—. Si la tabla ademas declara `abrirEn`,
   * las dos reacciones ocurren: la URL se escribe y el callback se llama.
   */
  alCliquearFila?: (fila: T) => void
  /** Capacidades del area, de `permissions` de `/me`. Sin ellas no se ofrece ninguna accion. */
  capacidades?: Capacidad[]
  /**
   * Opciones de los filtros que las sacan de `/lookups`, indexadas por `Filtro.desdeLookup`.
   * Las resuelve el servidor: los catalogos de Perfex son configurables y pedirlos desde el
   * navegador haria aparecer los filtros despues de que la tabla ya se pinto.
   */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /**
   * Bajo que vista se guardan y se leen los presets de filtros. Ausente = la tabla no ofrece presets.
   *
   * Es opcional porque no toda tabla los merece: una lista sin filtros no tiene nada que guardar.
   */
  board?: TableroDePreset
  /** Casillas laterales y acciones sobre las filas seleccionadas de la página actual. */
  seleccionMasiva?: (filas: T[], limpiar: () => void, recargar: () => void) => ReactNode
  /**
   * Accion principal del listado —"Nueva licitación", "Nuevo cliente"—, al extremo derecho de la
   * barra de herramientas.
   *
   * Existe como ranura y no como fila propia arriba de la tabla porque un boton solo, alineado a la
   * derecha en una linea vacia, abre una banda muerta entre el titulo y la tabla y se lee como si
   * fuera de otra pantalla. En la barra queda a la altura del buscador, que es donde se lo busca.
   */
  accion?: ReactNode
  /**
   * Como se dibuja una fila cuando el listado se mira en tarjetas. Ausente = la tabla es la unica
   * presentacion y no se ofrece el alternador, que es como se comporta cada listado que no lo pide.
   *
   * Es una funcion y no una definicion declarativa a proposito: una tarjeta no es una fila con otro
   * borde —elige que campos muestra y cuales no— y describirla por configuracion habria terminado
   * siendo un segundo motor.
   */
  tarjeta?: (fila: T, catalogos?: Record<string, OpcionFiltro[]>) => ReactNode
  /**
   * En pantallas angostas muestra las tarjetas en vez de la tabla, sin tocar la URL.
   *
   * Una tabla de ocho columnas en un telefono se lee de a una columna por vez. Con esto la tabla sigue
   * siendo la presentacion de escritorio y el alternador sigue mandando alli; debajo de `md` se pintan
   * las tarjetas. Requiere `tarjeta`. Ausente = el comportamiento de siempre.
   */
  tarjetasEnMovil?: boolean
  /**
   * Cambia cuando algo fuera de la tabla escribio (el modal de un ticket, un alta). Vuelve a pedir la
   * pagina **con la consulta vigente** —filtros, orden y pagina que la persona tiene puestos— sin
   * remontar la tabla: las filas viejas se atenuan mientras llega la respuesta y el scroll no se pierde.
   */
  refresco?: number
  /**
   * La consulta con la que se armo `inicial`, cuando quien monta la tabla la conoce.
   *
   * Sin esto la tabla supone que `inicial` es de la consulta que habia al montarse, y un
   * `router.refresh()` hecho con filtros puestos quedaba ignorado. Con esto adopta los datos nuevos
   * siempre que sean de la consulta que la URL pide ahora.
   */
  consultaDelInicial?: string
  className?: string
  /**
   * Datos ya cargados en memoria: la tabla NO pide su propia pagina al BFF y en su lugar ordena y
   * pagina localmente lo que llega aca. `estado.orden`/`estado.pagina` siguen viviendo en la URL —lo
   * unico que cambia es de donde salen las filas.
   *
   * Es para listas que ya bajaron enteras por otra via (el organigrama trae a todo el mundo de una
   * vez para pintar el arbol). **No filtra**: si la definicion declara `filtros`, esos controles se
   * siguen pintando pero no hacen nada sobre `datos` —quien los necesite filtra antes de pasarlos
   * aca, como ya hace `ListaDePersonas`—, asi que una tabla en este modo debe declarar `filtros: []`.
   */
  datos?: T[]
  /**
   * Prefijo de cada parametro que esta tabla posee en la URL (`page`, `filter[...]`, `sort`, `vista`,
   * etc.). Ausente = sin prefijo, el comportamiento de siempre.
   *
   * Hace falta cuando dos `TablaRecurso` viven en la misma pagina —"Mis Tareas" pinta una tabla de
   * Espacios/Licitaciones y otra de Tareas privadas—: sin prefijo, las dos leerian y escribirian
   * `page`/`sort` en el mismo lugar y paginar una moveria la otra.
   */
  prefijoUrl?: string
}

/**
 * Las dos presentaciones del listado, para el alternador.
 *
 * `tabla` primero aunque en otras pantallas la de por defecto sean las tarjetas: el control arranca
 * por la misma opcion en todo el producto, asi la persona no tiene que releerlo al cambiar de
 * pantalla.
 */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tarjetas', etiqueta: 'Tarjetas', icono: 'tarjetas' }
]

/** Cuantos elementos escalonan antes de que el retraso deje de crecer. */
const TOPE_ESCALONADO = 12

/** Distancia entre la entrada de un elemento y la del siguiente, en milisegundos. */
const PASO_ESCALONADO_MS = 20

/**
 * Retraso de entrada de un elemento de lista, para que la lista aparezca de a poco y no de golpe.
 *
 * El retraso se topa a proposito: crece con el indice, asi que sin tope una pagina de cien filas
 * tardaria dos segundos en terminar de aparecer y la ultima llegaria mucho despues de que la persona
 * ya empezo a leer la primera. Pasado el tope todas entran juntas, que a esa altura ya no se nota.
 *
 * @param indice posicion del elemento dentro de la pagina vigente
 * @returns el valor listo para `animation-delay`
 */
export function retrasoDeAparicion (indice: number): string {
  return `${Math.min(indice, TOPE_ESCALONADO) * PASO_ESCALONADO_MS}ms`
}

export function TablaRecurso<T> ({
  definicion,
  inicial,
  claveFila,
  filaExtra,
  claseFila,
  abrirEn,
  alCliquearFila,
  capacidades = [],
  opcionesDeFiltro,
  board,
  seleccionMasiva,
  accion,
  tarjeta,
  tarjetasEnMovil = false,
  refresco = 0,
  consultaDelInicial,
  className,
  datos,
  prefijoUrl
}: PropsTablaRecurso<T>) {
  const router = useRouter()

  const leerEstado = useCallback((p: URLSearchParams) => leerConsulta(p, definicion), [definicion])
  const construirQuery = useCallback((e: EstadoConsulta) => construirConsulta(e, definicion), [definicion])

  const { estado, params, cambiar: cambiarEnUrl, escribirParametro, leerParametro } = useFiltrosEnUrl<EstadoConsulta>({
    leer: leerEstado,
    construir: construirQuery,
    prefijo: prefijoUrl
  })
  const consulta = useMemo(() => construirQuery(estado), [estado, construirQuery])

  // La consulta con la que llegaron los datos del servidor. Mientras la URL no se mueva de ahi no
  // hay nada que volver a pedir: pedirlo igual es una peticion de mas en cada montaje.
  const consultaInicial = useRef(consultaDelInicial ?? consulta)
  const refrescoDeMontaje = useRef(refresco)
  const inicialAdoptado = useRef(inicial)

  const [seleccion, setSeleccion] = useState<{ consulta: string, ids: Array<string | number> }>({ consulta: '', ids: [] })
  const [revision, setRevision] = useState(0)
  const [resultadoRemoto, setResultado] = useState<ResultadoLista<T>>(inicial)
  const [error, setError] = useState<CuerpoError | null>(null)
  const [cargando, setCargando] = useState(false)
  const [visibles, setVisibles] = useState(() => clavesVisiblesPorDefecto(definicion.columnas))

  useEffect(() => {
    // En modo memoria los datos ya estan todos aca: no hay pagina que pedirle a nadie. El efecto de
    // abajo es quien arma `resultado` para este caso, ordenando y paginando localmente.
    if (datos !== undefined) return

    if (!debePedirPagina({
      consulta,
      consultaInicial: consultaInicial.current,
      revision,
      refresco,
      refrescoDeMontaje: refrescoDeMontaje.current
    })) return

    const control = new AbortController()

    setCargando(true)

    void pedirLista<T>(definicion.ruta, unirConsultas(definicion.consultaFija, consulta), control.signal).then((respuesta) => {
      if (control.signal.aborted) return

      setCargando(false)

      if (respuesta.ok) {
        setResultado(respuesta.resultado)
        setError(null)
      } else {
        setError(respuesta.error)
      }
    })

    return () => control.abort()
  }, [consulta, definicion.ruta, definicion.consultaFija, revision, refresco, datos])

  /**
   * Modo memoria: ordena y pagina localmente los `datos` que ya llegaron, sin pasar por `useState` ni
   * por un efecto —es una derivacion del render, no una sincronizacion con algo externo—.
   *
   * No filtra: `datos` ya deberia venir filtrado por quien monta la tabla, si hace falta.
   */
  const resultadoDeMemoria = useMemo(
    () => (datos === undefined ? null : paginarLocalmente(ordenarLocalmente(datos, estado.orden), estado.pagina, estado.porPagina)),
    [datos, estado.orden, estado.pagina, estado.porPagina]
  )

  // La fuente vigente de filas y paginacion: la de memoria cuando la tabla la declara, o la que trajo
  // el efecto de arriba. El resto del componente no sabe ni le importa cual de las dos es.
  const resultado = resultadoDeMemoria ?? resultadoRemoto

  /**
   * Adopta los datos frescos que baja `router.refresh()`.
   *
   * Una escritura hecha fuera de la tabla —un alta, por ejemplo— refresca la pagina del servidor y
   * manda un `inicial` nuevo, pero `useState` lo ignora despues del montaje y la fila recien creada
   * no aparece hasta recargar a mano.
   *
   * **Solo cuando `inicial` es de la consulta que la URL pide ahora**: si ya se filtro u ordeno, el
   * dato bueno es el que trajo el efecto de arriba, y pisarlo con el del servidor devolveria la tabla
   * sin filtrar. Quien conoce la consulta de `inicial` la manda en `consultaDelInicial`.
   */
  useEffect(() => {
    const sonNuevos = inicialAdoptado.current !== inicial
    const adoptar = debeAdoptarInicial({
      consulta,
      consultaInicial: consultaDelInicial ?? consultaInicial.current,
      revision,
      refresco,
      refrescoDeMontaje: refrescoDeMontaje.current
    }, sonNuevos)

    if (!adoptar) return

    inicialAdoptado.current = inicial
    setResultado(inicial)
  }, [inicial, consulta, consultaDelInicial, revision, refresco])

  // La presentacion vive en la URL (`?vista=`) y en ningun otro lado, igual que el filtro y el
  // orden: asi un enlace la conserva y recargar no la pierde. La tabla es lo que se ve sin pedir
  // nada, de modo que cualquier valor que no sea `tarjetas` deja el listado como estaba.
  const enTarjetas = tarjeta !== undefined && leerParametro('vista') === 'tarjetas'

  /** Escribe la presentacion elegida en la URL, conservando filtros, orden y pagina. */
  function cambiarVista (elegida: string): void {
    escribirParametro('vista', elegida)
  }

  /** Aplica un cambio parcial del estado escribiendolo en la URL, que es su unica fuente. */
  function cambiar (parcial: Partial<EstadoConsulta>) {
    cambiarEnUrl(parcial)
  }

  /**
   * URL que abre el detalle de una fila, o `null` si la tabla no declara `abrirEn`.
   *
   * La clave de `abrirEn` NO lleva el prefijo de esta instancia: es una convencion global —`tarea`,
   * `ticket`— que comparten el modal y cualquier enlace externo, y prefijarla la dejaria sin abrir
   * desde afuera.
   *
   * @param fila la fila
   * @returns la URL relativa, con los filtros y el orden vigentes intactos
   */
  function urlDeFila (fila: T): string | null {
    if (abrirEn === undefined) return null

    return urlConParametroGlobal(new URLSearchParams(params.toString()), abrirEn.clave, String(abrirEn.valor(fila)))
  }

  /**
   * Abre el detalle desde un clic en cualquier parte de la fila.
   *
   * Se abstiene en tres casos, y ninguno es opcional: cuando el clic nacio en un control propio de la
   * fila —un menu, un selector de estado, el enlace al espacio, que van a otro lado—, cuando trae una
   * tecla modificadora —abrir en otra pestaña es del enlace, no de la fila— y cuando hay texto
   * seleccionado, porque soltar el mouse tras seleccionar no es pedir navegar.
   *
   * `push` y no `replace`: abrir el detalle es un paso del historial, y por eso "atras" lo cierra.
   * Con `abrirEn.superficial` el paso es de `window.history` y no pasa por el servidor.
   *
   * `href` es `null` cuando la tabla no declara `abrirEn` pero si `alCliquearFila`: ahi no hay URL
   * que escribir y el callback es toda la reaccion.
   */
  function abrirFila (evento: React.MouseEvent<HTMLTableRowElement>, fila: T, href: string | null): void {
    if (evento.defaultPrevented) return
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
    if (esControlDeFila(evento.target as Element | null)) return
    if ((window.getSelection()?.toString() ?? '') !== '') return

    alCliquearFila?.(fila)

    if (href === null) return

    if (abrirEn?.superficial === true) {
      window.history.pushState(null, '', href)

      return
    }

    router.push(href, { scroll: false })
  }

  const seleccionadas = seleccion.consulta === consulta
    ? resultado.filas.filter((fila) => seleccion.ids.includes(claveFila(fila)))
    : []
  const idsSeleccionados = seleccionadas.map(claveFila)

  /** Limita la selección a la consulta y página visibles para evitar acciones sobre filas ocultas. */
  function seleccionar (ids: Array<string | number>): void {
    setSeleccion({ consulta, ids })
  }

  /**
   * Recarga despues de una accion de fila.
   *
   * Hace las dos cosas porque la tabla no sabe de donde vienen sus datos: `router.refresh()` pone al
   * dia una pagina resuelta en el servidor, y la revision vuelve a pedir por el BFF la que se pide desde
   * el navegador (las pestañas del Proyecto), a la que un refresh del servidor no llega.
   */
  function recargar (): void {
    setRevision((n) => n + 1)
    router.refresh()
  }

  const columnas = columnasVisibles(definicion.columnas, visibles)
  const acciones = podarPorPermisos(definicion.acciones, capacidades)

  /**
   * El listado en tarjetas.
   *
   * @param dibujar la tarjeta de una fila
   */
  function tarjetas (dibujar: NonNullable<typeof tarjeta>): ReactNode {
    return (
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {/* Mismo escalonado que las filas, y por el mismo motivo: la animacion corre al
            nacer el nodo, asi que el `key` por fila hace que un refresco reutilice los
            `<li>` ya pintados en vez de volver a hacerlos entrar. */}
        {resultado.filas.map((fila, indice) => (
          <li
            key={claveFila(fila)}
            className="animate-entrar-abajo flex"
            style={{ animationDelay: retrasoDeAparicion(indice) }}
          >
            {dibujar(fila, opcionesDeFiltro)}
          </li>
        ))}
      </ul>
    )
  }

  /** El listado en tabla. */
  function tabla (): ReactNode {
    return (
      <Tabla>
        <EncabezadoTabla>
          <tr>
            {seleccionMasiva !== undefined && (
              <CeldaEncabezado>
                <input type="checkbox" className={CLASES_CASILLA}
                  aria-label="Seleccionar toda esta página"
                  disabled={cargando}
                  checked={seleccionadas.length > 0 && seleccionadas.length === resultado.filas.length}
                  ref={(elemento) => { if (elemento) elemento.indeterminate = seleccionadas.length > 0 && seleccionadas.length < resultado.filas.length }}
                  onChange={(evento) => seleccionar(evento.target.checked ? resultado.filas.map(claveFila) : [])}
                />
              </CeldaEncabezado>
            )}
            {columnas.map((columna) => {
              const direccion = columna.ordenPor === undefined
                ? null
                : direccionDe(estado.orden, columna.ordenPor)

              return (
                <CeldaEncabezado
                  key={columna.clave}
                  numerica={columna.numerica}
                  angosta={columna.angosta}
                  aria-sort={columna.ordenPor === undefined
                    ? undefined
                    : direccion === 'asc' ? 'ascending' : direccion === 'desc' ? 'descending' : 'none'}
                >
                  {columna.ordenPor === undefined
                    ? columna.encabezado
                    : (
                      <button
                        type="button"
                        className="hover:text-texto inline-flex items-center gap-1"
                        onClick={() => { cambiar({ orden: alternarOrden(estado.orden, columna.ordenPor ?? ''), pagina: 1 }) }}
                      >
                        {columna.encabezado}
                        <Flecha direccion={direccion} />
                      </button>
                      )}
                </CeldaEncabezado>
              )
            })}
            {(acciones.length > 0 || filaExtra !== undefined) && (
              <CeldaEncabezado className="w-10">
                <span className="sr-only">Acciones</span>
              </CeldaEncabezado>
            )}
          </tr>
        </EncabezadoTabla>

        <CuerpoTabla>
          {/* La entrada escalonada es solo del montaje, y lo garantiza el `key`: una animacion
              de CSS corre cuando nace el nodo, y un refresco que devuelve las mismas filas
              reutiliza los mismos `<tr>`. Volver a animarlas encima del chip de "Actualizando…"
              seria justo el parpadeo que ese chip vino a evitar. */}
          {resultado.filas.map((fila, indice) => {
            const href = urlDeFila(fila)
            const clicable = href !== null || alCliquearFila !== undefined

            return (
            <FilaTabla
              key={claveFila(fila)}
              className={cn('animate-entrar-abajo', claseFila?.(fila), idsSeleccionados.includes(claveFila(fila)) && 'bg-seleccionado')}
              aria-selected={seleccionMasiva === undefined ? undefined : idsSeleccionados.includes(claveFila(fila))}
              style={{ animationDelay: retrasoDeAparicion(indice) }}
              interactiva={clicable}
              onClick={clicable ? (evento) => { abrirFila(evento, fila, href) } : undefined}
            >
              {seleccionMasiva !== undefined && (
                <CeldaTabla>
                  <label className="flex min-h-8 cursor-pointer items-center justify-center px-2">
                    <input type="checkbox" className={CLASES_CASILLA}
                      aria-label={`Seleccionar fila ${claveFila(fila)}`}
                      disabled={cargando}
                      checked={idsSeleccionados.includes(claveFila(fila))}
                      onChange={(evento) => seleccionar(evento.target.checked
                        ? [...idsSeleccionados, claveFila(fila)]
                        : idsSeleccionados.filter((id) => id !== claveFila(fila)))}
                    />
                  </label>
                </CeldaTabla>
              )}
              {columnas.map((columna) => (
                <CeldaTabla key={columna.clave} numerica={columna.numerica} angosta={columna.angosta} sinCortar={columna.sinCortar}>
                  <Celda columna={columna} fila={fila} catalogos={opcionesDeFiltro} />
                </CeldaTabla>
              ))}
              {(acciones.length > 0 || filaExtra !== undefined) && (
                <CeldaTabla>
                  {/* `stopPropagation`: la fila entera es un enlace cuando `urlDeFila`
                      devuelve algo, y un clic en "Editar" no tiene que navegar ademas. */}
                  <span
                    className="flex items-center justify-end gap-1"
                    onClick={(evento) => { evento.stopPropagation() }}
                  >
                    {filaExtra?.(fila, recargar)}
                    {acciones.length > 0 && (
                      <MenuAcciones
                        acciones={acciones}
                        id={claveFila(fila)}
                        onError={setError}
                        onListo={recargar}
                      />
                    )}
                  </span>
                </CeldaTabla>
              )}
            </FilaTabla>
            )
          })}
        </CuerpoTabla>
      </Tabla>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ControlesTabla
          board={board}
          definicion={definicion}
          estado={estado}
          visibles={visibles}
          opcionesDeFiltro={opcionesDeFiltro}
          onCambiar={cambiar}
          onVisibles={setVisibles}
          // En tarjetas el selector de columnas no cambia nada: la tarjeta elige sus campos. Un
          // control que no hace nada se lee como un control roto.
          sinColumnas={enTarjetas}
        />
        <div className="flex items-center gap-2">
          {/* Con `tarjetasEnMovil` el alternador no existe en pantallas angostas: ahi las tarjetas
              son la unica presentacion, y un control que no cambia nada se lee como roto. */}
          {tarjeta !== undefined && (
            <div className={cn(tarjetasEnMovil && 'hidden md:block')}>
              <Segmentado
                etiqueta="Presentación del listado"
                opciones={VISTAS}
                activo={enTarjetas ? 'tarjetas' : 'tabla'}
                onElegir={cambiarVista}
              />
            </div>
          )}
          {accion}
        </div>
      </div>

      {seleccionMasiva?.(seleccionadas, () => seleccionar([]), () => setRevision((n) => n + 1))}

      {error !== null
        ? (
          <ErrorEstado
            detalle={mensajeDeError(error, definicion.filtros)}
            onReintentar={() => { setRevision((n) => n + 1) }}
          />
          )
        : resultado.filas.length === 0
          ? (
            <Vacio
              titulo={`No hay ${definicion.titulo.plural.toLowerCase()}`}
              descripcion={
                hayFiltrosPuestos(estado)
                  ? 'Prueba quitando filtros o buscando otra cosa.'
                  : 'Todavía no hay nada cargado.'
              }
            />
            )
          : (
            <div aria-busy={cargando} className="relative">
              {/* Refrescar no es cargar de cero: las filas viejas siguen siendo lo mas util que hay en
                  pantalla, asi que se atenuan en vez de taparse, y el aviso va en un chip encima de la
                  esquina. Antes esto era solo la atenuacion, que sin indicador se lee como un fallo. */}
              {cargando && <CargandoConOrbe mensaje="Actualizando…" className="absolute right-2 top-2 z-10" />}
              <div className={cn(cargando && 'opacity-60 transition-opacity')}>
              {enTarjetas && tarjeta !== undefined
                ? tarjetas(tarjeta)
                : tarjetasEnMovil && tarjeta !== undefined
                  ? (
                    <>
                      <div className="md:hidden">{tarjetas(tarjeta)}</div>
                      <div className="hidden md:block">{tabla()}</div>
                    </>
                    )
                  : tabla()}
              </div>
            </div>
            )}

      <PaginacionTabla paginacion={resultado.paginacion} onCambiar={cambiar} />
    </div>
  )
}

/** Flecha de orden del encabezado. Sin direccion queda tenue: indica que la columna se puede ordenar. */
function Flecha ({ direccion }: { direccion: 'asc' | 'desc' | null }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 transition-transform', direccion === null && 'opacity-30', direccion === 'asc' && 'rotate-180')}
    >
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface PropsMenuAcciones {
  acciones: ReturnType<typeof podarPorPermisos>
  id: string | number
  onError: (error: CuerpoError) => void
  onListo: () => void
}

/** Menu de acciones de una fila. Al terminar refresca la vista: el backend es quien sabe como quedo. */
function MenuAcciones ({ acciones, id, onError, onListo }: PropsMenuAcciones) {
  const [enCurso, setEnCurso] = useState(false)

  async function ejecutar (ruta: string, metodo: 'POST' | 'DELETE') {
    setEnCurso(true)

    const respuesta = await fetch(`/api/bff/${rutaDeAccion(ruta, id)}`, { method: metodo })

    setEnCurso(false)

    if (respuesta.ok) {
      onListo()
      return
    }

    onError(await leerError(respuesta))
  }

  return (
    <MenuAccionesFila
      cargando={enCurso}
      ariaLabel="Acciones"
      acciones={acciones.map((accion) => ({
        clave: accion.clave,
        etiqueta: accion.etiqueta,
        peligroso: accion.metodo === 'DELETE',
        onSeleccionar: () => { void ejecutar(accion.ruta, accion.metodo) }
      }))}
    />
  )
}

type Respuesta<T> = { ok: true, resultado: ResultadoLista<T> } | { ok: false, error: CuerpoError }


/**
 * Pide una pagina al BFF.
 *
 * Nunca lanza por codigo de estado: el error del contrato es un valor mas, y la tabla tiene que
 * poder mostrarlo. Una respuesta sin JSON valido (un 502 del proxy) tambien sale como error.
 *
 * @param ruta primer segmento del recurso en la API
 * @param consulta query string ya armada, sin `?`
 * @param senal aborta la peticion cuando la consulta cambia antes de que llegue
 */
async function pedirLista<T> (ruta: string, consulta: string, senal: AbortSignal): Promise<Respuesta<T>> {
  try {
    const respuesta = await fetch(`/api/bff/${ruta}${consulta === '' ? '' : `?${consulta}`}`, { signal: senal })

    if (!respuesta.ok) return { ok: false, error: await leerError(respuesta) }

    const sobre = await respuesta.json() as Sobre<T[]>

    return { ok: true, resultado: { filas: sobre.data, paginacion: sobre.meta?.pagination } }
  } catch (fallo) {
    if (fallo instanceof DOMException && fallo.name === 'AbortError') {
      return { ok: false, error: { code: 'bad_request', message: 'Petición cancelada' } }
    }

    return {
      ok: false,
      error: { code: 'server_error', message: 'No se pudo contactar al servidor. Revisa tu conexión.' }
    }
  }
}

/**
 * Contenido de una celda.
 *
 * Cuando la columna declara `comoInsignia`, el valor se resuelve contra el catalogo y se pinta con su
 * nombre y su color. Un valor que el catalogo no conoce cae a su id en una insignia de contorno: eso
 * pasa cuando alguien agrega un estado en Perfex y la pantalla todavia no lo recargo, y un id visible
 * es mas util que una celda vacia. La fila no cambia de forma por eso —insignia sigue siendo
 * insignia—, que es lo que hacia que una Tarea con estado nuevo se leyera distinto del resto.
 *
 * La resolucion es la misma que usa `<EstadoDeTarea>` fuera de la tabla: un solo `resolverEstado`
 * para todas las pantallas donde aparece una Tarea.
 */
function Celda<T> ({
  columna,
  fila,
  catalogos
}: {
  columna: Columna<T>
  fila: T
  catalogos: Record<string, OpcionFiltro[]> | undefined
}) {
  const contenido = columna.presentar(fila)

  if (columna.comoInsignia === undefined) return <>{contenido}</>

  // Un presentador que ya devuelve su propio elemento —el estado editable de la pestaña Tareas—
  // pinta lo suyo: resolverlo contra el catalogo daria un id inventado en vez de un control.
  if (typeof contenido !== 'string' && typeof contenido !== 'number') return <>{contenido}</>

  // La prioridad se pinta con la escala semantica y no con el color del catalogo: es una escala de
  // urgencia y no una categoria, y la de ticket ademas viene sin color y en ingles. Ver
  // `dominio/prioridades`. Un id fuera de la escala cae al camino de siempre.
  if (columna.comoInsignia === 'task_priorities' || columna.comoInsignia === 'ticket_priorities') {
    const prioridad = pintarPrioridad(contenido, columna.comoInsignia)

    if (prioridad !== null) {
      return <Insignia tono={prioridad.tono} tamano="chico">{prioridad.etiqueta}</Insignia>
    }
  }

  const insignia = resolverEstado(contenido, catalogos?.[columna.comoInsignia])

  return (
    <Insignia
      tono={insignia.desconocido ? 'contorno' : 'neutro'}
      color={insignia.color}
      tamano="chico"
    >
      {insignia.etiqueta}
    </Insignia>
  )
}

