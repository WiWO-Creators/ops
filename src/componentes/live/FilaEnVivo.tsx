'use client'

import { useRef, useState } from 'react'
import { Square, Timer } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { avisarCambioDeMedidor } from './medidor'
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
export function FilaEnVivo ({ fila, transcurrido, puedeDetener }: {
  fila: FilaDeLive
  transcurrido: number
  puedeDetener: boolean
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [detenido, setDetenido] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enviando = useRef(false)
  const { staff, jornada, medidor, presencia } = fila
  const destino = medidor === null ? null : medidor.task?.name ?? medidor.project?.name ?? 'Sin destino'

  /** Cierra este cronómetro por ID y avisa a los controles para que consulten el estado actualizado. */
  async function detener (): Promise<void> {
    if (medidor === null || enviando.current) return

    enviando.current = true
    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff(`live/timers/${medidor.id}`, 'DELETE')
    enviando.current = false
    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setDetenido(true)
    setConfirmando(false)
    avisarCambioDeMedidor()
  }

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 py-2">
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
              {detenido ? 'Detenido' : formatearDuracion(medidor.seconds + transcurrido)}
            </span>
            )}

        {/* Los segundos de antigüedad los calcula el servidor: ver `haceCuanto()`. */}
        <span className="text-texto-sutil text-xs">
          {presencia === null ? 'Sin señales' : haceCuanto(presencia.seconds_ago)}
        </span>
      </div>
      {medidor !== null && puedeDetener && !detenido && !confirmando && (
        <Boton
          tamano="chico"
          className="min-h-11 shrink-0"
          aria-label={`Detener cronómetro de ${staff.name}`}
          onClick={() => { setConfirmando(true) }}
        >
          <Square size={14} aria-hidden="true" />
          Detener
        </Boton>
      )}

      {confirmando && (
        <div className="flex basis-full flex-wrap items-center gap-2">
          <p className="text-texto-tenue basis-full text-sm">
            ¿Detener el cronómetro de {staff.name}? Se guardará el tiempo hasta ahora. La jornada seguirá abierta.
          </p>
          <Boton tamano="chico" className="min-h-11" cargando={enCurso} onClick={() => { void detener() }}>
            Confirmar detención
          </Boton>
          <Boton tamano="chico" className="min-h-11" variante="sutil" disabled={enCurso} onClick={() => { setConfirmando(false); setError(null) }}>
            Cancelar
          </Boton>
          {error !== null && <p role="alert" className="text-texto-peligro basis-full text-sm">{error}</p>}
        </div>
      )}
    </li>
  )
}
