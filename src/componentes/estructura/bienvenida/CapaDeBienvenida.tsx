'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import type { EscenaDeBienvenida } from './escenas'

/** Para quien pidio menos movimiento: se ve el cartel, no se le hace esperar la coreografia. */
const OBRA_REDUCIDA = 700
/** El cierre en iris. Tiene que coincidir con `duration-lenta` de la capa (`--wiwo-motion-slow`). */
const SALIDA = 420

interface PropsCapa {
  /** La coreografia a mostrar. */
  escena: EscenaDeBienvenida
  /** Al empezar la salida. Es el momento de levantar el telon anti-destello, si lo hay. */
  onSaliendo?: () => void
  /** Cuando la salida termino y la capa se puede desmontar. */
  onTerminar: () => void
  /** Si viene, ofrece ver las novedades. Sin novedades que contar no se pasa y el boton no aparece. */
  onVerNovedades?: () => void
}

/**
 * La capa que tapa la pantalla con una coreografia y se retira cerrandose en iris hacia el centro.
 *
 * Se va sola al terminar la escena, y antes si la persona toca la capa o aprieta Escape: nadie
 * tiene que mirar tres segundos de animacion para volver a trabajar. La usa el vigilante de version
 * despues de actualizar y el laboratorio de animaciones para repetirla sin esperar un despliegue.
 *
 * @param escena la coreografia
 * @param onSaliendo al empezar la salida
 * @param onTerminar al terminar la salida
 * @param onVerNovedades abre el recorrido de novedades en lugar de volver al panel
 */
export function CapaDeBienvenida ({ escena, onSaliendo, onTerminar, onVerNovedades }: PropsCapa) {
  const [saliendo, setSaliendo] = useState(false)
  const alSalir = useEffectEvent(() => { onSaliendo?.() })
  const alTerminar = useEffectEvent(onTerminar)

  useEffect(() => {
    const duracion = cumpleConsulta(MENOS_MOVIMIENTO) ? OBRA_REDUCIDA : escena.duracion
    const temporizador = globalThis.setTimeout(() => { setSaliendo(true) }, duracion)

    function alTeclear (evento: KeyboardEvent): void {
      if (evento.key === 'Escape') setSaliendo(true)
    }

    document.addEventListener('keydown', alTeclear)

    return () => {
      globalThis.clearTimeout(temporizador)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [escena.duracion])

  useEffect(() => {
    if (!saliendo) return

    alSalir()
    const temporizador = globalThis.setTimeout(alTerminar, SALIDA)

    return () => { globalThis.clearTimeout(temporizador) }
  }, [saliendo])

  // En un portal: montada dentro de una pagina, la entrada escalonada (`entrada-pagina.css`) queda
  // pausada mientras la capa existe y le presta su opacidad a medias. En `body` no hereda nada.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onClick={() => { setSaliendo(true) }}
      className={cn(
        'bienvenida-capa bg-superficie fixed inset-0 z-bienvenida flex cursor-pointer flex-col items-center justify-center gap-6 px-6',
        'transition-[clip-path] duration-lenta ease-in [clip-path:circle(150%_at_50%_50%)]',
        saliendo && '[clip-path:circle(0%_at_50%_50%)]'
      )}
    >
      <escena.Dibujo />
      <div className="space-y-1 text-center">
        <p className="text-texto text-lg font-semibold">Ops se actualizó</p>
        <p className="text-texto-tenue text-sm">{escena.frase}</p>
      </div>
      {onVerNovedades !== undefined && (
        <Boton
          variante="secundario"
          tamano="chico"
          className="pointer-coarse:min-h-11"
          onClick={(evento) => {
            evento.stopPropagation()
            onVerNovedades()
          }}
        >
          Ver qué cambió
        </Boton>
      )}
      <p className="text-texto-sutil absolute bottom-6 text-xs">Toca la pantalla o presiona Esc para seguir</p>
    </div>,
    document.body
  )
}
