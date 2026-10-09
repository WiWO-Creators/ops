'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Logo } from '@/componentes/estructura/Logo'

/** Cuanto se espera antes de volver a pedir la agenda de la sala. */
const SEGUNDOS_DE_REINTENTO = 30

/** Tras tantos intentos fallidos se recarga la pagina entera, que es el ultimo recurso que queda. */
const INTENTOS_ANTES_DE_RECARGAR = 5

/**
 * Red de contencion de la pantalla de puerta de una sala.
 *
 * Sin este limite, un 500 de la API o un corte de red subia al `error.tsx` de la raiz, que ofrece
 * controles de colaborador a una tablet colgada en la pared sin nadie delante. Aca se reintenta sola,
 * igual que `pantalla/[codigo]/error.tsx`.
 *
 * Reintenta con `retry` y no con `reset`: lo que falla en esta ruta es la lectura de la agenda en el
 * servidor, y solo volver a pedirla puede cambiar el resultado.
 *
 * Sin detalle tecnico: la URL lleva el token de la sala y la pantalla se ve desde el pasillo.
 *
 * @param retry vuelve a pedir y dibujar el segmento
 * @returns el aviso de reconexion
 */
export default function ErrorDeSala ({ retry }: {
  error: Error & { digest?: string }
  retry: () => void
}): ReactElement {
  const [intentos, setIntentos] = useState(0)
  const retryRef = useRef(retry)

  useEffect(() => { retryRef.current = retry })

  useEffect(() => {
    const alarma = globalThis.setTimeout(() => {
      if (intentos >= INTENTOS_ANTES_DE_RECARGAR) {
        globalThis.location.reload()

        return
      }

      setIntentos((previos) => previos + 1)
      retryRef.current()
    }, SEGUNDOS_DE_REINTENTO * 1000)

    return () => { globalThis.clearTimeout(alarma) }
  }, [intentos])

  return (
    <main className="bg-superficie text-texto flex min-h-dvh flex-col items-center justify-center gap-[3vmin] p-[6vmin] text-center">
      <p className="text-[6vmin] font-semibold">Reconectando con Ops…</p>
      <p className="text-texto-tenue text-[3.4vmin]">
        La agenda de la sala vuelve sola en cuanto el servicio responda.
      </p>

      <footer className="text-texto-sutil mt-[4vmin]">
        <Logo tamano="chico" />
      </footer>
    </main>
  )
}
