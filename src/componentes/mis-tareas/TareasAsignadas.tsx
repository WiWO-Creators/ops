'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { PARAMETRO_TAREA, unirConsultas } from '@/componentes/datos/tabla'
import { useFiltrosEnUrl } from '@/componentes/datos/useFiltrosEnUrl'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { EstadoDeTarea } from '@/componentes/proyecto/EstadoDeTarea'
import { MenuEstadoTarea } from '@/componentes/proyecto/MenuEstadoTarea'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { EVENTO_TAREAS_CAMBIADAS, observarLista, REFRESCO_LISTA_MS } from '@/datos/refresco-lista'
import { GLOSARIO } from '@/dominio/glosario'
import { CON_COMPLETADAS, origenDeTarea, type ClaseDeOrigen } from '@/dominio/mis-tareas'
import { PROCESOS } from '@/definiciones/procesos'
import type { Columna, DefinicionRecurso, EstadoConsulta, ResultadoLista } from '@/definiciones/tipos'
import type { EstadoLookup, Proceso } from '@/datos/recursos'
import type { Paginacion } from '@/datos/tipos'

/** Con que tono se pinta cada origen. La Licitacion resalta porque es lo que todavia no se gano. */
const TONO_ORIGEN: Record<ClaseDeOrigen, TonoInsignia> = {
  licitacion: 'acento',
  espacio: 'neutro',
  privada: 'contorno',
  otro: 'contorno'
}

export type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', filas: T[], paginacion: Paginacion | undefined }

/**
 * Mantiene una página actualizada mientras está visible y tras las escrituras locales.
 * Conserva el último listado durante refrescos y errores transitorios; una ruta nueva carga aparte.
 *
 * Pide desde el navegador y no desde el servidor por la misma razon de siempre: la lista depende de
 * la persona y de la pagina que esta mirando, no de la ruta, y resolverla en el render inicial
 * obligaria a un viaje de servidor por cada clic en "Siguiente".
 *
 * @param ruta Ruta relativa ya armada, con su filtro y su pagina.
 * @param queSon Como nombrar a lo que fallo, para el mensaje de error.
 * @param version Cambiar este numero vuelve a pedir la misma ruta. Es como se entera la lista de que
 *        se acaba de crear una Tarea: sin esto, la fila nueva no aparece hasta recargar.
 * @returns El estado de carga y la funcion para reintentar.
 */
export function useListaPaginada<T> (ruta: string, queSon: string, version = 0): [Carga<T>, () => void] {
  const [intento, setIntento] = useState(0)
  const clave = `${ruta}|${intento}|${version}`

  // Lo guardado lleva la clave de la peticion que lo trajo, y "cargando" se DERIVA de que esa clave
  // ya no sea la vigente. Marcarlo con un `setCarga({ fase: 'cargando' })' al entrar al efecto
  // encadenaba un render de mas en cada cambio de pagina, y ademas dejaba una ventana en la que la
  // pagina nueva se pintaba con las filas de la anterior.
  const [guardado, setGuardado] = useState<{ clave: string, carga: Carga<T> } | null>(null)

  const reintentar = useCallback(() => { setIntento((n) => n + 1) }, [])

  useEffect(() => {
    return observarLista(
      (senal) => pedirSobre<T[]>(ruta, senal),
      (sobre) => {
        setGuardado({ clave, carga: { fase: 'listo', filas: sobre.data, paginacion: sobre.meta?.pagination } })
      },
      (fallo: unknown) => {
        setGuardado((previo) => previo?.clave === clave && previo.carga.fase === 'listo' ? previo : {
          clave,
          carga: {
            fase: 'error',
            mensaje: fallo instanceof Error ? fallo.message : `No se pudieron cargar ${queSon}.`
          }
        })
      }
    )
  }, [clave, ruta, queSon])

  const carga: Carga<T> = guardado?.clave === clave ? guardado.carga : { fase: 'cargando' }

  return [carga, reintentar]
}

