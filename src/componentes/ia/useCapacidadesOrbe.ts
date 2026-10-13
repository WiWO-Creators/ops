'use client'

import { useCallback, useEffect, useState } from 'react'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { leerCapacidadesOrbe, type CapacidadesOrbe } from '@/dominio/orbe-capacidades'
import { ASISTENTE } from '@/dominio/glosario'
import type { ConfiguracionOrbe } from '@/dominio/orbe-sujeto'

/** Cuánto vale una respuesta de capacidades antes de volver a pedirla. */
const TTL_CAPACIDADES_MS = 60_000

const cache = new Map<string, { capacidades: CapacidadesOrbe, hasta: number }>()
const enVuelo = new Map<string, Promise<CapacidadesOrbe>>()

/**
 * Pide las capacidades de una ruta, con caché de módulo y una sola petición en vuelo por ruta.
 *
 * Cada apertura del chat monta un selector nuevo; sin la caché cada apertura repetía el GET. Solo
 * se guardan respuestas buenas: un fallo se reintenta en la próxima lectura. Un 404 equivale a
 * «sin capacidades» (backend anterior).
 *
 * @param ruta Ruta del BFF de capacidades del sujeto.
 * @returns Las capacidades leídas.
 * @throws Error con el mensaje del servidor si la respuesta no es buena.
 */
async function pedirCapacidades (ruta: string): Promise<CapacidadesOrbe> {
  const guardada = cache.get(ruta)
  if (guardada !== undefined && guardada.hasta > Date.now()) return guardada.capacidades

  const previa = enVuelo.get(ruta)
  if (previa !== undefined) return await previa

  const peticion = (async () => {
    const respuesta = await pedirRespuesta(ruta, new AbortController().signal)
    let datos: unknown = {}
    if (respuesta.status !== 404) {
      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))
      datos = ((await respuesta.json()) as { data?: unknown }).data
    }
    const capacidades = leerCapacidadesOrbe(datos)
    cache.set(ruta, { capacidades, hasta: Date.now() + TTL_CAPACIDADES_MS })
    return capacidades
  })().finally(() => { enVuelo.delete(ruta) })

  enVuelo.set(ruta, peticion)
  return await peticion
}

/** Descarta la caché. Solo para pruebas y para cerrar sesión. */
export function vaciarCapacidadesOrbe (): void {
  cache.clear()
}

/** Lo que devuelve el hook. */
export interface EstadoCapacidadesOrbe {
  capacidades: CapacidadesOrbe | null
  error: string
  reintentar: () => void
}

/**
 * Capacidades del orbe del sujeto, compartidas entre aperturas del chat por una caché de 60 s.
 *
 * @param configuracion La del sujeto: dice a qué ruta preguntar.
 * @returns `capacidades` en `null` mientras carga, `error` con el mensaje si falló y `reintentar`.
 */
export function useCapacidadesOrbe (configuracion: ConfiguracionOrbe): EstadoCapacidadesOrbe {
  const { rutaCapacidades } = configuracion
  const [capacidades, setCapacidades] = useState<CapacidadesOrbe | null>(() => {
    const guardada = cache.get(rutaCapacidades)
    return guardada !== undefined && guardada.hasta > Date.now() ? guardada.capacidades : null
  })
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    void pedirCapacidades(rutaCapacidades)
      .then(leidas => { if (vigente) setCapacidades(leidas) })
      .catch((fallo: unknown) => {
        if (vigente) setError(fallo instanceof Error ? fallo.message : `No se pudo cargar ${ASISTENTE}.`)
      })
    return () => { vigente = false }
  }, [rutaCapacidades, intento])

  const reintentar = useCallback((): void => {
    setError('')
    setIntento(n => n + 1)
  }, [])

  return { capacidades, error, reintentar }
}
