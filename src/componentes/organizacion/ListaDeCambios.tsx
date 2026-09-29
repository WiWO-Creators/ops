'use client'

import { ArrowRight } from 'lucide-react'
import { etiquetaDeCampo } from '@/dominio/organizacion'
import { formatearFecha } from '@/lib/fechas'
import type { CambioDelHistorial } from '@/datos/accesos'

interface PropsListaDeCambios {
  cambios: CambioDelHistorial[]
  /** Oculta el nombre de la entidad: en el panel de una persona ya se sabe de quién es cada cambio. */
  sinEntidad?: boolean
}

/**
 * Los cambios de la organización, uno por renglón: quién, cuándo, qué campo y de qué a qué.
 *
 * Una lista y no una tabla porque se lee de arriba abajo como un registro, y porque el mismo
 * componente va en un cajón angosto —el panel de una persona— y en la pestaña Historial.
 */
export function ListaDeCambios ({ cambios, sinEntidad = false }: PropsListaDeCambios) {
  return (
    <ol className="divide-linea border-linea rounded-tarjeta divide-y border">
      {cambios.map((cambio) => (
        <li key={cambio.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
          <p className="text-texto flex flex-wrap items-center gap-x-1.5">
            {!sinEntidad && cambio.entidad_nombre !== null && (
              <span className="font-medium">{cambio.entidad_nombre} ·</span>
            )}
            <span className="text-texto-tenue">{etiquetaDeCampo(cambio.campo)}</span>
          </p>
          <p className="text-texto flex flex-wrap items-center gap-1.5">
            <span className={cambio.antes === null ? 'text-texto-sutil italic' : undefined}>{cambio.antes ?? 'vacío'}</span>
            <ArrowRight aria-label="pasó a" className="text-texto-sutil size-3.5 shrink-0" />
            <span className={cambio.despues === null ? 'text-texto-sutil italic' : 'font-medium'}>{cambio.despues ?? 'vacío'}</span>
          </p>
          <p className="text-texto-sutil text-xs">
            {formatearFecha(cambio.fecha, true)} · {cambio.autor?.nombre ?? 'Sin sesión (script)'}
          </p>
        </li>
      ))}
    </ol>
  )
}