/**
 * Pie de una lista paginada: cuantas hay y como pasar de pagina.
 *
 * Con una sola pagina no dibuja botones, solo el total: dos controles muertos bajo cada tabla son
 * ruido en el caso mas comun, que es el de quien tiene menos de una pagina de trabajo.
 *
 * @param paginacion `meta.pagination` de la respuesta; ausente cuando el recurso no la manda.
 * @param cuantas Filas de la pagina actual, para poder decir el total cuando no hay paginacion.
 * @param onPagina Que hacer al elegir otra pagina.
 */
export function Paginador (
  { paginacion, cuantas, onPagina }:
  { paginacion: Paginacion | undefined, cuantas: number, onPagina: (pagina: number) => void }
) {
  const total = paginacion?.total ?? cuantas
  const paginas = paginacion?.total_pages ?? 1
  const pagina = paginacion?.page ?? 1

  if (paginas <= 1) return <p className="text-texto-tenue text-xs">{total} en total.</p>

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-texto-tenue text-xs">Página {pagina} de {paginas} · {total} en total.</p>

      <div className="flex items-center gap-2">
        <Boton
          tamano="chico"
          disabled={pagina <= 1}
          onClick={() => { onPagina(pagina - 1) }}
        >
          Anterior
        </Boton>
        <Boton
          tamano="chico"
          disabled={pagina >= paginas}
          onClick={() => { onPagina(pagina + 1) }}
        >
          Siguiente
        </Boton>
      </div>
    </div>
  )
}

interface PropsTareasAsignadas {
  /** De quien son las Tareas. Toda la lista va filtrada por esto, salvo que llegue `alcance`. */
  personaId?: number
  /**
   * Filtro fijo que reemplaza al de persona, sin el `&` inicial: `filter[area_asignado]=3` lista el
   * trabajo de un área entera. Es fijo por la misma razón que el de persona: no se puede cambiar
   * desde la URL.
   */
  alcance?: string
  /**
   * `sort` de la consulta, tal como lo acepta el backend. Admite varios campos separados por coma
   * (`'etapa,-priority,due_date'`, el orden del Área). Por defecto, lo que vence primero arriba.
   */
  orden?: string
  /** `task_priorities` de `GET /lookups`. Con la lista, la tabla suma la columna de prioridad. */
  prioridades?: EstadoLookup[]
  /** Encabezado de la seccion. */
  titulo: string
  /** `task_statuses` de `GET /lookups`, resueltos en el servidor para no pedirlos de nuevo. */
  estados: EstadoLookup[]
  /**
   * Fragmento extra de la consulta, sin el `&` inicial. Es lo que separa las dos mitades de la hoja
   * (`SOLO_CON_ESPACIO` / `SOLO_SIN_ESPACIO`) y lo que deja acotar a los estados abiertos.
   */
  consultaExtra?: string
  /** Que decir cuando no hay ni una fila. */
  vacio: { titulo: string, descripcion: string }
  /** Ids de Espacio que son Licitaciones. Sin la lista, todo Espacio se lee como Proyecto. */
  licitaciones?: number[]
  /**
   * Pantalla donde vive el detalle de una Tarea. El modal se abre con `?tarea={id}` sobre ella, asi
   * que una hoja que monta su propio `ModalTarea` pasa su propia ruta y el detalle se abre sin salir.
   */
  rutaDetalle?: string
  /** Controles del encabezado —un alta, por ejemplo—. Se dibujan tambien con la lista vacia. */
  accion?: ReactNode
  /**
   * Si la insignia de estado es ademas un menu para cambiarlo.
   *
   * Arranca apagada porque esta misma tabla pinta el trabajo de OTRA persona en la ficha de equipo
   * (`PanelTrabajoPersona`), y ahi un menu que casi siempre responde `403` es peor que no ofrecerlo.
   *
   * Encendida no se pregunta por `tasks.edit`: las hojas que la encienden listan las Tareas de quien
   * mira, y el backend deja cambiar el estado al asignado o al creador aunque no tenga ese permiso
   * —`EstadoProceso::exigirPermiso()` en el modulo de API: `tasks.edit` es un atajo, no el unico
   * camino—. Exigirlo aca dejaria a quien no lo tiene sin poder corregir su propio trabajo.
   */
  estadoEditable?: boolean
  /**
   * Si la lista incluye ademas las Tareas ya completadas.
   *
   * Apagada, `GET /tasks` las esconde por su cuenta y la lista es la hoja de trabajo pendiente.
   * Encendida suma `CON_COMPLETADAS`, que es lo que deja corregir una Tarea cerrada por error.
   *
   * No se combina con un `consultaExtra` que ya traiga `filter[status]`: los dos filtros viajarian
   * y la API los cruzaria con AND. Quien pasa un estado fijo —la ficha de equipo, que lista el
   * trabajo abierto— no enciende esto, y por eso no hay un caso donde se contradigan.
   */
  verCompletadas?: boolean
  /**
   * Prefijo de los parametros de URL de esta instancia (`page`, `sort`…). Ver `TablaRecurso`.
   *
   * Hace falta porque "Mis Tareas" pinta dos de estas tablas en la misma pagina —Espacios/Licitaciones
   * y Tareas privadas—, y sin prefijo las dos leerian y escribirian la misma pagina y el mismo orden.
   */
  prefijoUrl?: string
}

