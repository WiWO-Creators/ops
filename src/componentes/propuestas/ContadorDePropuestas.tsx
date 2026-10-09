'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { pedirSobre } from '@/datos/cliente'
import { propuestasDe, rutaDePropuestas } from '@/datos/propuestas'
import { contarPendientes } from '@/dominio/propuestas'

/** Cada cuánto se vuelve a preguntar. Una propuesta no urge al segundo; dos minutos alcanza. */
const LATIDO_MS = 120000

/**
 * El número de propuestas por responder, al lado de «Propuestas» en el menú.
 *
 * Un fallo —o una API que todavía no tiene la ruta— deja el contador invisible: acompaña al rótulo y
 * no vale un aviso de error. Su texto va entero en el nombre accesible, porque un número solo no dice
 * de qué es.
 */
export function ContadorDePropuestas (): ReactElement | null {
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    const control = new AbortController()

    async function preguntar (): Promise<void> {
      try {
        const sobre = await pedirSobre<unknown>(rutaDePropuestas('pendiente'), control.signal)

        if (!control.signal.aborted) setPendientes(contarPendientes(propuestasDe(sobre.data), Date.now()))
      } catch {
        if (!control.signal.aborted) setPendientes(0)
      }
    }

    void preguntar()

    const reloj = setInterval(() => { void preguntar() }, LATIDO_MS)

    return () => {
      control.abort()
      clearInterval(reloj)
    }
  }, [])

  if (pendientes === 0) return null

  return (
    <span className="bg-acento text-acento-contenido ml-auto rounded-full px-1.5 text-xs font-semibold tabular-nums [[data-barra-abatida]_&]:absolute [[data-barra-abatida]_&]:right-1 [[data-barra-abatida]_&]:top-0.5">
      <span aria-hidden="true">{pendientes}</span>
      <span className="sr-only">{pendientes === 1 ? '1 propuesta por responder' : `${pendientes} propuestas por responder`}</span>
    </span>
  )
}
