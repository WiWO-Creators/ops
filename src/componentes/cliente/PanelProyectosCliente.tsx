'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { unirConsultas } from '@/componentes/datos/tabla'
import { useFiltrosEnUrl } from '@/componentes/datos/useFiltrosEnUrl'
import { enriquecerColumnas } from '@/componentes/proyecto/ColumnasProyecto'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { ProyectoDeEntradaCliente } from '@/componentes/cliente/ProyectoDeEntradaCliente'
import { TareasSinVencimientoCliente } from '@/componentes/cliente/TareasSinVencimientoCliente'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { GLOSARIO } from '@/dominio/glosario'
import { espaciosAcotados } from '@/definiciones/espacios'
import type { DefinicionRecurso, EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { EstadoLookup, Espacio } from '@/datos/recursos'
import type { Capacidad, Paginacion } from '@/datos/tipos'

/** Lo que hace falta para pintar la pestaña. El error es un texto listo, no un envelope. */
type CargaInicial =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', inicial: ResultadoLista<Espacio>, consulta: string, paginacion: Paginacion | undefined }

interface Props {
  clienteId: number
  /** `project_statuses` de `GET /lookups`, resueltos en el servidor para no pedirlos de nuevo. */
  estados: EstadoLookup[]
  /** Capacidades sobre `customers`: deciden si la apertura del portal se edita o se lee. */
  capacidades: Capacidad[]
  /** Capacidades sobre `projects`: deciden si el nombre de la fila enlaza a la ficha. */
  capacidadesProyectos: Capacidad[]
}

/**
 * Pestaña Proyectos de un Cliente.
 *
 * Usa `TablaRecurso` con `DefinicionRecurso.consultaFija` acotando por `clientid`: el mismo mecanismo
 * que `TareasAsignadas` para "Mis Tareas". La columna "Cliente" y el filtro "Cliente" no tienen
 * sentido bajo este encabezado —son siempre el mismo— y se quitan de la definicion que usa esta
 * pestaña; el resto (filtros, orden, buscador, avance con barra, tareas abiertas) es la misma tabla
 * que `/proyectos`, para que la misma data se vea igual en todo el sistema.
 *
 * Pide desde el navegador y no desde el servidor a proposito: son datos de una pestaña que puede no
 * abrirse nunca, y bajarlos en cada visita al cliente costaria una peticion mas por visita. La
 * primera pagina se pide a mano (como en `TareasAsignadas`) para tener un `inicial` real antes de
 * montar `TablaRecurso`; sin eso la tabla mostraria "vacio" un instante mientras carga.
 *
 * Arriba de la lista va la apertura del portal, que elige cual de estos Proyectos se abre cuando un
 * contacto del cliente entra. Vive acá y no en una pestaña propia porque la eleccion se hace sobre
 * la lista que esta justo debajo, y porque esa lista ya esta cargada: en otra pestaña seria la misma
 * peticion otra vez para llenar un solo selector.
 *
 * @param clienteId Cliente que se esta mirando.
 * @param estados Catalogo de estados de Proyecto, para resolver nombre y color.
 * @param capacidades Capacidades sobre `customers`, para la apertura del portal.
 * @param capacidadesProyectos Capacidades sobre `projects`, para el enlace del nombre.
 * @returns La apertura del portal, las metricas, la tabla y el enlace a la vista completa.
 */
export function PanelProyectosCliente (props: Props) {
  // `TablaRecurso` y `useFiltrosEnUrl` leen `useSearchParams`: sin este limite de Suspense falla el
  // build de cualquier pagina que monte esta hoja.
  return (
    <Suspense fallback={<Cargando alto="min-h-60" mensaje="Cargando los proyectos…" />}>
      <CuerpoProyectosCliente {...props} />
    </Suspense>
  )
}

function CuerpoProyectosCliente ({ clienteId, estados, capacidades, capacidadesProyectos }: Props) {
  const definicion = useMemo(
    () => definicionDeProyectosCliente(clienteId),
    [clienteId]
  )

  const leerEstado = useCallback((p: URLSearchParams) => leerConsulta(p, definicion), [definicion])
  const construirQuery = useCallback((e: EstadoConsulta) => construirConsulta(e, definicion), [definicion])
  const { estado } = useFiltrosEnUrl<EstadoConsulta>({ leer: leerEstado, construir: construirQuery })
  const consulta = useMemo(() => construirQuery(estado), [estado, construirQuery])

  const [carga, setCarga] = useState<CargaInicial>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<Espacio[]>(`${definicion.ruta}?${unirConsultas(definicion.consultaFija, consulta)}`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'listo',
          inicial: { filas: sobre.data, paginacion: sobre.meta?.pagination },
          consulta,
          paginacion: sobre.meta?.pagination
        })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error
            ? fallo.message
            : `No se pudieron cargar los ${GLOSARIO.espacio.plural.toLowerCase()}.`
        })
      })

    return () => { control.abort() }
    // La primera pagina de esta tabla se pide una vez por montaje o por reintento; despues es
    // `TablaRecurso` quien vuelve a pedir con la consulta que la URL tenga en cada momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, definicion, intento])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-60" mensaje="Cargando los proyectos…" />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  const { inicial, paginacion } = carga
  const enLaLista = `/proyectos?filter[clientid]=${clienteId}`

  // La regla de vencimiento se dibuja tambien sin Proyectos: vale para las tareas colgadas del
  // cliente mismo (`rel_type=customer`), que no necesitan ningun Proyecto para existir.
  if (inicial.filas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <TareasSinVencimientoCliente clienteId={clienteId} capacidades={capacidades} />
        <Vacio
          titulo={`Este cliente no tiene ${GLOSARIO.espacio.plural.toLowerCase()}`}
          descripcion={`Cuando se le abra el primero va a aparecer acá, con su avance y su fecha de entrega.`}
          accion={
            <Link href="/proyectos" className="text-acento text-sm font-semibold underline underline-offset-4">
              Ir a {GLOSARIO.espacio.plural}
            </Link>
          }
        />
      </div>
    )
  }

  const total = paginacion?.total ?? inicial.filas.length
  const completos = inicial.filas.length === total

  return (
    <div className="flex flex-col gap-4">
      <ProyectoDeEntradaCliente clienteId={clienteId} proyectos={inicial.filas} capacidades={capacidades} />
      <TareasSinVencimientoCliente clienteId={clienteId} capacidades={capacidades} />

      <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
        <Metrica etiqueta={GLOSARIO.espacio.plural} valor={String(total)} />
        {/* Los conteos suman lo que hay en mano: con mas de una pagina serian un subtotal disfrazado
            de total, asi que solo se muestran cuando llego la lista entera. */}
        {completos && (
          <>
            <Metrica
              etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
              valor={String(sumar(inicial.filas, (p) => p.counts.tasks_open))}
            />
            <Metrica
              etiqueta={`${GLOSARIO.proceso.plural} totales`}
              valor={String(sumar(inicial.filas, (p) => p.counts.tasks))}
            />
          </>
        )}
      </div>

      <TablaRecurso<Espacio>
        definicion={definicion}
        inicial={inicial}
        consultaDelInicial={carga.consulta}
        claveFila={(espacio) => espacio.id}
        capacidades={capacidadesProyectos}
        opcionesDeFiltro={{ project_statuses: comoOpciones(estados) }}
      />

      <p className="text-texto-tenue text-xs">
        <Link href={enLaLista} className="text-acento underline underline-offset-4">
          Verlo en {GLOSARIO.espacio.plural} con filtros y orden
        </Link>
      </p>
    </div>
  )
}

