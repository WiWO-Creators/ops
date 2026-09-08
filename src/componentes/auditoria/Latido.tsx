'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { accionEnCurso, escucharAccion, rutaDeTarea } from './accion'

/**
 * Informa ubicación y acción al navegar o interactuar en cualquier parte del panel.
 * Los eventos sólo actualizan una marca de actividad: nunca se leen teclas, valores ni contenido.
 * Cada intervalo envía como máximo una señal de interacción; sin actividad deja de renovar presencia.
 * @param segundos intervalo de envío configurado por el servidor
 */
export function Latido ({ segundos }: { segundos: number }) {
  const ruta = usePathname()

  useEffect(() => {
    const normalizada = ruta.toLowerCase()
    if (!/^\/[a-z0-9/_-]*$/.test(normalizada)) return

    const control = new AbortController()
    let pendiente = true
    let ultimoEnvio = 0

    /** Envía únicamente actividad nueva y visible; los fallos conservan la señal para reintentar. */
    function latir (): void {
      if (document.hidden || !pendiente) return
      pendiente = false
      ultimoEnvio = Date.now()
      void fetch('/api/bff/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ route: rutaDeTarea() ?? normalizada, action: accionEnCurso() }),
        signal: control.signal
      }).then((respuesta) => {
        if (!respuesta.ok) pendiente = true
      }).catch(() => {
        if (!control.signal.aborted) pendiente = true
      })
    }

    /** Cualquier interacción renueva actividad, con envío limitado al intervalo configurado. */
    function interactuar (): void {
      if (document.hidden) return
      pendiente = true
      if (Date.now() - ultimoEnvio >= segundos * 1000) latir()
    }

    /** Un cambio de ubicación o diálogo se comunica sin esperar el siguiente intervalo. */
    function cambiarContexto (): void {
      pendiente = true
      latir()
    }

    latir()
    const intervalo = globalThis.setInterval(latir, segundos * 1000)
    const dejarDeEscuchar = escucharAccion(cambiarContexto)
    const eventos = ['pointerdown', 'pointermove', 'keydown', 'input', 'change', 'submit', 'scroll', 'wheel', 'touchstart', 'focusin']
    for (const evento of eventos) document.addEventListener(evento, interactuar, { capture: true, passive: true })
    document.addEventListener('visibilitychange', interactuar)

    return () => {
      globalThis.clearInterval(intervalo)
      dejarDeEscuchar()
      for (const evento of eventos) document.removeEventListener(evento, interactuar, true)
      document.removeEventListener('visibilitychange', interactuar)
      control.abort()
    }
  }, [ruta, segundos])

  return null
}
