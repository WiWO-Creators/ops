'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { escucharEnVivo, escucharEstado, estaConectadoEnVivo, type CambioEnVivo } from '@/datos/en-vivo'
import type { TipoDeCambio } from '@/dominio/en-vivo'

/**
 * Se entera, sin esperas, de los cambios del bus de los tipos indicados.
 *
 * Sin «en vivo» (o con el socket caído) nunca se llama: quien lo use debe conservar su sondeo. La
 * función puede cambiar entre renders sin volver a suscribirse.
 *
 * @param tipos los tipos de cambio que interesan
 * @param alCambiar se llama por cada cambio de esos tipos
 */
export function useEnVivo (tipos: readonly TipoDeCambio[], alCambiar: (cambio: CambioEnVivo) => void): void {
  const ultima = useRef(alCambiar)
  const clave = tipos.join(',')

  useEffect(() => { ultima.current = alCambiar }, [alCambiar])

  useEffect(() => {
    const interesan = clave.split(',')

    return escucharEnVivo((cambio) => {
      if (interesan.includes(cambio.tipo)) ultima.current(cambio)
    })
  }, [clave])
}

/**
 * Si el socket del bus está conectado ahora mismo.
 *
 * @returns `false` en el servidor, con «en vivo» apagado y mientras se reconecta
 */
export function useConectadoEnVivo (): boolean {
  return useSyncExternalStore(escucharEstado, estaConectadoEnVivo, () => false)
}
