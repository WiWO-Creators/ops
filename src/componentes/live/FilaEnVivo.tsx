'use client'

import { Timer } from 'lucide-react'
import { haceCuanto } from '@/componentes/auditoria/presentacion'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { formatearDuracion } from '@/componentes/proyecto/cronometro'
import type { FilaDeLive } from '@/datos/live'

/**
 * Una persona del tablero.
 *
 * Contesta tres cosas en una linea: si esta trabajando, en que, y cuanto lleva. No dice en que
 * pantalla esta ni por donde navega — eso es `/auditoria`, y es otra pregunta.
 *
 * `transcurrido` llega por prop y no se calcula aca: el tic de un segundo es UNO, del panel, y no
 * cincuenta intervalos independientes que despierten la pestaña cincuenta veces por segundo.
 */
export function FilaEnVivo ({ fila, transcurrido }: { fila: FilaDeLive, transcurrido: number }) {
  const { staff, jornada, medidor, presencia } = fila
  const destino = medidor === null ? null : medidor.task?.name ?? medidor.project?.name ?? 'Sin destino'

  return (
    <li className="flex min-w-0 items-center gap-3 py-2">
      <Avatar nombre={staff.name} imagen={staff.avatar} tamano="medio" />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-texto truncate text-sm font-medium">{staff.name}</span>
        <span className="text-texto-sutil truncate text-xs">
          {destino ?? (jornada === null ? 'Sin jornada abierta' : 'Con jornada, sin medir')}
        </span>
      </div>

      {staff.cargo !== null && (
        <Insignia tono="contorno" tamano="chico" className="hidden sm:inline-flex">
          {staff.cargo}
        </Insignia>
      )}

      <div className="flex shrink-0 flex-col items-end">
        {medidor === null
          ? (
            <span className="text-texto-tenue text-xs tabular-nums">
              {jornada === null ? '—' : formatearDuracion(jornada.seconds + transcurrido)}
            </span>
            )
          : (
            <span
              data-numerico
              className="text-texto flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums"
            >
              <Timer size={14} strokeWidth={2} aria-hidden="true" className="text-acento" />
              {formatearDuracion(medidor.seconds + transcurrido)}
            </span>
            )}

        {/* Los segundos de antigüedad los calcula el servidor: ver `haceCuanto()`. */}
        <span className="text-texto-sutil text-xs">
          {presencia === null ? 'Sin señales' : haceCuanto(presencia.seconds_ago)}
        </span>
      </div>
    </li>
  )
}
