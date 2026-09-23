'use client'

import { Suspense, useEffect, useEffectEvent, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { sinColumnasVacias, unirConsultas } from '@/componentes/datos/tabla'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { staffParaFiltros } from '@/datos/asignables'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { mensajeDeRespuesta, pedirRespuesta, pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { Lookups, TableroDePreset } from '@/datos/recursos'
import type { Capacidad, Sobre } from '@/datos/tipos'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/**
 * Pestaña de listado generica del detalle de Proyecto.
 *
 * Doce pestañas no escriben doce tablas: escriben una definicion y montan esto. La definicion llega
 * ya acotada al proyecto (`projects/{id}/tickets`), porque acotar por ruta y no por filtro deja el
 * proyecto fuera de la URL, donde seria editable y borrable por quien mira.
 *
 * Los datos se piden **desde el navegador**, no bajan resueltos del servidor: la pagina monta solo la
 * pestaña activa, asi que una pestaña que nadie abre no cuesta ninguna peticion. Ese es el motivo de
 * que estos paneles sean componentes cliente y no fragmentos de servidor.
 */

interface PropsPanelRecurso<T> {
  /** La definicion con la `ruta` ya apuntando al subrecurso del proyecto. */
  definicion: DefinicionRecurso<T>
  claveFila: (fila: T) => string | number
  /** Capacidades del area, de `permissions` de `/me`. Sin ellas no se ofrece ninguna accion. */
  capacidades?: Capacidad[]
  /** Botonera propia de la pestaña ("Nuevo hito", "Nueva nota"…). Se pinta sobre la tabla. */
  barra?: ReactNode
  /**
   * Cambia cuando la pestaña escribio algo (o un evento de afuera avisa que cambio). La tabla vuelve a
   * pedir la pagina **con la consulta vigente** —filtros, orden y pagina puestos—, sin remontarse: sin
   * parpadeo de "Cargando…" y sin perder el scroll. Crear un registro no cambia la URL, y por eso hace
   * falta esta señal.
   */
  revision?: number
  /**
   * Tablero de presets de filtros al que pertenece la pestaña. Sin el no se pinta el selector de
   * presets: un preset guardado bajo un tablero equivocado ofrece filtros que este recurso no acepta,
   * y aplicarlo devuelve 422.
   */
  board?: TableroDePreset
  /**
   * De donde salen los catalogos con los que se pintan estados y se ofrecen filtros.
   *
   * Por defecto el `/lookups` del equipo. El portal del cliente tiene el suyo —un subconjunto— y
   * pedir el del equipo con una sesion de contacto devuelve 401: la ruta entra por aca, igual que
   * la del listado entra por `definicion.ruta`.
   */
  rutaLookups?: string
  /**
   * Como se dibuja una fila en tarjetas. Se pasa tal cual al motor de tabla, que es quien ofrece el
   * alternador y recuerda la eleccion en la URL. Ausente = la pestaña solo se ve como tabla.
   */
  tarjeta?: (fila: T, catalogos?: Record<string, OpcionFiltro[]>) => ReactNode
  /** Clases extra de una fila segun su contenido (un ticket sin leer). Ver `TablaRecurso`. */
  claseFila?: (fila: T) => string | undefined
  /** Tarjetas en vez de tabla debajo de `md`, sin tocar la URL. Ver `TablaRecurso`. */
  tarjetasEnMovil?: boolean
  /**
   * Opciones de filtro que no salen de los catalogos de `/lookups` (los Proyectos de la bandeja
   * global, por ejemplo). Se suman a las que resuelve el panel, indexadas por `desdeLookup`.
   */
  opcionesExtra?: Record<string, OpcionFiltro[]>
  /**
   * Abre el detalle de una fila escribiendo un parametro en la URL (`?ticket=12`). Se pasa tal cual
   * al motor de tabla; la definicion tiene que traer ademas un enlace real en alguna celda.
   */
  abrirEn?: { clave: string, valor: (fila: T) => string | number }
}

export function PanelRecurso<T> (props: PropsPanelRecurso<T>): ReactElement {
  // `TablaRecurso` y este panel leen `useSearchParams`. Sin este limite de Suspense falla el build de
  // cualquier pagina que los monte.
  return (
    <Suspense fallback={<Cargando mensaje={`Cargando ${props.definicion.titulo.plural.toLowerCase()}…`} />}>
      <ListaDelProyecto {...props} />
    </Suspense>
  )
}

/** Estado de la carga inicial. El error es un texto listo para mostrar, no un envelope. */
type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'listo', inicial: ResultadoLista<T>, opciones: Record<string, OpcionFiltro[]>, consulta: string }
  | { fase: 'error', mensaje: string }
  /** La API dijo 403: no es un error que se reintente, es un acceso que no hay. */
  | { fase: 'sinPermiso' }

function ListaDelProyecto<T> ({
  definicion,
  claveFila,
  capacidades = [],
  barra,
  revision = 0,
  board,
  rutaLookups = 'lookups',
  tarjeta,
  tarjetasEnMovil,
  claseFila,
  opcionesExtra,
  abrirEn
}: PropsPanelRecurso<T>): ReactElement {
  const params = useSearchParams()

  // La primera pagina se pide con la consulta que la URL tiene AL EMPEZAR la carga, y la tabla recibe
  // esa misma consulta (`consultaDelInicial`): si la URL se movio mientras tanto, la tabla lo nota y
  // vuelve a pedir. Despues de montada, los refrescos los hace la tabla, siempre con la vigente.
  const consulta = useMemo(
    () => construirConsulta(leerConsulta(new URLSearchParams(params.toString()), definicion), definicion),
    [params, definicion]
  )

  const [carga, setCarga] = useState<Carga<T>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [peticion, setPeticion] = useState(`${definicion.ruta}|0`)

  // Volver a "cargando" en el render y no en el efecto: al cambiar de recurso los datos viejos
  // seguirian en pantalla un instante. React admite este `setState` durante el render y es lo que la
  // regla de hooks pide en vez de encadenar renders desde el efecto. `revision` NO esta en la clave: un
  // refresco no vuelve a "cargando", lo resuelve la tabla en su lugar.
  const actual = `${definicion.ruta}|${intento}`
  if (peticion !== actual) {
    setPeticion(actual)
    setCarga({ fase: 'cargando' })
  }

  /** Vuelve a la fase de carga y dispara el efecto otra vez. */
  function reintentar (): void {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }

  // Lee la consulta vigente sin volverla dependencia: la carga inicial no se repite por cada cambio de
  // filtro (eso lo pide la tabla), pero un reintento tiene que salir con los filtros puestos.
  const cargar = useEffectEvent((senal: AbortSignal) => primeraPagina(definicion, consulta, rutaLookups, senal))

  useEffect(() => {
    const control = new AbortController()

    void cargar(control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [definicion, intento, rutaLookups])

  // Memoizadas: un objeto nuevo en cada render haria que los controles de la tabla se redibujen sin motivo.
  const opcionesDeCarga = carga.fase === 'listo' ? carga.opciones : undefined
  const opciones = useMemo(
    () => (opcionesExtra === undefined ? opcionesDeCarga : { ...opcionesDeCarga, ...opcionesExtra }),
    [opcionesDeCarga, opcionesExtra]
  )

  if (carga.fase === 'cargando') {
    return (
      <div className="flex flex-col gap-3">
        {barra}
        <Cargando mensaje={`Cargando ${definicion.titulo.plural.toLowerCase()}…`} />
      </div>
    )
  }

  if (carga.fase === 'sinPermiso') {
    return <SinPermiso />
  }

  if (carga.fase === 'error') {
    return (
      <div className="flex flex-col gap-3">
        {barra}
        <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {barra}
      <TablaRecurso
        definicion={sinColumnasVacias(definicion, carga.inicial.filas)}
        inicial={carga.inicial}
        consultaDelInicial={carga.consulta}
        refresco={revision}
        claveFila={claveFila}
        capacidades={capacidades}
        opcionesDeFiltro={opciones}
        board={board}
        tarjeta={tarjeta}
        tarjetasEnMovil={tarjetasEnMovil}
        claseFila={claseFila}
        abrirEn={abrirEn}
      />
    </div>
  )
}

/**
 * Ruta del listado con su consulta, incluida la parte fija de la definicion.
 *
 * @param definicion El recurso, con su `consultaFija` si la tiene.
 * @param consulta Query string de la vista, sin `?`.
 * @returns La ruta lista para el BFF.
 */
function rutaConConsulta<T> (definicion: DefinicionRecurso<T>, consulta: string): string {
  const query = unirConsultas(definicion.consultaFija, consulta)

  return query === '' ? definicion.ruta : `${definicion.ruta}?${query}`
}

/**
 * Pide la primera pagina y los catalogos de los filtros.
 *
 * Van juntos: sin los catalogos, un estado se pinta como numero crudo y los selectores de filtro
 * salen vacios, asi que mostrar la tabla antes de tenerlos es mostrarla a medias.
 *
 * Nunca lanza: el error del contrato es un valor mas, y la pantalla tiene que poder mostrarlo.
 *
 * @param definicion la definicion ya acotada al proyecto
 * @param consulta query string sin `?`
 * @param rutaLookups de donde bajan los catalogos de este sujeto
 * @param senal aborta las dos peticiones si el componente se desmonta
 * @returns el estado de carga resuelto, `listo` o `error`
 */
async function primeraPagina<T> (
  definicion: DefinicionRecurso<T>,
  consulta: string,
  rutaLookups: string,
  senal: AbortSignal
): Promise<Carga<T>> {
  try {
    const [respuesta, lookups, staff] = await Promise.all([
      pedirRespuesta(rutaConConsulta(definicion, consulta), senal),
      pedirSobre<Lookups>(rutaLookups, senal),
      staffParaFiltros(definicion)
    ])

    // Un 403 se dibuja como falta de acceso y no como error rojo: un contratista que abre la pestaña
    // Tickets no tiene nada que reintentar. Es la misma regla de `SeccionDePortal`.
    if (respuesta.status === 403) return { fase: 'sinPermiso' }
    if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

    const lista = await respuesta.json() as Sobre<T[]>

    return {
      fase: 'listo',
      inicial: { filas: lista.data, paginacion: lista.meta?.pagination },
      opciones: opcionesDeFiltros(definicion, { ...lookups.data, staff }),
      consulta
    }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return {
      fase: 'error',
      mensaje: fallo instanceof Error
        ? fallo.message
        : `No se pudo cargar ${definicion.titulo.plural.toLowerCase()}.`
    }
  }
}