/**
 * Las Tareas que una persona tiene asignadas, paginadas y con su origen a la vista.
 *
 * Usa `TablaRecurso` con un filtro fijo (`consultaFija`): el de persona o de area no se puede cambiar
 * desde la URL, y es exactamente para lo que existe `DefinicionRecurso.consultaFija` (ver
 * `PanelRecurso`, que acota la pestaña Tareas de un Proyecto de la misma forma). La vista con filtros
 * y orden editables ya existe y es `/procesos`; esta hoja es la acotada a una persona o a un area.
 *
 * @returns La seccion con su encabezado, su tabla y su paginador.
 */
export function TareasAsignadas (props: PropsTareasAsignadas) {
  // `TablaRecurso` y `useFiltrosEnUrl` leen `useSearchParams`: sin este limite de Suspense falla el
  // build de cualquier pagina que monte esta hoja. Mismo motivo que `PanelRecurso`.
  return (
    <Suspense fallback={<CabeceraYCargando titulo={props.titulo} accion={props.accion} />}>
      <CuerpoDeTareasAsignadas {...props} />
    </Suspense>
  )
}

/** El encabezado con el mensaje de carga, para que el `fallback` de Suspense se lea igual que el
 * estado de "cargando" ya resuelto: el titulo y la accion no deberian aparecer y desaparecer. */
function CabeceraYCargando ({ titulo, accion }: { titulo: string, accion?: ReactNode }) {
  const plural = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-texto text-sm font-semibold">{titulo}</h2>
        {accion}
      </div>
      <Cargando alto="min-h-40" mensaje={`Cargando ${plural}…`} />
    </section>
  )
}

/** Estado de la primera pagina, pedida desde el navegador con la consulta que la URL tenga al montar. */
type CargaInicial =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', inicial: ResultadoLista<Proceso>, consulta: string }

