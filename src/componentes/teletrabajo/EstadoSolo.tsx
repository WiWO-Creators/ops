'use client'

import { BotonCopiar } from '@/componentes/datos/BotonCopiar'
import { cn } from '@/lib/clases'
import { FichaParticipante } from './FichaParticipante'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react'

interface PropsEstadoSolo {
  pista: TrackReferenceOrPlaceholder
  miIdentidad: string
  className?: string
}

/**
 * La sala con una sola persona dentro.
 *
 * Es un estado propio y no un mosaico de una celda, por dos motivos que se notan de inmediato:
 *
 * - **El tamaño.** Una unica ficha estirada al escenario entero convierte una cara en un primer
 *   plano de metro y medio. Aca la ficha tiene un ancho maximo y queda centrada, que es como se ve
 *   una persona esperando a que llegue el resto.
 * - **Lo que dice.** Una pantalla con un solo video y nada mas no distingue "todavia no llego
 *   nadie" de "esto esta roto". Decirlo con palabras, y ofrecer el enlace para invitar, convierte
 *   una espera en una accion.
 */
export function EstadoSolo ({ pista, miIdentidad, className }: PropsEstadoSolo) {
  return (
    <div className={cn('flex min-h-0 flex-col items-center justify-center gap-4', className)}>
      <FichaParticipante
        pista={pista}
        miIdentidad={miIdentidad}
        className="aspect-video w-full max-w-2xl"
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-texto-tenue">
          Estás solo en la sala. Pasa el enlace a quien tenga que entrar.
        </p>

        <BotonCopiar
          valor={() => window.location.href}
          etiqueta="Copiar enlace"
          etiquetaCopiado="Enlace copiado"
        />
      </div>
    </div>
  )
}
