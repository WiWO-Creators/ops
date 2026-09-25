'use client'

import { useId, type ReactElement } from 'react'
import {
  alternarDia, alternarFinesDeSemana, DIAS_SEMANA, excluyeFinesDeSemana, textoDeDiasExcluidos
} from '@/dominio/recurrencia'
import { cn } from '@/lib/clases'

/**
 * "Días en que no se generan copias": siete botones de lunes a domingo y el atajo "Sin fines de semana".
 *
 * Un solo componente para el editor de la regla, la edicion de la Tarea y el alta, por la misma razon
 * que `FinDeRecurrencia`: es la misma regla (`skip_weekdays` en la API) y tres versiones terminan
 * discrepando.
 *
 * Cada dia es un boton con `aria-pressed` y no una casilla: la letra sola ("X") no alcanza como nombre
 * accesible, asi que cada uno lleva el nombre completo, y el grupo se anuncia con su leyenda. Marcado
 * significa **excluido**: el dia en que no nace copia. La frase de abajo lo repite en palabras para
 * que no haya que interpretar los colores.
 *
 * @param valor dias ISO excluidos (1 = lunes .. 7 = domingo)
 * @param onCambiar recibe la lista nueva, ya normalizada
 * @param error mensaje del campo, si lo hay
 * @param deshabilitado mientras se guarda
 */
export function DiasExcluidos ({ valor, onCambiar, error, deshabilitado = false }: {
  valor: number[]
  onCambiar: (dias: number[]) => void
  error?: string
  deshabilitado?: boolean
}): ReactElement {
  const id = useId()
  const finDeSemana = excluyeFinesDeSemana(valor)
  const frase = textoDeDiasExcluidos(valor)

  return (
    <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-3" disabled={deshabilitado} aria-describedby={`${id}-nota`}>
      <legend className="text-texto mb-1.5 text-sm font-medium">Días en que no se generan copias</legend>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Días de la semana" className="flex flex-wrap gap-1">
          {DIAS_SEMANA.map((dia) => {
            const excluido = valor.includes(dia.iso)

            return (
              <button
                key={dia.iso}
                type="button"
                aria-pressed={excluido}
                aria-label={dia.nombre[0]?.toUpperCase() + dia.nombre.slice(1)}
                title={excluido ? `Los ${dia.nombre} no se generan copias` : `Los ${dia.nombre} sí se generan copias`}
                onClick={() => { onCambiar(alternarDia(valor, dia.iso)) }}
                className={cn(
                  'rounded-control size-8 border text-xs font-semibold transition-colors duration-150',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  excluido
                    ? 'bg-acento text-acento-contenido border-transparent'
                    : 'border-control-borde bg-control text-texto hover:bg-hover'
                )}
              >
                {dia.inicial}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          aria-pressed={finDeSemana}
          onClick={() => { onCambiar(alternarFinesDeSemana(valor)) }}
          className={cn(
            'rounded-control h-8 border px-3 text-xs font-medium transition-colors duration-150',
            'disabled:cursor-not-allowed disabled:opacity-60',
            finDeSemana
              ? 'border-acento text-acento bg-acento-suave'
              : 'border-control-borde text-texto-tenue hover:bg-hover hover:text-texto'
          )}
        >
          Sin fines de semana
        </button>
      </div>

      {error !== undefined
        ? <p id={`${id}-nota`} role="alert" className="text-texto-peligro text-xs">{error}</p>
        : (
          <p id={`${id}-nota`} className="text-texto-sutil text-xs">
            {frase === ''
              ? 'Se generan copias cualquier día. Marca los días en que no debe nacer ninguna.'
              : `No se generan copias los días marcados (${frase.replace(/^salvo /, '')}): esa copia se salta, no se mueve.`}
          </p>
          )}
    </fieldset>
  )
}
