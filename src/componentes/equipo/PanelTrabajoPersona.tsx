'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Paginador, TareasAsignadas, useListaPaginada } from '@/componentes/mis-tareas/TareasAsignadas'
import { GLOSARIO } from '@/dominio/glosario'
import { resolverEstado } from '@/dominio/estados-tarea'
import { ESTADO_COMPLETO } from '@/componentes/proyecto/tareas'
import type { EstadoLookup, Espacio } from '@/datos/recursos'

/**
 * Cuanto se trae de cada pagina de Proyectos.
 *
 * El mismo tamaño que usa la lista de Tareas (`TareasAsignadas`), para que las dos tablas de la
 * pestaña se lean con el mismo ritmo.
 */
const POR_PAGINA = 25

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
  const abiertos = estados.filter((estado) => estado.id !== ESTADO_COMPLETO).map((estado) => estado.id).join(',')

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

/** Los Proyectos donde es miembro. */
function ProyectosDeLaPersona ({ personaId, nombre, estados }: { personaId: number, nombre: string, estados: EstadoLookup[] }) {
  const [pagina, setPagina] = useState(1)
  const plural = GLOSARIO.espacio.plural.toLowerCase()
  const [carga, reintentar] = useListaPaginada<Espacio>(
    `projects?filter[member]=${personaId}&per_page=${POR_PAGINA}&page=${pagina}&sort=name`,
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
            const estado = resolverEstado(proyecto.status, estados)

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
                  <Insignia color={estado.color}>{estado.etiqueta}</Insignia>
                </CeldaTabla>

                <CeldaTabla className="text-texto-tenue">{proyecto.client?.company ?? '—'}</CeldaTabla>

                <CeldaTabla numerica className="text-texto-tenue">{proyecto.counts.tasks_open}</CeldaTabla>
              </FilaTabla>
            )
          })}
        </CuerpoTabla>
      </Tabla>

      <Paginador paginacion={carga.paginacion} cuantas={carga.filas.length} onPagina={setPagina} />

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
