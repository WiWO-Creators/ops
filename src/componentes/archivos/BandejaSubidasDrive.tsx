'use client'

import { useState } from 'react'
import { Check, ChevronDown, RotateCw, X } from 'lucide-react'
import { IconoArchivoDrive } from '@/componentes/archivos/IconoArchivoDrive'
import type { SubidaDrive } from '@/componentes/archivos/useSubidasDrive'
import { formatearTamano, tipoDeNodo } from '@/dominio/drive-explorador'
import { cn } from '@/lib/clases'

/** Texto del estado de una subida, al lado de su barra. */
function textoDeEstado (subida: SubidaDrive): string {
  if (subida.estado === 'pendiente') return 'En espera'
  if (subida.estado === 'subiendo') return `${Math.round(subida.avance * 100)} %`
  if (subida.estado === 'lista') return 'Subido'
  if (subida.estado === 'cancelada') return 'Cancelada'
  return subida.error ?? 'No se pudo subir'
}

/** El resumen de la cabecera: cuántas faltan y el avance total, o cómo terminó todo. */
function resumen (subidas: readonly SubidaDrive[]): string {
  const vivas = subidas.filter((subida) => subida.estado === 'pendiente' || subida.estado === 'subiendo')
  const fallidas = subidas.filter((subida) => subida.estado === 'error').length
  const listas = subidas.filter((subida) => subida.estado === 'lista').length

  if (vivas.length > 0) {
    const total = subidas.reduce((suma, subida) => suma + (subida.estado === 'cancelada' || subida.estado === 'error' ? 0 : subida.tamano), 0)
    const enviado = subidas.reduce((suma, subida) => suma + (subida.estado === 'lista' ? subida.tamano : subida.estado === 'subiendo' ? subida.tamano * subida.avance : 0), 0)
    const porcentaje = total === 0 ? 0 : Math.round((enviado / total) * 100)
    return `Subiendo ${vivas.length === 1 ? '1 archivo' : `${vivas.length} archivos`} · ${porcentaje} %`
  }

  const partes = [`${listas === 1 ? '1 subido' : `${listas} subidos`}`]
  if (fallidas > 0) partes.push(fallidas === 1 ? '1 con error' : `${fallidas} con error`)
  return partes.join(' · ')
}

/**
 * La bandeja de subidas, al pie del explorador: una línea por archivo con su avance, su destino y
 * su error, y los botones de cancelar y reintentar.
 *
 * Queda a la vista mientras se navega —la subida sigue aunque se cambie de carpeta— y se pliega a una
 * sola línea. Se cierra cuando la persona decide, no sola: un error que desaparece a los cinco
 * segundos es un error que nadie leyó.
 */
export function BandejaSubidasDrive ({ subidas, onCancelar, onReintentar, onLimpiar }: {
  subidas: readonly SubidaDrive[]
  onCancelar: (id: string) => void
  onReintentar: (id: string) => void
  onLimpiar: () => void
}) {
  const [plegada, setPlegada] = useState(false)
  if (subidas.length === 0) return null

  const enCurso = subidas.some((subida) => subida.estado === 'pendiente' || subida.estado === 'subiendo')

  return (
    <section aria-label="Subidas" className="border-linea bg-superficie-hundida border-t">
      <header className="flex items-center gap-2 px-3 py-2">
        <p role="status" aria-live="polite" className="text-texto min-w-0 flex-1 truncate text-sm font-semibold">
          {resumen(subidas)}
        </p>
        <button
          type="button"
          aria-expanded={!plegada}
          aria-label={plegada ? 'Mostrar subidas' : 'Plegar subidas'}
          onClick={() => { setPlegada((antes) => !antes) }}
          className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control grid size-8 place-items-center"
        >
          <ChevronDown className={cn('size-4 transition-transform duration-150', plegada && 'rotate-180')} aria-hidden="true" />
        </button>
        {!enCurso && (
          <button
            type="button"
            aria-label="Cerrar la bandeja de subidas"
            onClick={onLimpiar}
            className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control grid size-8 place-items-center"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </header>

      {!plegada && (
        <ul data-lenis-prevent className="max-h-56 overflow-y-auto px-3 pb-2">
          {subidas.map((subida) => (
            <FilaSubida key={subida.id} subida={subida} onCancelar={onCancelar} onReintentar={onReintentar} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Una subida: ícono, nombre, destino, barra y la acción que corresponde a su estado. */
function FilaSubida ({ subida, onCancelar, onReintentar }: {
  subida: SubidaDrive
  onCancelar: (id: string) => void
  onReintentar: (id: string) => void
}) {
  const viva = subida.estado === 'pendiente' || subida.estado === 'subiendo'
  const fallo = subida.estado === 'error'

  return (
    <li className="flex items-center gap-3 py-1.5">
      <IconoArchivoDrive tipo={tipoDeNodo({ is_folder: false, name: subida.nombre, mime_type: null })} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-texto truncate text-sm font-medium" title={subida.nombre}>{subida.nombre}</span>
          <span className="text-texto-sutil shrink-0 text-xs tabular-nums">{formatearTamano(subida.tamano)}</span>
        </div>

        {viva
          ? (
            <div
              role="progressbar"
              aria-label={`Avance de ${subida.nombre}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(subida.avance * 100)}
              className="bg-relleno-neutro rounded-control mt-1 h-1 overflow-hidden"
            >
              <div className="avance-drive bg-acento h-full w-full" style={{ transform: `scaleX(${subida.avance})` }} />
            </div>
            )
          : (
            <p className={cn('truncate text-xs', fallo ? 'text-texto-peligro' : 'text-texto-sutil')} title={fallo ? subida.error : undefined}>
              {fallo ? textoDeEstado(subida) : `${textoDeEstado(subida)} en ${subida.destino.name}`}
            </p>
            )}
      </div>

      <span className="text-texto-sutil w-12 shrink-0 text-right text-xs tabular-nums">
        {viva ? textoDeEstado(subida) : subida.estado === 'lista' ? <Check className="text-texto-exito ml-auto size-4" aria-label="Subido" /> : null}
      </span>

      {viva && (
        <button
          type="button"
          aria-label={`Cancelar la subida de ${subida.nombre}`}
          onClick={() => { onCancelar(subida.id) }}
          className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control grid size-8 shrink-0 place-items-center"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      {!viva && subida.reintentable && (subida.estado === 'error' || subida.estado === 'cancelada') && (
        <button
          type="button"
          aria-label={`Reintentar la subida de ${subida.nombre}`}
          onClick={() => { onReintentar(subida.id) }}
          className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control grid size-8 shrink-0 place-items-center"
        >
          <RotateCw className="size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  )
}