function CuerpoDeTareasAsignadas ({
  personaId, alcance, orden = 'due_date', prioridades, titulo, estados, consultaExtra, vacio, licitaciones,
  rutaDetalle = '/procesos', accion, estadoEditable = false, verCompletadas = false, prefijoUrl
}: PropsTareasAsignadas) {
  const plural = GLOSARIO.proceso.plural.toLowerCase()
  const deLicitacion = useMemo(() => new Set(licitaciones ?? []), [licitaciones])

  // Cambia cuando una escritura ajena a la tabla —el alta de una Tarea privada, un cambio de estado
  // desde otra pantalla— avisa por `EVENTO_TAREAS_CAMBIADAS`, o cuando la pestaña vuelve a quedar a
  // la vista. Es el mismo criterio que `observarLista`, pero sin dueño de la peticion: la peticion la
  // hace `TablaRecurso` con `refresco`, esto solo le avisa cuando pedir de nuevo.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    function avisar (): void {
      if (!document.hidden) setRevision((n) => n + 1)
    }

    const intervalo = globalThis.setInterval(avisar, REFRESCO_LISTA_MS)
    document.addEventListener('visibilitychange', avisar)
    window.addEventListener('focus', avisar)
    window.addEventListener(EVENTO_TAREAS_CAMBIADAS, avisar)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', avisar)
      window.removeEventListener('focus', avisar)
      window.removeEventListener(EVENTO_TAREAS_CAMBIADAS, avisar)
    }
  }, [])

  const fijo = alcance ?? `filter[assignee]=${personaId ?? ''}`
  const consultaFija = [fijo, consultaExtra, verCompletadas ? CON_COMPLETADAS : undefined]
    .filter((parte): parte is string => parte !== undefined && parte !== '')
    .join('&')

  const definicion = useMemo(
    () => definicionDeTareasAsignadas({ orden, consultaFija, prioridades, estados, estadoEditable, deLicitacion, rutaDetalle }),
    // `deLicitacion` y `estados` cambian de referencia sin cambiar de contenido en cada render del
    // padre: lo que decide si hay que rearmar la definicion es `consultaFija` y `orden`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orden, consultaFija, prioridades, estadoEditable, rutaDetalle]
  )

  const leerEstado = useCallback((p: URLSearchParams) => leerConsulta(p, definicion), [definicion])
  const construirQuery = useCallback((e: EstadoConsulta) => construirConsulta(e, definicion), [definicion])
  const { estado } = useFiltrosEnUrl<EstadoConsulta>({ leer: leerEstado, construir: construirQuery, prefijo: prefijoUrl })
  const consulta = useMemo(() => construirQuery(estado), [estado, construirQuery])

  const [carga, setCarga] = useState<CargaInicial>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [peticion, setPeticion] = useState(`${definicion.ruta}|0`)

  // Vuelve a "cargando" en el render y no en el efecto: con un `definicion` nuevo (cambio de alcance,
  // de completadas, de vencimiento) los datos viejos seguirian en pantalla un instante de mas. React
  // admite este `setState` durante el render, y es la misma tecnica de `PanelRecurso`.
  const actual = `${definicion.ruta}|${intento}`
  if (peticion !== actual) {
    setPeticion(actual)
    setCarga({ fase: 'cargando' })
  }

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<Proceso[]>(`${definicion.ruta}?${unirConsultas(definicion.consultaFija, consulta)}`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return
        setCarga({ fase: 'listo', inicial: { filas: sobre.data, paginacion: sobre.meta?.pagination }, consulta })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        setCarga({ fase: 'error', mensaje: fallo instanceof Error ? fallo.message : `No se pudieron cargar ${plural}.` })
      })

    return () => { control.abort() }
    // La consulta vigente no entra aqui: la primera pagina se pide UNA vez por montaje (o por
    // `intento`/cambio de definicion), y despues es `TablaRecurso` quien vuelve a pedir con la
    // consulta que la URL tenga en cada momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definicion, intento])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-texto text-sm font-semibold">{titulo}</h2>
        {accion}
      </div>

      {carga.fase === 'cargando' && <Cargando alto="min-h-40" mensaje={`Cargando ${plural}…`} />}
      {carga.fase === 'error' && (
        <ErrorEstado detalle={carga.mensaje} onReintentar={() => { setIntento((n) => n + 1) }} />
      )}
      {carga.fase === 'listo' && carga.inicial.filas.length === 0 && (
        <Vacio titulo={vacio.titulo} descripcion={vacio.descripcion} />
      )}
      {carga.fase === 'listo' && carga.inicial.filas.length > 0 && (
        <TablaRecurso<Proceso>
          definicion={definicion}
          inicial={carga.inicial}
          consultaDelInicial={carga.consulta}
          claveFila={(tarea) => tarea.id}
          refresco={revision}
          prefijoUrl={prefijoUrl}
        />
      )}
    </section>
  )
}

/**
 * Definicion de recurso para "Mis Tareas": el filtro de persona o de area es fijo (`consultaFija`),
 * asi que la tabla no ofrece la barra de filtros ni el buscador de `/procesos` —esos ya existen ahi—.
 *
 * Las columnas de `PROCESOS` no calzan tal cual: esta hoja necesita el estado editable en linea
 * (`estadoEditable`) y una columna "Origen" que distingue Licitacion de Proyecto, y ninguna de las
 * dos existe en la definicion de `/procesos`. Se reutiliza en cambio su `ordenables` —es la
 * whitelist real del backend para `GET /tasks`, no una eleccion de esta pantalla— sumando los campos
 * que el `orden` fijo de algun llamador pida ademas (el Area ordena por `etapa`, que `/procesos` no
 * ofrece como columna pero el backend si acepta).
 */
