'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Logo } from '@/componentes/estructura/Logo'
import './pantalla.css'

/** Cuanto se espera antes de volver a intentar el render. */
const SEGUNDOS_DE_REINTENTO = 30

/** Tras tantos intentos fallidos se recarga la pagina entera, que es el ultimo recurso que queda. */
const INTENTOS_ANTES_DE_RECARGAR = 5

/**
 * Red de contencion de la pantalla de area.
 *
 * === POR QUE SE REINTENTA SOLA ===
 *
 * Esta pantalla vive en una pared, encendida de noche y los fines de semana, sin nadie delante. Un
 * `error.tsx` que se queda esperando un clic que nunca va a llegar es una pared apagada hasta que
 * alguien suba a una escalera el lunes.
 *
 * Los fallos de DATOS no llegan hasta acá: el Server Component los atrapa y la pantalla arranca en
 * modo espera reconectando sola. Lo que llega acá es un fallo de RENDER, que casi siempre se arregla
 * con un montaje limpio — y si no, con una recarga dura, que ademas recoge el despliegue nuevo.
 *
 * === SIN DETALLE TECNICO, Y NO POR PROLIJIDAD ===
 *
 * Esta URL esta abierta a internet. El mensaje crudo del servidor —rutas, nombres de tabla, el host
 * de la API— quedaria publicado en una pared y en cualquier foto que alguien le saque.
 */
export default function ErrorDePantalla ({ reset }: {
  error: Error & { digest?: string }
  reset: () => void
}): ReactElement {
  const [intentos, setIntentos] = useState(0)
  const resetRef = useRef(reset)

  useEffect(() => { resetRef.current = reset })

  useEffect(() => {
    const alarma = globalThis.setTimeout(() => {
      if (intentos >= INTENTOS_ANTES_DE_RECARGAR) {
        globalThis.location.reload()

        return
      }

      setIntentos((previos) => previos + 1)
      resetRef.current()
    }, SEGUNDOS_DE_REINTENTO * 1000)

    return () => { globalThis.clearTimeout(alarma) }
  }, [intentos])

  return (
    <main className="pantalla-raiz bg-superficie text-texto flex h-dvh flex-col items-center justify-center gap-[3vmin] p-[6vmin] text-center">
      <p className="text-texto text-[6vmin] font-semibold">Reconectando con Ops…</p>
      <p className="text-texto-tenue text-[3.4vmin]">
        La pantalla vuelve sola en cuanto el servicio responda.
      </p>

      <footer className="text-texto-sutil mt-[4vmin]">
        <Logo tamano="chico" />
      </footer>
    </main>
  )
}
