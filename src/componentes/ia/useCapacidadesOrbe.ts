'use client'

import { useCallback, useEffect, useState } from 'react'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { capacidadesEnCache, pedirCapacidadesCacheadas } from '@/dominio/cache-capacidades'
import { leerCapacidadesOrbe, type CapacidadesOrbe } from '@/dominio/orbe-capacidades'
import { ASISTENTE } from '@/dominio/glosario'
import type { ConfiguracionOrbe } from '@/dominio/orbe-sujeto'

/**
 * Pide las capacidades de una ruta. Un 404 equivale a «sin capacidades» (backend anterior).
 *
 * @param ruta Ruta del BFF de capacidades del sujeto.
 * @returns Las capacidades leídas.
 * @throws Error con el mensaje del servidor si la respuesta no es buena.
 */
async function pedirCapacidades (ruta: string): Promise<CapacidadesOrbe> {
  return await pedirCapacidadesCacheadas(ruta, async () => {
    const respuesta = await pedirRespuesta(ruta, new AbortController().signal)
    let datos: unknown = {}
    if (respuesta.status !== 404) {
      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))
      datos = ((await respuesta.json()) as { data?: unknown }).data
    }
    return leerCapacidadesOrbe(datos)
  })
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
  const [capacidades, setCapacidades] = useState<CapacidadesOrbe | null>(() => capacidadesEnCache(rutaCapacidades))
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
