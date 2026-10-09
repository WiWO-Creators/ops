'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { unirConsultas } from '@/componentes/datos/tabla'
import { useFiltrosEnUrl } from '@/componentes/datos/useFiltrosEnUrl'
import { enriquecerColumnas } from '@/componentes/proyecto/ColumnasProyecto'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { TareasAsignadas } from '@/componentes/mis-tareas/TareasAsignadas'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { GLOSARIO } from '@/dominio/glosario'
import { estaCerrada } from '@/componentes/proyecto/tareas'
import { espaciosAcotados } from '@/definiciones/espacios'
import type { EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { EstadoLookup, Espacio } from '@/datos/recursos'

/**
 * Los estados que cuentan como trabajo abierto: todos los del catalogo menos "Completo".
 *
 * Salia de una lista fija `'1,2,3,4'`, y por eso una Tarea en "Cambios" —el estado 6, agregado
 * despues en Perfex— no aparecia en el trabajo abierto de nadie. El catalogo lo administra el panel,
 * asi que un estado nuevo tiene que entrar solo.
 *
 * @param estados `task_statuses` de `GET /lookups`
 * @returns el fragmento de consulta, o vacio si el catalogo no llego — ahi no se filtra por estado
 *          en vez de mandar un `filter[status]=` vacio, que el backend rechaza
 */
function filtroDeAbiertos (estados: EstadoLookup[]): string | undefined {
  const abiertos = estados.filter((estado) => !estaCerrada(estado.id)).map((estado) => estado.id).join(',')

  return abiertos === '' ? undefined : `filter[status]=${abiertos}`
}

interface Props {
  personaId: number
  nombre: string
  /** `task_statuses` de `GET /lookups`, resueltos en el servidor para no pedirlos de nuevo. */
  estadosDeTarea: EstadoLookup[]
  /** `project_statuses`, para la tabla de Proyectos. */
  estadosDeProyecto: EstadoLookup[]
}

/**
 * El trabajo abierto de una persona: sus Tareas sin terminar y los Proyectos donde participa.
 *
 * Pide desde el navegador y no desde el servidor a proposito: son dos listados que dependen de la
 * persona y no de la pantalla, y bajarlos en el render inicial sumaria dos viajes a la API a cada
 * visita de la ficha, incluida la que solo venia a mirar el correo.
 *
 * La tabla de Tareas es la MISMA que usa "Mis Tareas" (`componentes/mis-tareas/TareasAsignadas`):
 * una sola implementacion de "las Tareas de una persona, paginadas y con su origen". Lo unico que
 * cambia entre las dos pantallas es el filtro que se le pasa y a donde lleva el detalle.
 *
 * @param personaId De quien es el trabajo.
 * @param nombre Su nombre, para los estados vacios.
 * @param estadosDeTarea Catalogo de estados de Tarea.
 * @param estadosDeProyecto Catalogo de estados de Proyecto.
 * @returns Las dos tablas del trabajo abierto de la persona.
 */
export function PanelTrabajoPersona ({ personaId, nombre, estadosDeTarea, estadosDeProyecto }: Props) {
  const plural = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <div className="flex flex-col gap-8">
      <TareasAsignadas
        personaId={personaId}
        titulo={`${GLOSARIO.proceso.plural} abiertas`}
        estados={estadosDeTarea}
        consultaExtra={filtroDeAbiertos(estadosDeTarea)}
        vacio={{
          titulo: `${nombre} no tiene ${plural} abiertas`,
          descripcion: 'Cuando se le asigne la primera va a aparecer acá, con su estado y su fecha de entrega.'
        }}
      />

      <ProyectosDeLaPersona personaId={personaId} nombre={nombre} estados={estadosDeProyecto} />
    </div>
  )
}

