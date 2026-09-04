'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
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
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<number | undefined>(undefined)

  // Este componente se desmonta en cuanto entra la segunda persona, que es justo lo que puede
  // pasar dentro de los dos segundos del aviso. Sin este cierre, el temporizador sobrevive al
  // desmontaje y escribe estado sobre un componente que ya no existe.
  useEffect(() => () => { window.clearTimeout(temporizador.current) }, [])

  /**
   * Copia el enlace de la sala al portapapeles.
   *
   * `navigator.clipboard` no existe fuera de un contexto seguro y puede negarse aunque exista, asi
   * que el fallo se traga y el boton simplemente no confirma. Anunciar un error de portapapeles no
   * le sirve a nadie: la URL sigue visible en la barra de direcciones.
   */
  const copiarEnlace = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => {
        setCopiado(true)
        window.clearTimeout(temporizador.current)
        temporizador.current = window.setTimeout(() => { setCopiado(false) }, 2000)
      })
      .catch(() => { setCopiado(false) })
  }, [])

  return (
    <div className={cn('flex min-h-0 flex-col items-center justify-center gap-4', className)}>
      <FichaParticipante
        pista={pista}
        miIdentidad={miIdentidad}
        className="aspect-video w-full max-w-2xl"
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-texto-tenue">
          Estás solo en la sala. Pasá el enlace a quien tenga que entrar.
        </p>

        <Boton variante="secundario" tamano="chico" onClick={copiarEnlace}>
          {copiado
            ? <Check size={14} aria-hidden="true" />
            : <Copy size={14} aria-hidden="true" />}
          {copiado ? 'Enlace copiado' : 'Copiar enlace'}
        </Boton>
      </div>
    </div>
  )
}
