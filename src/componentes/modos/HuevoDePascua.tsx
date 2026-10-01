'use client'

import { useEffect, useState } from 'react'
import { animate, stagger } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import { Calabaza } from './Dibujos'

/** Clave de `sessionStorage`: el huevo se dispara una vez por sesion. */
const CLAVE_HUEVO = 'wiwo-modo-huevo'
/** Clics sobre el logo que lo disparan, y el tiempo en que tienen que darse. */
const CLICS = 5
const VENTANA_MS = 3000
const CALABAZAS = 14
const LLUVIA_MS = 2600

/**
 * Cinco clics seguidos sobre el logo (`[data-logo]`) hacen llover calabazas un momento.
 *
 * Escucha en el documento y no en el logo: el logo vive en tres armazones y asi no hay que pasar un
 * manejador por ninguno. Una vez por sesion, y nunca con menos movimiento.
 */
export function HuevoDePascua () {
  const [lloviendo, setLloviendo] = useState(false)

  useEffect(() => {
    let clics: number[] = []

    const alHacerClic = (evento: MouseEvent) => {
      if (!(evento.target instanceof Element) || evento.target.closest('[data-logo]') === null) return
      if (cumpleConsulta(MENOS_MOVIMIENTO)) return

      const ahora = Date.now()
      clics = [...clics.filter((t) => ahora - t < VENTANA_MS), ahora]
      if (clics.length < CLICS) return

      clics = []
      try {
        if (window.sessionStorage.getItem(CLAVE_HUEVO) !== null) return
        window.sessionStorage.setItem(CLAVE_HUEVO, '1')
      } catch {
        // Sin almacenamiento puede repetirse; no es un error.
      }
      setLloviendo(true)
    }

    document.addEventListener('click', alHacerClic)
    return () => { document.removeEventListener('click', alHacerClic) }
  }, [])

  if (!lloviendo) return null

  return <Lluvia onTerminar={() => { setLloviendo(false) }} />
}

/** Las calabazas cayendo; se desmonta sola al terminar. */
function Lluvia ({ onTerminar }: { onTerminar: () => void }) {
  useEffect(() => {
    const caida = animate('[data-calabaza-lluvia]', {
      translateY: ['-15vh', '115vh'],
      rotate: [() => Math.round(Math.random() * 40 - 20), () => Math.round(Math.random() * 360 - 180)],
      duration: LLUVIA_MS,
      ease: 'inQuad',
      delay: stagger(90),
      onComplete: onTerminar
    })

    return () => { caida.revert() }
  // El callback se lee una sola vez: la lluvia es de una sola pasada.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-flotante overflow-hidden">
      {Array.from({ length: CALABAZAS }, (_, i) => (
        <span
          key={i}
          data-calabaza-lluvia=""
          style={{ left: `${(i * 97) % 94}vw`, top: 0 }}
          className="absolute block h-9 w-9 -translate-y-full"
        >
          <Calabaza className="size-full" />
        </span>
      ))}
    </div>
  )
}