function definicionDeTareasAsignadas ({
  orden,
  consultaFija,
  prioridades,
  estados,
  estadoEditable,
  deLicitacion,
  rutaDetalle
}: {
  orden: string
  consultaFija: string
  prioridades: EstadoLookup[] | undefined
  estados: EstadoLookup[]
  estadoEditable: boolean
  deLicitacion: ReadonlySet<number>
  rutaDetalle: string
}): DefinicionRecurso<Proceso> {
  const camposDelOrden = orden.split(',').map((campo) => (campo.startsWith('-') ? campo.slice(1) : campo)).filter((campo) => campo !== '')
  const ordenables = [...new Set([...PROCESOS.ordenables, ...camposDelOrden])]

  const columnas: Array<Columna<Proceso>> = [
    { clave: 'patente', encabezado: 'ID', sinCortar: true, presentar: (p) => p.patente || `#${p.id}` },
    {
      clave: 'name',
      encabezado: 'Nombre',
      ordenPor: 'name',
      presentar: (p) => (
        <Link
          href={`${rutaDetalle}?${PARAMETRO_TAREA}=${p.id}`}
          className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
        >
          {p.name}
        </Link>
      )
    },
    {
      clave: 'status',
      encabezado: 'Estado',
      ordenPor: 'status',
      // `onCambiado` vacio a proposito: `escribirEnBff` avisa toda escritura sobre `tasks/…` por el
      // evento `ops:tareas-cambiadas`, y el efecto de arriba ya lo escucha y sube `revision`. Llamar
      // a algo mas aca duplicaria el pedido.
      presentar: (p) => (estadoEditable
        ? <MenuEstadoTarea tareaId={p.id} nombreTarea={p.name} estado={p.status} catalogo={estados} onCambiado={() => {}} />
        : <EstadoDeTarea status={p.status} catalogo={estados} tamano="medio" />)
    },
    ...(prioridades === undefined
      ? []
      : [{
          clave: 'priority',
          encabezado: 'Prioridad',
          presentar: (p: Proceso) => <InsigniaDePrioridad prioridad={p.priority} catalogo={prioridades} />
        } satisfies Columna<Proceso>]),
    {
      clave: 'origen',
      encabezado: 'Origen',
      presentar: (p) => <CeldaDeOrigen tarea={p} deLicitacion={deLicitacion} />
    },
    {
      clave: 'due_date',
      encabezado: 'Vence',
      ordenPor: 'due_date',
      presentar: (p) => <Fecha valor={p.due_date} comoVencimiento />
    }
  ]

  return {
    ruta: 'tasks',
    titulo: GLOSARIO.proceso,
    columnas,
    filtros: [],
    ordenables,
    ordenPorDefecto: orden.split(','),
    busqueda: false,
    includes: [],
    consultaFija
  }
}

/** La insignia de Origen ("Licitación", "Proyecto", "Privada"), con enlace cuando hay a donde ir. */
function CeldaDeOrigen ({ tarea, deLicitacion }: { tarea: Proceso, deLicitacion: ReadonlySet<number> }) {
  const origen = origenDeTarea(tarea, deLicitacion)

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Insignia tono={TONO_ORIGEN[origen.clase]} tamano="chico">{origen.tipo}</Insignia>

      {origen.nombre !== null && (origen.href === null
        ? <span className="text-texto-tenue">{origen.nombre}</span>
        : (
          <Link href={origen.href} className="text-texto-tenue hover:text-acento underline-offset-4 hover:underline">
            {origen.nombre}
          </Link>
          ))}
    </span>
  )
}

/**
 * La prioridad de una Tarea con el nombre y el color que le da el catálogo.
 *
 * @param prioridad `priority` de la Tarea; `null` o fuera del catálogo se pinta como raya
 * @param catalogo `task_priorities` de `GET /lookups`
 */
function InsigniaDePrioridad ({ prioridad, catalogo }: { prioridad: number | null, catalogo: EstadoLookup[] }) {
  const entrada = catalogo.find((una) => una.id === prioridad)

  if (entrada === undefined) return <span className="text-texto-tenue">—</span>

  return <Insignia color={entrada.color} tamano="chico">{entrada.name}</Insignia>
}
