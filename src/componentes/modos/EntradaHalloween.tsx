'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Moon } from 'lucide-react'
import { stagger } from 'animejs'
import { useSecuenciaDeObra } from '@/componentes/estructura/bienvenida/useSecuenciaDeObra'
import { diaLocal } from '@/dominio/modos-especiales'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import { Calabaza, Murcielago } from './Dibujos'

/** Clave de `localStorage` con el dia en que esta persona ya vio la entrada. */
const CLAVE_ENTRADA = 'wiwo-modo-entrada'
/** Duracion total de la escena; es la misma regla que la de la bienvenida (OBRA). */
const ESCENA_MS = 2000
/** Rutas donde la entrada no va: las pantallas de oficina y la pagina publica de una tarea. */
const RUTAS_SIN_ENTRADA = ['/pantalla', '/tarea', '/s/', '/sala']

/**
 * Decide si hoy toca mostrar la entrada: una vez por dia por persona, nunca encima de la bienvenida
 * de una actualizacion, ni con menos movimiento, ni en las pantallas que nadie esta mirando de cerca.
 */
function tocaEntrada (ruta: string): boolean {
  if (cumpleConsulta(MENOS_MOVIMIENTO)) return false
  if (document.documentElement.hasAttribute('data-bienvenida')) return false
  if (RUTAS_SIN_ENTRADA.some((prefijo) => ruta.startsWith(prefijo))) return false

  try {
    return window.localStorage.getItem(CLAVE_ENTRADA) !== diaLocal(new Date())
  } catch {
    return false
  }
}

/** Anota que hoy ya se vio, para no repetirla en la proxima navegacion completa. */
function anotarEntradaVista (): void {
  try {
    window.localStorage.setItem(CLAVE_ENTRADA, diaLocal(new Date()))
  } catch {
    // Sin almacenamiento se repite en cada carga; es molesto, no un error.
  }
}

/**
 * La entrada de Halloween: un telon con una calabaza y unos murcielagos que dura ~2 s, una vez al dia.
 *
 * Se va sola, y antes con un clic o con Escape. Con `prefers-reduced-motion` no se muestra.
 */
export function EntradaHalloween () {
  const ruta = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!tocaEntrada(ruta)) return

    // Un efecto no puede fijar estado en su cuerpo sin una carga extra; el temporizador de cero
    // milisegundos lo deja para despues del primer pintado, que es lo que se quiere de todos modos.
    // Lo de "ya la vio" se anota ahi dentro y no antes: en desarrollo React corre el efecto, lo
    // limpia y lo vuelve a correr, y anotar antes dejaba a la segunda pasada sin entrada.
    const puerta = window.setTimeout(() => {
      anotarEntradaVista()
      setVisible(true)
    }, 0)

    return () => { window.clearTimeout(puerta) }
    // Solo la primera ruta de la carga: navegar dentro de la app no la repite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible) return null

  return createPortal(<Telon onTerminar={() => { setVisible(false) }} />, document.body)
}

/** El telon en si: se arma, se anima y avisa cuando se debe retirar. */
function Telon ({ onTerminar }: { onTerminar: () => void }) {
  useSecuenciaDeObra((linea) => {
    linea
      .set('[data-entrada-modo="telon"]', { opacity: 0 })
      .add('[data-entrada-modo="telon"]', { opacity: [0, 1], duration: 300 }, 0)
      .add('[data-entrada-modo="luna"]', { opacity: [0, 0.2], translateY: [16, 0], duration: 700, ease: 'outQuint' }, 100)
      .add('[data-entrada-modo="calabaza"]', { scale: [0.9, 1], translateY: [14, 0], opacity: [0, 1], duration: 600, ease: 'outQuint' }, 200)
      .add('[data-entrada-modo="murcielago"]', { translateY: [18, 0], opacity: [0, 1], duration: 600, ease: 'outQuint', delay: stagger(90) }, 450)
      .add('[data-entrada-modo="texto"]', { opacity: [0, 1], translateY: [10, 0], duration: 400 }, 700)
      .add('[data-entrada-modo="telon"]', { opacity: 0, duration: 350, ease: 'inQuad' }, ESCENA_MS - 350)
      .call(() => { onTerminar() }, ESCENA_MS)
  })

  useEffect(() => {
    const cerrar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onTerminar() }

    window.addEventListener('keydown', cerrar)
    return () => { window.removeEventListener('keydown', cerrar) }
  }, [onTerminar])

  return (
    <div
      data-entrada-modo="telon"
      role="presentation"
      onClick={onTerminar}
      className="fixed inset-0 z-[100] grid cursor-pointer place-items-center bg-superficie"
    >
      <Moon
        aria-hidden
        strokeWidth={1.5}
        data-entrada-modo="luna"
        className="text-marca absolute top-[14vh] size-40"
      />
      <div className="relative flex flex-col items-center gap-4">
        <div className="flex items-end gap-6">
          <Murcielago className="text-marca h-6 w-9" data-entrada-modo="murcielago" />
          <Calabaza className="h-24 w-24" data-entrada-modo="calabaza" />
          <Murcielago className="text-marca h-6 w-9" data-entrada-modo="murcielago" />
        </div>
        <p data-entrada-modo="texto" className="text-texto font-titular text-xl font-semibold">
          Feliz Halloween
        </p>
      </div>
    </div>
  )
}
