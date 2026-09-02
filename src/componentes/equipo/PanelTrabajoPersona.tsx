'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { PARAMETRO_TAREA } from '@/componentes/proyecto/CajonTarea'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { EstadoLookup, Espacio, Proceso } from '@/datos/recursos'

/**
 * Cuanto se trae de cada lista.
 *
 * Es un tope de pantalla, no de paginacion: quien tenga mas trabajo abierto que esto se mira en
 * Tareas o en Proyectos, que si paginan y estan enlazados abajo de cada tabla.
 */
const POR_PAGINA = 50

/** Estados que cuentan como trabajo abierto: todo menos "Completo" (5). */
const ESTADOS_ABIERTOS = '1,2,3,4'

type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', filas: T[] }

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
 * No usa `TablaRecurso`: ese motor toma la consulta de la URL y no admite un filtro fijo, asi que el
 * filtro por persona se podria cambiar desde la ficha de otra y mostrar trabajo ajeno bajo el nombre
 * equivocado. Lo que hace falta aca es una lista acotada; la vista con filtros y orden ya existe.
 *
 * @param personaId De quien es el trabajo.
 * @param nombre Su nombre, para los estados vacios.
 * @param estadosDeTarea Catalogo de estados de Tarea.
 * @param estadosDeProyecto Catalogo de estados de Proyecto.
 * @returns Las dos tablas del trabajo abierto de la persona.
 */
export function PanelTrabajoPersona ({ personaId, nombre, estadosDeTarea, estadosDeProyecto }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <TareasAsignadas personaId={personaId} nombre={nombre} estados={estadosDeTarea} />
      <ProyectosDeLaPersona personaId={personaId} nombre={nombre} estados={estadosDeProyecto} />
    </div>
  )
}

/**
 * Trae una lista acotada de la API y la mantiene cancelable.
 *
 * @param ruta Ruta relativa ya armada, con su filtro por persona.
 * @param queSon Como nombrar a lo que fallo, para el mensaje de error.
 * @returns El estado de carga y la funcion para reintentar.
 */
function useLista<T> (ruta: string, queSon: string): [Carga<T>, () => void] {
  const [carga, setCarga] = useState<Carga<T>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<T[]>(ruta, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({ fase: 'listo', filas: sobre.data })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : `No se pudieron cargar ${queSon}.`
        })
      })

    return () => { control.abort() }
  }, [ruta, queSon, intento])

  return [carga, reintentar]
}

/** Las Tareas sin terminar que tiene asignadas. */
function TareasAsignadas ({ personaId, nombre, estados }: { personaId: number, nombre: string, estados: EstadoLookup[] }) {
  const plural = GLOSARIO.proceso.plural.toLowerCase()
  const [carga, reintentar] = useLista<Proceso>(
    `tasks?assignee=${personaId}&filter[status]=${ESTADOS_ABIERTOS}&per_page=${POR_PAGINA}&sort=due_date`,
    plural
  )

  if (carga.fase === 'cargando') return <Cargando alto="min-h-40" mensaje={`Cargando sus ${plural}…`} />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  if (carga.filas.length === 0) {
    return (
      <Vacio
        titulo={`${nombre} no tiene ${plural} abiertas`}
        descripcion={`Cuando se le asigne la primera va a aparecer acá, con su estado y su fecha de entrega.`}
      />
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-texto text-sm font-semibold">{GLOSARIO.proceso.plural} abiertas</h2>

      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>Nombre</CeldaEncabezado>
            <CeldaEncabezado>Estado</CeldaEncabezado>
            <CeldaEncabezado>{GLOSARIO.espacio.singular}</CeldaEncabezado>
            <CeldaEncabezado>Vence</CeldaEncabezado>
          </tr>
        </EncabezadoTabla>

        <CuerpoTabla>
          {carga.filas.map((tarea) => {
            const estado = estados.find((e) => e.id === tarea.status)

            return (
              <FilaTabla key={tarea.id}>
                <CeldaTabla>
                  <Link
                    href={`/procesos?${PARAMETRO_TAREA}=${tarea.id}`}
                    className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                  >
                    {tarea.name}
                  </Link>
                </CeldaTabla>

                <CeldaTabla>
                  <Insignia color={estado?.color ?? null}>{estado?.name ?? `#${tarea.status}`}</Insignia>
                </CeldaTabla>

                <CeldaTabla className="text-texto-tenue">
                  {tarea.project === null
                    ? '—'
                    : (
                      <Link
                        href={`/espacios/${tarea.project.id}`}
                        className="hover:text-acento underline-offset-4 hover:underline"
                      >
                        {tarea.project.name}
                      </Link>
                      )}
                </CeldaTabla>

                <CeldaTabla>
                  <Fecha valor={tarea.due_date} comoVencimiento />
                </CeldaTabla>
              </FilaTabla>
            )
          })}
        </CuerpoTabla>
      </Tabla>

      {/* Sin enlace a la vista completa: `assignee` es un parametro suelto de la API y NO un filtro
          declarado de Procesos, asi que `/procesos?assignee=N` mostraria las de todo el mundo bajo
          el nombre de esta persona. */}
      <p className="text-texto-tenue text-xs">
        {carga.filas.length === POR_PAGINA
          ? `Se muestran las primeras ${POR_PAGINA}.`
          : `${carga.filas.length} en total.`}
      </p>
    </section>
  )
}

/** Los Proyectos donde es miembro. */
function ProyectosDeLaPersona ({ personaId, nombre, estados }: { personaId: number, nombre: string, estados: EstadoLookup[] }) {
  const plural = GLOSARIO.espacio.plural.toLowerCase()
  const [carga, reintentar] = useLista<Espacio>(
    `projects?filter[member]=${personaId}&per_page=${POR_PAGINA}&sort=name`,
    plural
  )

  if (carga.fase === 'cargando') return <Cargando alto="min-h-40" mensaje={`Cargando sus ${plural}…`} />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  if (carga.filas.length === 0) {
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

      <Tabla>
        <EncabezadoTabla>
          <tr>
            <CeldaEncabezado>Nombre</CeldaEncabezado>
            <CeldaEncabezado>Estado</CeldaEncabezado>
            <CeldaEncabezado>Cliente</CeldaEncabezado>
            <CeldaEncabezado numerica>{GLOSARIO.proceso.plural} abiertas</CeldaEncabezado>
          </tr>
        </EncabezadoTabla>

        <CuerpoTabla>
          {carga.filas.map((proyecto) => {
            const estado = estados.find((e) => e.id === proyecto.status)

            return (
              <FilaTabla key={proyecto.id}>
                <CeldaTabla>
                  <Link
                    href={`/espacios/${proyecto.id}`}
                    className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                  >
                    {proyecto.name}
                  </Link>
                </CeldaTabla>

                <CeldaTabla>
                  <Insignia color={estado?.color ?? null}>{estado?.name ?? `#${proyecto.status}`}</Insignia>
                </CeldaTabla>

                <CeldaTabla className="text-texto-tenue">{proyecto.client?.company ?? '—'}</CeldaTabla>

                <CeldaTabla numerica className="text-texto-tenue">{proyecto.counts.tasks_open}</CeldaTabla>
              </FilaTabla>
            )
          })}
        </CuerpoTabla>
      </Tabla>

      <p className="text-texto-tenue text-xs">
        <Link
          href={`/espacios?filter[member]=${personaId}`}
          className="text-acento underline underline-offset-4"
        >
          Ver todos sus {plural} con filtros y orden
        </Link>
      </p>
    </section>
  )
}
