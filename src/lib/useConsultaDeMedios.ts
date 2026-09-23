'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Dice si una media query se cumple ahora, y se vuelve a pintar cuando cambia.
 *
 * Sobre `useSyncExternalStore` y no un `useEffect` con estado: así el valor es el mismo en todo el
 * árbol dentro de un mismo render, y girar el teléfono no deja un fotograma con la mitad de los
 * componentes en vertical y la otra mitad en horizontal.
 *
 * En el servidor no hay ventana: devuelve `alInicio`, que tiene que ser lo que pinta el HTML sin
 * JavaScript (normalmente `false`, la versión de escritorio).
 *
 * @param consulta media query completa, por ejemplo `(pointer: coarse)`
 * @param alInicio valor para el render del servidor y la hidratación
 * @returns `true` si la consulta se cumple
 */
export function useConsultaDeMedios (consulta: string, alInicio = false): boolean {
  const suscribir = useCallback((avisar: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const lista = window.matchMedia(consulta)
    lista.addEventListener('change', avisar)
    return () => { lista.removeEventListener('change', avisar) }
  }, [consulta])

  const leer = useCallback(() => typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches, [consulta])

  return useSyncExternalStore(suscribir, leer, () => alInicio)
}

/**
 * Lo mismo que el hook, para leer una sola vez desde un manejador de eventos.
 *
 * @param consulta media query completa
 * @returns `true` si se cumple; `false` fuera del navegador
 */
export function cumpleConsulta (consulta: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches
}

/** La preferencia de menos movimiento, que toda animación hecha con JavaScript tiene que respetar. */
export const MENOS_MOVIMIENTO = '(prefers-reduced-motion: reduce)'