/**
 * Los Proyectos donde es miembro, con `TablaRecurso` y `consultaFija` (mismo mecanismo que
 * `PanelProyectosCliente`): la columna y el filtro "Miembros" se quitan porque bajo este
 * encabezado siempre son la misma persona.
 *
 * `TablaRecurso` y `useFiltrosEnUrl` leen `useSearchParams`: sin este limite de `Suspense` falla el
 * build de cualquier pagina que monte esta ficha.
 */
function ProyectosDeLaPersona (props: { personaId: number, nombre: string, estados: EstadoLookup[] }) {
  return (
    <Suspense fallback={<Cargando alto="min-h-40" mensaje={`Cargando sus ${GLOSARIO.espacio.plural.toLowerCase()}…`} />}>
      <CuerpoDeProyectosDeLaPersona {...props} />
    </Suspense>
  )
}

function CuerpoDeProyectosDeLaPersona ({ personaId, nombre, estados }: { personaId: number, nombre: string, estados: EstadoLookup[] }) {
  const plural = GLOSARIO.espacio.plural.toLowerCase()

  const definicion = useMemo(() => {
    const base = espaciosAcotados(`filter[member]=${personaId}`, 'member')

    return { ...base, columnas: enriquecerColumnas(base.columnas.filter((columna) => columna.clave !== 'members')) }
  }, [personaId])

  const leerEstado = useCallback((p: URLSearchParams) => leerConsulta(p, definicion), [definicion])
  const construirQuery = useCallback((e: EstadoConsulta) => construirConsulta(e, definicion), [definicion])
  const { estado } = useFiltrosEnUrl<EstadoConsulta>({ leer: leerEstado, construir: construirQuery, prefijo: 'espacios' })
  const consulta = useMemo(() => construirQuery(estado), [estado, construirQuery])

  const [carga, setCarga] = useState<
    | { fase: 'cargando' }
    | { fase: 'error', mensaje: string }
    | { fase: 'listo', inicial: ResultadoLista<Espacio>, consulta: string }
  >({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<Espacio[]>(`${definicion.ruta}?${unirConsultas(definicion.consultaFija, consulta)}`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return
        setCarga({ fase: 'listo', inicial: { filas: sobre.data, paginacion: sobre.meta?.pagination }, consulta })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        setCarga({ fase: 'error', mensaje: fallo instanceof Error ? fallo.message : `No se pudieron cargar sus ${plural}.` })
      })

    return () => { control.abort() }
  }, [definicion, consulta, plural, intento])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-40" mensaje={`Cargando sus ${plural}…`} />
  if (carga.fase === 'error') {
    return (
      <ErrorEstado
        detalle={carga.mensaje}
        onReintentar={() => { setCarga({ fase: 'cargando' }); setIntento((n) => n + 1) }}
      />
    )
  }

  if (carga.inicial.filas.length === 0) {
    return (
      <Vacio
        titulo={`${nombre} no participa de ningún ${GLOSARIO.espacio.singular.toLowerCase()}`}
        descripcion="Los miembros de cada uno se administran desde su ficha."
      />
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-texto text-sm font-semibold">{GLOSARIO.espacio.plural}</h2>

      <TablaRecurso<Espacio>
        definicion={definicion}
        inicial={carga.inicial}
        consultaDelInicial={carga.consulta}
        claveFila={(espacio) => espacio.id}
        opcionesDeFiltro={{ project_statuses: comoOpcionesDeEstado(estados) }}
        prefijoUrl="esp_"
      />
    </section>
  )
}

/**
 * Catalogo de estados de Proyecto en la forma que espera `opcionesDeFiltro` de `TablaRecurso`.
 *
 * @param estados `project_statuses` de `GET /lookups`.
 * @returns El mismo catalogo, con las claves que usa el motor de tabla.
 */
function comoOpcionesDeEstado (estados: EstadoLookup[]): OpcionFiltro[] {
  return estados.map((estado) => ({ valor: String(estado.id), etiqueta: estado.name, color: estado.color }))
}
