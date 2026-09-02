'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Vuelve a pedir la pantalla cada tantos segundos.
 *
 * La pantalla de puerta no la mira nadie: queda colgada, y tiene que decir la verdad sin que alguien
 * apriete F5. `router.refresh()` vuelve a ejecutar el componente de servidor y reemplaza el HTML sin
 * recargar la pagina ni perder el estado del navegador, que es lo que le pasaria a un
 * `location.reload()` en un bucle.
 *
 * No renderiza nada: es solo el latido.
 *
 * @param segundos cada cuanto refrescar
 */
export function Refrescador ({ segundos }: { segundos: number }) {
  const router = useRouter()

  useEffect(() => {
    const latido = globalThis.setInterval(() => router.refresh(), segundos * 1000)

    return () => globalThis.clearInterval(latido)
  }, [router, segundos])

  return null
}
