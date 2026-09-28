'use client'

import { useLayoutEffect } from 'react'
import { createTimeline, type Timeline } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/** Arma la secuencia de una escena sobre un timeline recien creado. */
export type ArmadorDeEscena = (linea: Timeline) => void

/**
 * Crea, reproduce y limpia el timeline de anime.js de una escena de bienvenida.
 *
 * El marcado de la escena ya es un dibujo completo y quieto: sin JavaScript, o con
 * `prefers-reduced-motion`, se queda tal cual como esta escrito en el JSX. Esa es la garantia contra
 * el destello sin animar: nada depende de que el JavaScript corra para volverse visible.
 *
 * Cuando si hay animacion en marcha, el armador es quien oculta lo que va a hacer entrar y arma la
 * secuencia. Por eso corre en `useLayoutEffect` y no en `useEffect`: tiene que ocultar antes del
 * primer pintado del navegador, no despues, o se alcanza a ver un fotograma de la escena ya terminada
 * antes de que la animacion la vuelva a esconder para empezar.
 *
 * Corre una unica vez por montaje —la escena no cambia de armador en caliente—, asi que el efecto
 * no necesita volver a leer `armar` en cada render: la version de la primera pasada es la unica que
 * importa.
 *
 * @param armar agrega la secuencia de la escena al timeline vacio que recibe
 */
export function useSecuenciaDeObra (armar: ArmadorDeEscena): void {
  useLayoutEffect(() => {
    if (cumpleConsulta(MENOS_MOVIMIENTO)) return

    const linea = createTimeline({ defaults: { ease: 'outQuad' } })
    armar(linea)

    return () => { linea.revert() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corre una vez por montaje a proposito
  }, [])
}

/**
 * Filtra los `null` de un arreglo de refs de elementos SVG reunidos con refs de callback.
 *
 * Los refs de callback dejan el arreglo tipado con `null` porque React lo permite en el momento del
 * desmontaje; en el instante en que `useSecuenciaDeObra` arma la escena ya estan todos asignados.
 *
 * @param elementos arreglo posiblemente con huecos
 * @returns los elementos presentes, sin huecos
 */
export function sinHuecos<T> (elementos: ReadonlyArray<T | null>): T[] {
  return elementos.filter((elemento): elemento is T => elemento !== null)
}
