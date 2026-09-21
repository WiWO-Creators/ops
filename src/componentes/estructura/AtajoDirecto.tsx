'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Radiation } from 'lucide-react'
import { detectorDe } from '@/lib/secuencia'
import './atajo-directo.css'

const TECLAS = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a'
]

/** Milisegundos de la coreografia. Tiene que coincidir con el ultimo `animation-delay` del CSS. */
const DURACION = 2660

/** `true` si el foco esta en algo donde la persona esta escribiendo. */
function escribiendo (destino: EventTarget | null): boolean {
  if (!(destino instanceof HTMLElement)) return false

  return destino.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)
}

export function AtajoDirecto ({ destino }: { destino: string }) {
  const router = useRouter()
  const [abriendo, setAbriendo] = useState(false)

  useEffect(() => {
    if (abriendo) return

    const detector = detectorDe(TECLAS)

    function alTeclear (evento: KeyboardEvent) {
      if (escribiendo(evento.target)) {
        detector.reiniciar()
        return
      }

      if (detector.empujar(evento.key)) setAbriendo(true)
    }

    window.addEventListener('keydown', alTeclear)
    return () => { window.removeEventListener('keydown', alTeclear) }
  }, [abriendo])

  useEffect(() => {
    if (!abriendo) return

    // La navegacion no depende de la animacion: quien pidio menos movimiento entra igual, solo antes.
    const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const espera = menosMovimiento ? 180 : DURACION
    const reloj = setTimeout(() => { router.push(destino) }, espera)

    return () => { clearTimeout(reloj) }
  }, [abriendo, destino, router])

  if (!abriendo) return null

  return (
    <div className="ad" aria-hidden="true">
      <div className="ad__flash" />
      <div className="ad__h ad__h--a" />
      <div className="ad__h ad__h--b" />
      <div className="ad__f" />
      <div className="ad__l" />
      <div className="ad__c">
        <Radiation size={46} strokeWidth={1.5} />
      </div>
    </div>
  )
}