/**
 * Definicion de Espacios acotada a un Cliente: mismo recurso que `/proyectos`, sin la columna ni el
 * filtro "Cliente" (siempre serian el mismo bajo este encabezado) y con el avance y el nombre
 * enriquecidos igual que en el listado completo. Es la unica pantalla que pide los upsells abiertos.
 *
 * @param clienteId Cliente al que se acota la lista.
 * @returns Una definicion nueva; `ESPACIOS` no se muta.
 */
function definicionDeProyectosCliente (clienteId: number): DefinicionRecurso<Espacio> {
  const base = espaciosAcotados(`filter[clientid]=${clienteId}`, 'clientid')

  // `upsells` es lo que le dice a la API que liste tambien los upsells abiertos de este cliente: en
  // el listado general `/proyectos` siguen ocultos, y filtrar por cliente no basta para mostrarlos.
  return {
    ...base,
    columnas: enriquecerColumnas(base.columnas.filter((columna) => columna.clave !== 'client')),
    includes: [...(base.includes ?? []), 'upsells'],
    incluirSiempre: [...(base.incluirSiempre ?? []), 'upsells']
  }
}

/**
 * Catalogo de estados de Proyecto en la forma que espera `opcionesDeFiltro` de `TablaRecurso`.
 *
 * @param estados `project_statuses` de `GET /lookups`.
 * @returns El mismo catalogo, con las claves que usa el motor de tabla.
 */
function comoOpciones (estados: EstadoLookup[]): OpcionFiltro[] {
  return estados.map((estado) => ({ valor: String(estado.id), etiqueta: estado.name, color: estado.color }))
}

/**
 * Suma un contador sobre la lista.
 *
 * @param proyectos Los proyectos en mano.
 * @param de Que contador se suma de cada uno.
 * @returns El total.
 */
function sumar (proyectos: Espacio[], de: (proyecto: Espacio) => number): number {
  return proyectos.reduce((acumulado, proyecto) => acumulado + de(proyecto), 0)
}
