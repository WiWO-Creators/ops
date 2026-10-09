'use client'

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { accionDelHilo, ultimoMensajeALaVista } from '@/dominio/hilo-de-ticket'

/** Lo que el hilo necesita para avisar de mensajes nuevos y llevar a ellos. */
export interface SeguimientoDelHilo {
  /** Llegaron mensajes mientras la persona leia mas arriba y todavia no los vio. */
  hayNuevos: boolean
  /** Lleva la vista al ultimo mensaje y apaga el aviso. */
  irAlUltimo: () => void
}

/**
 * La zona que scrollea alrededor de un elemento: el ancestro con `overflow-y` auto o scroll.
 *
 * En el modal es el panel entero del `Dialogo` (el hilo no scrollea por su cuenta), y buscarlo asi
 * evita atar este hook a una clase o a un rol concretos.
 *
 * @param elemento donde se empieza a subir
 * @returns el ancestro que scrollea, o el scroll del documento si no hay ninguno
 */
function zonaDeScroll (elemento: HTMLElement): HTMLElement {
  for (let actual = elemento.parentElement; actual !== null; actual = actual.parentElement) {
    const { overflowY } = getComputedStyle(actual)

    if (overflowY === 'auto' || overflowY === 'scroll') return actual
  }

  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/**
 * Sigue el hilo de un ticket: al abrirlo lleva la vista al ultimo mensaje, acompaña a quien esta al
 * final cuando llegan mensajes y, a quien lee mas arriba, le avisa sin moverlo.
 *
 * Respeta el scroll del `Dialogo`: no scrollea la pagina ni toca el panel salvo para llevar al
 * ultimo mensaje, y el movimiento es instantaneo (sin animacion propia, el hilo en vivo llega cada
 * 30 s y una animacion por cada llegada distrae mas que ayuda).
 *
 * @param lista la lista de mensajes, cuyo ultimo hijo es el mensaje mas nuevo
 * @param cantidad cuantos mensajes tiene el hilo ahora
 * @returns si hay mensajes sin ver y como ir a ellos
 */
export function useSeguimientoDelHilo (lista: RefObject<HTMLElement | null>, cantidad: number): SeguimientoDelHilo {
  const [hayNuevos, setHayNuevos] = useState(false)
  const anterior = useRef<number | null>(null)
  const alFinal = useRef(true)

  /** Lleva la vista al ultimo mensaje y apaga el aviso. */
  const irAlUltimo = (): void => {
    lista.current?.lastElementChild?.scrollIntoView({ block: 'end' })
    alFinal.current = true
    setHayNuevos(false)
  }

  // Antes de que llegue lo nuevo hay que saber donde estaba la persona: se mide al scrollear. El
  // aviso se apaga solo cuando llega al ultimo mensaje por su cuenta.
  useEffect(() => {
    const elemento = lista.current

    if (elemento === null) return

    const zona = zonaDeScroll(elemento)
    const alScrollear = (): void => {
      const ultimo = elemento.lastElementChild

      alFinal.current = ultimo === null || ultimoMensajeALaVista(ultimo.getBoundingClientRect(), zona.getBoundingClientRect())
      if (alFinal.current) setHayNuevos(false)
    }

    zona.addEventListener('scroll', alScrollear, { passive: true })

    return () => { zona.removeEventListener('scroll', alScrollear) }
  }, [lista])

  const alCambiarCantidad = useEffectEvent((total: number): void => {
    const accion = accionDelHilo(anterior.current, total, alFinal.current)

    anterior.current = total

    if (accion === 'aterrizar' || accion === 'seguir') irAlUltimo()
    else if (accion === 'avisar') setHayNuevos(true)
  })

  useEffect(() => { alCambiarCantidad(cantidad) }, [cantidad])

  return { hayNuevos, irAlUltimo }
}
