'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { useRecurso } from '@/componentes/proyecto/carga'
import { agruparPorDia, horaDeEntrada } from '@/componentes/proyecto/actividad'
import { textoPlano } from '@/componentes/proyecto/formatos'
import { GLOSARIO } from '@/dominio/glosario'
import type { ActividadEspacio } from '@/datos/recursos'

/**
 * Pestaña Historial de la ficha de una persona: qué hizo, en orden y por día.
 *
 * Es el mismo feed que la pestaña Actividad de un Proyecto (`tblproject_activity`) mirado desde el
 * otro eje —una persona, muchos Proyectos—, así que reusa su agrupación por día. Lo que cambia es
 * qué se repite y qué no: allá el autor es distinto en cada línea y el Proyecto es siempre el mismo;
 * acá el autor es siempre esta persona y lo que ubica cada entrada es el Proyecto.
 *
 * **No es «todo lo que hizo».** Solo queda registro de lo que pasa dentro de un Proyecto: editar un
 * Cliente o mover un Prospecto no deja fila con el id de quien lo hizo, así que no puede aparecer.
 *
 * De solo lectura, sin el interruptor de «visible para el cliente» que sí tiene la pestaña del
 * Proyecto: esa marca decide qué publica el portal de UN cliente, y se decide mirando ese Proyecto,
 * no la ficha de quien escribió la línea.
 */

/** Cuántas entradas trae cada página. El mismo tope por defecto que usa el motor de tabla. */
const POR_PAGINA = 25

export function PanelHistorialPersona ({
  personaId,
  nombre
}: {
  personaId: number
  nombre: string
}): ReactElement {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(POR_PAGINA)

  const { estado, recargar } = useRecurso<ActividadEspacio[]>(
    `staff/${personaId}/activity?page=${pagina}&per_page=${porPagina}`,
    'No se pudo cargar el historial de esta persona.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-60" mensaje="Cargando el historial…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const dias = agruparPorDia(estado.datos)

  return (
    <div className="flex flex-col gap-4">
      {dias.length === 0
        ? (
          <Vacio
            titulo={`Todavía no hay movimientos de ${nombre}`}
            descripcion={`Cuando cree, edite o complete algo en un ${GLOSARIO.espacio.singular.toLowerCase()}, queda registrado acá.`}
          />
          )
        : (
          // Ancho acotado: el historial se LEE, no se compara columna contra columna. Sin tope, a
          // 1440px la línea de texto pasa de las 75 letras que se leen de un renglón.
          <ol className="flex max-w-3xl flex-col gap-6">
            {dias.map((dia) => (
              <li key={`${dia.titulo}-${dia.entradas[0]?.id ?? 0}`} className="flex flex-col gap-2">
                <h3 className="text-texto-sutil text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
                  {dia.titulo}
                </h3>

                <ol>
                  {dia.entradas.map((entrada) => (
                    <Entrada key={entrada.id} entrada={entrada} />
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          )}

      <PaginacionTabla
        paginacion={estado.meta?.pagination}
        onCambiar={(parcial) => {
          if (parcial.porPagina !== undefined) setPorPagina(parcial.porPagina)
          if (parcial.pagina !== undefined) setPagina(parcial.pagina)
        }}
      />
    </div>
  )
}

/**
 * Una entrada del historial.
 *
 * La hora vive en su propia columna y el contenido cuelga de una regla de 1px: es lo que convierte
 * una lista en una línea de tiempo sin pintar puntos, que obligarían a que el halo de cada punto
 * conozca el color de la superficie de atrás.
 *
 * `description` y `additional_data` llegan ya traducidas y con los pseudo-tags resueltos por la API.
 */
function Entrada ({ entrada }: { entrada: ActividadEspacio }): ReactElement {
  const detalle = textoPlano(entrada.additional_data)

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
      <span data-numerico className="text-texto-sutil pt-2.5 text-right text-xs">
        {horaDeEntrada(entrada.date_added)}
      </span>

      <div className="border-linea-suave flex min-w-0 flex-col gap-1 border-l py-2 pl-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-texto text-sm">{entrada.description}</span>

          {entrada.project !== undefined && (
            <Link
              href={`/espacios/${entrada.project.id}`}
              className="text-texto-tenue hover:text-acento text-sm underline-offset-4 hover:underline"
            >
              {entrada.project.name}
            </Link>
          )}
        </div>

        {detalle !== '' && (
          <p className="text-texto-sutil text-xs whitespace-pre-line">{detalle}</p>
        )}
      </div>
    </li>
  )
}
