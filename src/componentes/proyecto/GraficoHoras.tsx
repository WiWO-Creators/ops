'use client'

import { useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { cn } from '@/lib/clases'
import { useRecurso } from './carga'
import { altoDeTramo, maximoDelGrafico, PERIODOS_GRAFICO } from './overview'
import type { GraficoHoras as DatosGrafico, PeriodoGrafico } from '@/datos/recursos'

/**
 * Grafico de horas registradas del proyecto, con su selector de periodo.
 *
 * Se dibuja con CSS —una columna por dia, un tramo apilado por serie— y no con una libreria de
 * graficos: son a lo sumo treinta y un barras y ninguna interaccion, asi que una dependencia nueva
 * costaria mas de lo que resuelve.
 *
 * Los colores salen de la escala `--color-grafico-*` del sistema. Es la unica forma de que el grafico
 * siga al tema claro y oscuro sin dos paletas que mantener.
 */

/** Clases de relleno de cada serie, en el orden en que llegan. */
const RELLENOS = ['bg-grafico-1', 'bg-grafico-2', 'bg-grafico-3']

export function GraficoHoras ({ proyectoId }: { proyectoId: number }): ReactElement {
  const [periodo, setPeriodo] = useState<PeriodoGrafico>('esta_semana')
  const { estado, recargar } = useRecurso<DatosGrafico>(
    `projects/${proyectoId}/overview/chart?periodo=${periodo}`,
    'No se pudo cargar el gráfico de horas.'
  )

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-4 border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-texto text-sm font-semibold">Horas registradas</h2>

        <Segmentado
          etiqueta="Período del gráfico"
          opciones={PERIODOS_GRAFICO}
          activo={periodo}
          onElegir={(valor) => { setPeriodo(valor as PeriodoGrafico) }}
        />
      </div>

      {estado.fase === 'cargando' && <Cargando alto="min-h-40" mensaje="Cargando el gráfico…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && <Barras grafico={estado.datos} />}
    </section>
  )
}

/**
 * Las barras del grafico y su leyenda.
 *
 * @param grafico la respuesta de `/overview/chart`
 * @returns la grilla de columnas, o el estado vacio si el periodo no tiene horas
 */
function Barras ({ grafico }: { grafico: DatosGrafico }): ReactElement {
  const maximo = maximoDelGrafico(grafico)

  if (maximo <= 0) {
    return <Vacio titulo="Sin horas en este período" descripcion="Nadie registró tiempo en las fechas elegidas." />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-40 items-end gap-1" role="img" aria-label={resumenAccesible(grafico)}>
        {grafico.etiquetas.map((etiqueta, indice) => (
          <div key={`${etiqueta}-${indice}`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-px">
            {grafico.series.map((serie, orden) => {
              const alto = altoDeTramo(serie.valores[indice], maximo)
              if (alto === 0) return null

              return (
                <span
                  key={serie.clave}
                  className={cn('block w-full rounded-t-[2px]', RELLENOS[orden] ?? RELLENOS[0])}
                  style={{ height: `${alto}%` }}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex gap-1 text-[0.625rem]">
        {grafico.etiquetas.map((etiqueta, indice) => (
          <span key={`${etiqueta}-${indice}`} className="text-texto-sutil min-w-0 flex-1 truncate text-center">
            {etiqueta}
          </span>
        ))}
      </div>

      <ul className="flex flex-wrap gap-4">
        {grafico.series.map((serie, orden) => (
          <li key={serie.clave} className="text-texto-tenue flex items-center gap-2 text-xs">
            <span aria-hidden="true" className={cn('size-2.5 rounded-full', RELLENOS[orden] ?? RELLENOS[0])} />
            {serie.nombre}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Texto que reemplaza al grafico para quien no lo ve.
 *
 * Un `role="img"` sin nombre accesible es un agujero: el lector de pantalla anuncia "imagen" y nada
 * mas. Se resume el total por serie, que es lo que el grafico comunica.
 *
 * @param grafico la respuesta de `/overview/chart`
 * @returns una frase con el total de horas de cada serie
 */
function resumenAccesible (grafico: DatosGrafico): string {
  const totales = grafico.series.map((serie) => {
    const total = serie.valores.reduce((suma, valor) => suma + (Number.isFinite(valor) ? valor : 0), 0)

    return `${serie.nombre}: ${total.toFixed(2)} horas`
  })

  return `Horas registradas por día. ${totales.join('. ')}.`
}
