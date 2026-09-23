'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useAlCambiarTickets } from '@/componentes/datos/useAlCambiarTickets'
import { pedirSobre } from '@/datos/cliente'
import { etiquetaDePestana, leerContadores, type ContadoresDeTickets } from '@/dominio/tickets-listados'

/**
 * Contadores de tickets de un Proyecto, al dia con el aviso `ops:tickets-cambiados`.
 *
 * Un fallo deja `null` y la pestaña con su nombre a secas: el contador acompaña al rotulo, y un
 * error en un numero de la barra de pestañas no merece mas que eso. Lo mismo si la API todavia no
 * tiene la ruta (backend anterior al contrato v2).
 *
 * @param proyectoId el Proyecto
 * @returns los contadores, o `null` mientras no hay
 */
export function useContadoresDeTickets (proyectoId: number): ContadoresDeTickets | null {
  const [contadores, setContadores] = useState<ContadoresDeTickets | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useAlCambiarTickets(() => { setVuelta((n) => n + 1) })

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<unknown>(`projects/${encodeURIComponent(String(proyectoId))}/tickets/contadores`, control.signal)
      .then((sobre) => { if (!control.signal.aborted) setContadores(leerContadores(sobre.data)) })
      .catch(() => { if (!control.signal.aborted) setContadores(null) })

    return () => { control.abort() }
  }, [proyectoId, vuelta])

  return contadores
}

/**
 * El adorno de la pestaña Tickets: " · 3" y, si hay tickets esperando al equipo, un punto de aviso.
 *
 * El punto no es decoracion: dice que hay algo que el equipo tiene que mover, y su texto va entero en
 * el nombre accesible (`sr-only`), porque un color solo no es un dato.
 *
 * @param props.proyectoId el Proyecto
 * @param props.base el rotulo de la pestaña, para armar el nombre accesible
 */
export function ContadorDeTickets ({ proyectoId, base }: { proyectoId: number, base: string }): ReactElement | null {
  const contadores = useContadoresDeTickets(proyectoId)

  if (contadores === null) return null

  return (
    <span title={etiquetaDePestana(base, contadores)}>
      {/* Espacios duros: en una barra angosta el rotulo no se parte entre "Tickets" y su numero. */}
      <span aria-hidden="true" className="whitespace-nowrap">
        {'\u00a0·\u00a0'}
        <span className="tabular-nums">{contadores.abiertos}</span>
        {contadores.esperandoEquipo > 0 && (
          <span className="bg-texto-aviso ml-1.5 inline-block size-1.5 -translate-y-px rounded-full align-middle" />
        )}
      </span>
      <span className="sr-only">
        {`, ${contadores.abiertos} ${contadores.abiertos === 1 ? 'abierto' : 'abiertos'}`}
        {contadores.esperandoEquipo > 0 && `, ${contadores.esperandoEquipo} esperando al equipo`}
      </span>
    </span>
  )
}
