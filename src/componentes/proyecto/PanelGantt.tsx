'use client'

import { useEffect, useId, useRef, useState, type ReactElement, type RefObject } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'
import { useRecurso } from './carga'
import {
  altoDeGantt,
  describirDependencias,
  filasDeGantt,
  flechasDeGantt,
  rangoDeGantt,
  type FilaGantt
} from './gantt'
import type { AgrupacionGantt, GrupoGantt } from '@/datos/recursos'

/**
 * Pestaña Diagrama de Gantt del Proyecto.
 *
 * Se dibuja con CSS propio y **sin dependencias nuevas**: cada fila es una pista de ancho completo y
 * cada barra un bloque posicionado en porcentaje sobre la linea de tiempo. Una libreria de Gantt
 * traeria arrastre y zoom que esta pantalla no pide, y un paquete mas que mantener.
 *
 * Las flechas de dependencia van en un SVG que cubre la columna de pistas. Toda su geometria vive en
 * `gantt.ts`, en pixeles: por eso el ancho de esa columna se mide con un `ResizeObserver` en vez de
 * dejarlo en porcentaje. Un SVG estirado con `preserveAspectRatio="none"` habria evitado la medicion,
 * pero deforma las puntas y el grosor del trazo, que es justo lo que hace legible una flecha.
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
 * Mide el ancho de un elemento y lo mantiene al dia.
 *
 * @returns la referencia que hay que colgar del elemento y su ancho en pixeles, 0 hasta la primera
 *          medicion
 */
function useAnchoMedido (): [RefObject<HTMLDivElement | null>, number] {
  const referencia = useRef<HTMLDivElement | null>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const nodo = referencia.current
    if (nodo === null) return

    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0]
      if (entrada !== undefined) setAncho(entrada.contentRect.width)
    })

    observador.observe(nodo)

    return () => { observador.disconnect() }
  }, [])

  return [referencia, ancho]
}

/**
 * El diagrama en si: la escala, la columna de nombres, la de pistas y las flechas encima.
 *
 * @param grupos los grupos ya cargados
 * @returns la grilla de pistas, o el estado vacio si nada tiene fechas que dibujar
 */
function Diagrama ({ grupos }: { grupos: GrupoGantt[] }): ReactElement {
  const [pistas, ancho] = useAnchoMedido()
  const idResumen = useId()
  const rango = rangoDeGantt(grupos)

  if (rango === null) {
    return (
      <Vacio
        titulo="Sin fechas que mostrar"
        descripcion={`Ninguna ${GLOSARIO.proceso.singular.toLowerCase()} de este proyecto tiene fecha de inicio o de entrega.`}
      />
    )
  }

  const filas = filasDeGantt(grupos, rango)
  const flechas = flechasDeGantt(filas, ancho)
  const dependencias = describirDependencias(filas)
  const alto = altoDeGantt(filas.length)

  return (
    <figure
      aria-describedby={idResumen}
      className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 overflow-x-auto border p-4"
    >
      <div className="flex min-w-160 flex-col gap-2">
        <div className="flex gap-3">
          <span className="w-48 shrink-0" aria-hidden="true" />
          <div className="text-texto-sutil flex flex-1 justify-between text-xs">
            <span>{formatearFecha(fechaDeDia(rango.inicio))}</span>
            <span>{formatearFecha(fechaDeDia(rango.fin))}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex w-48 shrink-0 flex-col gap-1">
            {filas.map((fila) => (
              <span
                key={fila.clave}
                title={fila.titulo}
                className={cn(
                  'h-6 truncate text-xs leading-6',
                  fila.esGrupo ? 'text-texto font-semibold' : 'text-texto-tenue pl-3'
                )}
              >
                {fila.titulo}
              </span>
            ))}
          </div>

          <div ref={pistas} className="relative min-w-0 flex-1">
            <div className="flex flex-col gap-1">
              {filas.map((fila) => <Pista key={fila.clave} fila={fila} />)}
            </div>

            {flechas.length > 0 && (
              <svg
                width={ancho}
                height={alto}
                viewBox={`0 0 ${ancho} ${alto}`}
                aria-hidden="true"
                focusable="false"
                className="pointer-events-none absolute inset-x-0 top-0"
              >
                {flechas.map((flecha) => (
                  <g key={flecha.clave}>
                    {/* Un trazo grueso del color del fondo separa la flecha de las barras que cruza:
                        sin ese halo, dos lineas sobre una barra oscura se vuelven una mancha. */}
                    <path d={flecha.d} fill="none" strokeWidth={4} strokeLinejoin="round" className="stroke-superficie-elevada" />
                    <path d={flecha.d} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-texto-sutil" />
                    <path d={flecha.punta} strokeWidth={1.5} strokeLinejoin="round" className="fill-texto-sutil stroke-superficie-elevada" />
                  </g>
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>

      {flechas.length > 0 && (
        <p className="text-texto-sutil min-w-160 text-xs">
          Cada flecha va de la {GLOSARIO.proceso.singular.toLowerCase()} que bloquea a la que espera.
        </p>
      )}

      <figcaption id={idResumen} className="sr-only">
        <p>
          Diagrama de Gantt de {filas.filter((fila) => !fila.esGrupo).length}{' '}
          {GLOSARIO.proceso.plural.toLowerCase()} entre {formatearFecha(fechaDeDia(rango.inicio))} y{' '}
          {formatearFecha(fechaDeDia(rango.fin))}.
        </p>
        {dependencias.length === 0
          ? <p>Ninguna {GLOSARIO.proceso.singular.toLowerCase()} depende de otra.</p>
          : (
            <>
              <p>Dependencias:</p>
              <ul>
                {dependencias.map((frase, indice) => <li key={`${String(indice)}-${frase}`}>{frase}</li>)}
              </ul>
            </>
            )}
      </figcaption>
    </figure>
  )
}

/**
 * Una fila del diagrama sobre la linea de tiempo.
 *
 * El grupo se dibuja como un riel fino y la tarea como una barra completa: la jerarquia la marca el
 * peso de la marca, no un tamaño de fila distinto. Todas las filas miden lo mismo porque la geometria
 * de las flechas cuenta filas, no pixeles sueltos.
 */
function Pista ({ fila }: { fila: FilaGantt }): ReactElement {
  const posicion = fila.barra === null
    ? undefined
    : { left: `${fila.barra.izquierda}%`, width: `${fila.barra.ancho}%` }

  if (fila.esGrupo) {
    return (
      <div className="flex h-6 items-center">
        <span className="relative block h-1.5 w-full">
          {posicion !== undefined && (
            <span className="bg-acento-suave rounded-control absolute inset-y-0 block" style={posicion} />
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-6 items-center">
      <span className="bg-superficie-hundida rounded-chico relative block h-5 w-full">
        {posicion !== undefined && (
          <span
            className={cn('rounded-chico absolute inset-y-0 block', fila.color === null && 'bg-acento')}
            style={{
              ...posicion,
              // El color lo elige quien administra los estados en el panel: es un dato de la API, no
              // un token del sistema, y por eso va en `style` y no en una clase.
              ...(fila.color === null ? {} : { backgroundColor: fila.color })
            }}
            title={`${formatearFecha(fila.desde)} → ${formatearFecha(fila.hasta)}`}
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
