'use client'

import { useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'
import { useRecurso } from './carga'
import { barraDeGantt, rangoDeGantt, type RangoGantt } from './gantt'
import type { AgrupacionGantt, GrupoGantt } from '@/datos/recursos'

/**
 * Pestaña Diagrama de Gantt del Proyecto.
 *
 * Se dibuja con CSS propio y **sin dependencias nuevas**: cada fila es una pista de ancho completo y
 * cada barra un bloque posicionado en porcentaje sobre la linea de tiempo. Una libreria de Gantt
 * traeria arrastre y zoom que esta pantalla no pide, y un paquete mas que mantener.
 *
 * Los grupos sin tareas no llegan: los omite la API, igual que el panel.
 */

/** Las tres agrupaciones del panel, con su etiqueta. `milestones` es la de por defecto. */
const AGRUPACIONES = [
  { valor: 'milestones', etiqueta: GLOSARIO.hito.plural },
  { valor: 'members', etiqueta: 'Miembros' },
  { valor: 'status', etiqueta: 'Estado' }
] as const

export function PanelGantt ({ proyectoId }: { proyectoId: number }): ReactElement {
  const [agrupar, setAgrupar] = useState<AgrupacionGantt>('milestones')
  const { estado, recargar } = useRecurso<GrupoGantt[]>(
    `projects/${proyectoId}/gantt?agrupar=${agrupar}`,
    'No se pudo cargar el diagrama de Gantt.'
  )

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Agrupación del diagrama" className="flex flex-wrap gap-1">
        {AGRUPACIONES.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={opcion.valor === agrupar}
            onClick={() => { setAgrupar(opcion.valor) }}
            className={cn(
              'rounded-control px-3 py-1 text-xs font-medium transition-colors',
              opcion.valor === agrupar
                ? 'bg-seleccionado text-texto'
                : 'text-texto-tenue hover:bg-hover hover:text-texto'
            )}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {estado.fase === 'cargando' && <Cargando filas={6} />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && <Diagrama grupos={estado.datos} />}
    </div>
  )
}

/**
 * El diagrama en si.
 *
 * @param grupos los grupos ya cargados
 * @returns la grilla de pistas, o el estado vacio si nada tiene fechas que dibujar
 */
function Diagrama ({ grupos }: { grupos: GrupoGantt[] }): ReactElement {
  const rango = rangoDeGantt(grupos)

  if (rango === null) {
    return (
      <Vacio
        titulo="Sin fechas que mostrar"
        descripcion={`Ninguna ${GLOSARIO.proceso.singular.toLowerCase()} de este proyecto tiene fecha de inicio o de entrega.`}
      />
    )
  }

  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 overflow-x-auto border p-4">
      <div className="flex min-w-[40rem] flex-col gap-1">
        <div className="text-texto-sutil flex justify-between text-xs">
          <span>{formatearFecha(fechaDeDia(rango.inicio))}</span>
          <span>{formatearFecha(fechaDeDia(rango.fin))}</span>
        </div>

        {grupos.map((grupo) => (
          <div key={grupo.id} className="flex flex-col gap-1">
            <Pista
              titulo={grupo.nombre}
              desde={grupo.start}
              hasta={grupo.end}
              rango={rango}
              esGrupo
              color={null}
            />

            {grupo.tareas.map((tarea) => (
              <Pista
                key={tarea.id}
                titulo={tarea.name}
                desde={tarea.start}
                hasta={tarea.end}
                rango={rango}
                esGrupo={false}
                color={tarea.color}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

interface PropsPista {
  titulo: string
  desde: string | null
  hasta: string | null
  rango: RangoGantt
  esGrupo: boolean
  /** Color que administra Perfex para el estado de la tarea. Es un dato, no un token del sistema. */
  color: string | null
}

/** Una fila del diagrama: el nombre a la izquierda y la barra sobre la linea de tiempo. */
function Pista ({ titulo, desde, hasta, rango, esGrupo, color }: PropsPista): ReactElement {
  const barra = barraDeGantt(desde, hasta, rango)

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'w-48 shrink-0 truncate text-xs',
          esGrupo ? 'text-texto font-semibold' : 'text-texto-tenue pl-3'
        )}
        title={titulo}
      >
        {titulo}
      </span>

      <span className="bg-superficie-hundida rounded-chico relative block h-5 min-w-0 flex-1">
        {barra !== null && (
          <span
            className={cn(
              'rounded-chico absolute inset-y-0 block',
              esGrupo ? 'bg-acento-suave' : color === null ? 'bg-acento' : ''
            )}
            style={{
              left: `${barra.izquierda}%`,
              width: `${barra.ancho}%`,
              // El color lo elige quien administra los estados en el panel: es un dato de la API, no
              // un token del sistema, y por eso va en `style` y no en una clase.
              ...(esGrupo || color === null ? {} : { backgroundColor: color })
            }}
            title={`${formatearFecha(desde)} → ${formatearFecha(hasta)}`}
          />
        )}
      </span>
    </div>
  )
}

/**
 * Convierte un dia UTC desde la epoca de vuelta a `YYYY-MM-DD`.
 *
 * @param dia el dia que devuelve `rangoDeGantt`
 * @returns la fecha en el formato del contrato
 */
function fechaDeDia (dia: number): string {
  return new Date(dia * 86400000).toISOString().slice(0, 10)
}
