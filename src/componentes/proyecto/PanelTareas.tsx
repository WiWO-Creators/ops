'use client'

import { Suspense, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Cajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { PROCESOS } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { Lookups, Proceso } from '@/datos/recursos'
import type { Capacidad, Sobre, SobreError } from '@/datos/tipos'
import { DetalleTarea } from './DetalleTarea'

/**
 * Tareas de un Proyecto.
 *
 * No escribe una tabla: reusa el motor con la definicion de Procesos, cambiandole tres cosas.
 *
 * **Acotar al proyecto por la ruta y no por un filtro.** `GET /projects/{id}/tasks` inyecta
 * `filter[project_id]` del lado del backend y acepta el resto de los parametros del listado
 * (filtros, `sort`, `q`, paginacion) igual que `/tasks`. El motor arma la query desde la URL y le
 * pega la `ruta` de la definicion adelante, asi que cambiar la ruta es UNA linea y no toca nada mas.
 * La alternativa —`/tasks?filter[project_id]=…`— obligaria a inyectar un filtro en el estado que el
 * motor lee de la URL, donde quedaria visible, editable y borrable por quien mira: sacarlo dejaria el
 * panel de un proyecto mostrando las tareas de todos.
 *
 * Dentro de un proyecto, la columna "Proyecto" repite el titulo de la pantalla en cada fila y el
 * filtro por proyecto ofrece cambiar de proyecto sin cambiar de pantalla. Los dos se podan.
 *
 * **El detalle se abre desde la URL (`?tarea={id}`), no desde el estado del componente.** Asi una
 * tarea abierta se comparte por enlace, "atras" la cierra, y el nombre puede ser un enlace de verdad
 * —clic del medio, "abrir en pestaña nueva"— en vez de un `onClick`. Ademas `presentar` recibe solo
 * la fila: no tiene forma de llamar a un manejador que viva en este componente, y colgarlo de la
 * definicion memoizada la ataria al estado.
 *
 * Los datos se piden desde el navegador y no bajan resueltos del servidor, porque este componente
 * recibe solo un id: mientras llegan se muestra el bloque de carga, que reserva el alto.
 */

interface PropsPanelTareas {
  proyectoId: number
  capacidades: Capacidad[]
}

export function PanelTareas ({ proyectoId, capacidades }: PropsPanelTareas): ReactElement {
  // `TablaRecurso` y el propio panel leen `useSearchParams`. Sin este limite de Suspense el build de
  // cualquier pagina que los monte falla, y esa pagina la escribe otra persona.
  return (
    <Suspense fallback={<Cargando filas={6} />}>
      <TareasDelProyecto proyectoId={proyectoId} capacidades={capacidades} />
    </Suspense>
  )
}

/** Estado de la carga inicial. El error es un texto ya listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo', inicial: ResultadoLista<Proceso>, opciones: Record<string, OpcionFiltro[]> }
  | { fase: 'error', mensaje: string }

function TareasDelProyecto ({ proyectoId, capacidades }: PropsPanelTareas): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const definicion = useMemo(() => definicionDelProyecto(proyectoId), [proyectoId])
  const tareaAbierta = idDeTarea(params.get('tarea'))

  // La consulta con la que se pide la primera pagina es la que la URL tiene AL MONTAR: es la que
  // `TablaRecurso` va a considerar suya, y pedir otra la dejaria mostrando datos que no piden.
  const consulta = useMemo(
    () => construirConsulta(leerConsulta(new URLSearchParams(params.toString()), definicion), definicion),
    [params, definicion]
  )
  const consultaDeMontaje = useRef(consulta)

  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  /** Vuelve a la fase de carga y dispara el efecto otra vez. Va acá y no en el efecto: un `setState`
   *  sincronico dentro de un efecto encadena renders de mas. */
  function reintentar () {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }

  useEffect(() => {
    const control = new AbortController()

    void primeraPagina(definicion, consultaDeMontaje.current, control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [definicion, intento])

  if (carga.fase === 'cargando') return <Cargando filas={6} />

  if (carga.fase === 'error') {
    return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />
  }

  /** Cierra el cajon sacando `?tarea` y dejando intacto el resto de la vista (filtros, orden, pagina). */
  function cerrarDetalle (): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.delete('tarea')

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  return (
    <>
      <TablaRecurso
        definicion={definicion}
        inicial={carga.inicial}
        claveFila={(proceso) => proceso.id}
        capacidades={capacidades}
        opcionesDeFiltro={carga.opciones}
      />

      <Cajon open={tareaAbierta !== null} onOpenChange={(abierto) => { if (!abierto) cerrarDetalle() }}>
        <ContenidoCajon titulo={GLOSARIO.proceso.singular} descripcion="Detalle y tiempo registrado">
          {tareaAbierta !== null && <DetalleTarea procesoId={tareaAbierta} />}
        </ContenidoCajon>
      </Cajon>
    </>
  )
}

/**
 * Lee el id de tarea de la URL.
 *
 * La URL la escribe cualquiera: `?tarea=abc` o `?tarea=-3` no pueden terminar en una peticion al BFF.
 *
 * @param crudo el valor de `?tarea`, o `null` si no viene
 * @returns el id, o `null` si no es un entero positivo
 */
function idDeTarea (crudo: string | null): number | null {
  if (crudo === null || crudo.trim() === '') return null

  const id = Number(crudo)

  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * El nombre de la tarea, como enlace al detalle.
 *
 * Lee `useSearchParams` por su cuenta en vez de recibir la URL por prop: `presentar` solo recibe la
 * fila, y un componente propio es la unica forma de que el enlace conserve los parametros vigentes
 * sin atar la definicion memoizada al estado.
 *
 * @param proceso la fila de la tabla
 * @returns el enlace a `?tarea={id}` con el resto del querystring intacto
 */
function EnlaceTarea ({ proceso }: { proceso: Proceso }): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set('tarea', String(proceso.id))

  return (
    <Link
      href={`?${siguientes.toString()}`}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {proceso.name}
    </Link>
  )
}

/**
 * La definicion de Procesos acotada a un proyecto.
 *
 * @param proyectoId el proyecto que se esta mirando
 * @returns una copia con la ruta del subrecurso, sin la columna ni el filtro de proyecto y con el
 *          nombre convertido en enlace al detalle
 */
function definicionDelProyecto (proyectoId: number): DefinicionRecurso<Proceso> {
  return {
    ...PROCESOS,
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/tasks`,
    columnas: PROCESOS.columnas
      .filter((columna) => columna.clave !== 'project')
      .map((columna) => columna.clave === 'name'
        ? { ...columna, presentar: (proceso: Proceso) => <EnlaceTarea proceso={proceso} /> }
        : columna),
    filtros: PROCESOS.filtros.filter((filtro) => filtro.clave !== 'project_id')
  }
}

/**
 * Pide la primera pagina y los catalogos de los filtros.
 *
 * Van juntos a proposito: sin los catalogos, el estado se pinta como un numero crudo y los selectores
 * de filtro salen vacios, asi que mostrar la tabla antes de tenerlos es mostrarla a medias.
 *
 * Nunca lanza: el error del contrato es un valor mas, y la pantalla tiene que poder mostrarlo.
 *
 * @param definicion la definicion ya acotada al proyecto
 * @param consulta query string sin `?`
 * @param senal aborta las dos peticiones si el componente se desmonta
 * @returns el estado de carga resuelto, `listo` o `error`
 */
async function primeraPagina (
  definicion: DefinicionRecurso<Proceso>,
  consulta: string,
  senal: AbortSignal
): Promise<Carga> {
  try {
    const [lista, lookups] = await Promise.all([
      pedirSobre<Proceso[]>(`${definicion.ruta}${consulta === '' ? '' : `?${consulta}`}`, senal),
      pedirSobre<Lookups>('lookups', senal)
    ])

    return {
      fase: 'listo',
      inicial: { filas: lista.data, paginacion: lista.meta?.pagination },
      opciones: opcionesDeFiltros(definicion, lookups.data)
    }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar las tareas.' }
  }
}

/** Pide una ruta al BFF y devuelve el envelope. Lanza un `Error` con el mensaje ya legible. */
async function pedirSobre<T> (ruta: string, senal: AbortSignal): Promise<Sobre<T>> {
  const respuesta = await fetch(`/api/bff/${ruta}`, { signal: senal })

  if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

  return await respuesta.json() as Sobre<T>
}

/** Mensaje del envelope de error, con uno propio si la respuesta no trae JSON valido (un 502 da HTML). */
async function mensajeDeRespuesta (respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json() as SobreError

    if (cuerpo.error?.message !== undefined) return cuerpo.error.message
  } catch {
    // Se cae al mensaje generico de abajo.
  }

  return `El servidor respondió ${respuesta.status}`
}
