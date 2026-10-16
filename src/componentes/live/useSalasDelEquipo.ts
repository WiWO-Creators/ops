'use client'

import { useEffect, useState } from 'react'
import { conLimite, TIEMPO_LECTURA_MS } from '@/datos/red'
import { salasDeRespuesta } from '@/dominio/equipo-en-vivo'

/**
 * Cada cuánto se vuelve a preguntar quién está en qué sala. Un poco más que la vigencia de 15 s de
 * `personasEnSalas` en el servidor: preguntar más seguido solo devolvería lo mismo.
 */
const INTERVALO_DE_SALAS_MS = 20_000

/**
 * Quién del equipo está dentro de una sala de Teletrabajo, para marcar «en reunión» en las tarjetas.
 *
 * Pregunta a `/api/equipo/salas` al montar y cada 20 s mientras la pestaña esté a la vista. Si la
 * pregunta falla (LiveKit caído, sin sesión) conserva lo último que sabía, y si nunca supo nada
 * devuelve `null`: las tarjetas simplemente no marcan reuniones, que es peor que lo ideal pero no
 * es mentira. Es un dato accesorio: nada del tablero depende de él.
 *
 * @returns quién está en qué sala (id de persona → id de sala), o `null` si no se ha podido leer
 */
export function useSalasDelEquipo (): ReadonlyMap<number, string> | null {
  const [salas, setSalas] = useState<ReadonlyMap<number, string> | null>(null)

  useEffect(() => {
    const control = new AbortController()

    /** Una lectura; los fallos se descartan a propósito (ver el docblock). */
    async function leer (): Promise<void> {
      if (document.hidden) return

      try {
        const respuesta = await fetch('/api/equipo/salas', {
          cache: 'no-store',
          signal: conLimite(control.signal, TIEMPO_LECTURA_MS)
        })

        if (respuesta.ok) setSalas(salasDeRespuesta(await respuesta.json()))
      } catch {
        // Conserva lo último que se supo: una lectura fallida no borra a nadie de su reunión.
      }
    }

    void leer()
    const intervalo = globalThis.setInterval(() => { void leer() }, INTERVALO_DE_SALAS_MS)
    document.addEventListener('visibilitychange', leer)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', leer)
      control.abort()
    }
  }, [])

  return salas
}
