'use client'

import { useEffect, useRef, useState, type AnimationEvent, type RefObject } from 'react'
import { actaDeDetalleDeEvento, type ActaPedida } from '@/dominio/orbe-contexto'
import { EVENTO_ABRIR_ORBE } from '@/dominio/pantalla'
import { usePresencia } from '@/lib/usePresencia'

/**
 * El atajo global que abre y cierra el panel: Cmd/Ctrl+J.
 *
 * Cmd/Ctrl+K ya es de `PaletaDeComandos` (`componentes/paleta/PaletaDeComandos.tsx`), que lo captura
 * en `window`; dos oyentes sobre la misma combinación se pisarían. La J es la siguiente en el
 * teclado y no choca con ninguna otra combinación del panel.
 */
export const TECLA_ATAJO_PANEL = 'j'

/** Lo que devuelve el hook. */
export interface PanelFlotante {
  abierto: boolean
  /** El panel está en el DOM: abierto, o saliendo con su animación. */
  montado: boolean
  saliendo: boolean
  alTerminarAnimacion: (evento: AnimationEvent<HTMLElement>) => void
  /** Cada apertura monta un chat nuevo, que relee el hilo; cambia con cada apertura. */
  apertura: number
  /** El acta con la que una pantalla pidió abrir el orbe, o `null`. */
  actaPedida: ActaPedida | null
  /** Ref del botón flotante: el foco vuelve a él al cerrar. */
  botonRef: RefObject<HTMLButtonElement | null>
  alternar: () => void
  cerrar: () => void
}

/** Indica si hay otro diálogo modal abierto (Radix), distinto del propio panel. @returns `true` si lo hay. */
function hayOtroDialogo (): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null
}

/**
 * Estado y comportamiento del orbe flotante: abrir y cerrar, Escape, foco y atajo global.
 *
 * - El evento `wiwo:abrir-orbe` lo abre desde otra pantalla (p. ej. «Preguntar» en un Meeting
 *   Paper), y puede traer `detail: { actaId }`.
 * - Escape cierra, salvo que haya un diálogo modal encima (la confirmación de «Nueva conversación»
 *   tiene que cerrarse a sí misma, no llevarse el panel).
 * - Al abrir el foco va al campo, aunque el chat aún esté leyendo el hilo (un observador espera a
 *   que aparezca). Al cerrar, si el foco estaba dentro del panel, vuelve al botón flotante.
 * - Cmd/Ctrl+J alterna el panel desde cualquier parte, salvo con otro diálogo abierto.
 *
 * @param panel Ref del panel, para enfocar su campo.
 * @param ruta Pathname vigente: el acta pedida por evento solo vale mientras se siga en esa ruta.
 * @returns El estado de presencia y las acciones.
 */
export function usePanelFlotante (panel: RefObject<HTMLDivElement | null>, ruta: string): PanelFlotante {
  const [abierto, setAbierto] = useState(false)
  const { montado, saliendo, alTerminarAnimacion } = usePresencia(abierto)
  const [apertura, setApertura] = useState(0)
  const [actaPedida, setActaPedida] = useState<ActaPedida | null>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const rutaRef = useRef(ruta)
  useEffect(() => { rutaRef.current = ruta })

  function abrir (): void {
    setApertura(n => n + 1)
    setAbierto(true)
  }

  function cerrar (): void {
    if (panel.current?.contains(document.activeElement)) botonRef.current?.focus()
    setAbierto(false)
  }

  function alternar (): void {
    if (abierto) cerrar()
    else abrir()
  }

  // Los oyentes de ventana leen siempre las acciones del último render por este ref: se suscriben una vez.
  const ultimas = useRef({ abrir, cerrar, alternar })
  useEffect(() => { ultimas.current = { abrir, cerrar, alternar } })

  // Otras pantallas piden abrir el chat con un evento de ventana, sin conocer este componente.
  useEffect(() => {
    const alPedirApertura = (evento: Event): void => {
      const id = actaDeDetalleDeEvento((evento as CustomEvent).detail)
      setActaPedida(id === null ? null : { id, ruta: rutaRef.current })
      ultimas.current.abrir()
    }
    window.addEventListener(EVENTO_ABRIR_ORBE, alPedirApertura)
    return () => { window.removeEventListener(EVENTO_ABRIR_ORBE, alPedirApertura) }
  }, [])

  // Atajo global. `PaletaDeComandos` usa Cmd/Ctrl+K; este usa J.
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.key.toLowerCase() !== TECLA_ATAJO_PANEL || !(evento.metaKey || evento.ctrlKey) || evento.altKey || evento.shiftKey) return
      if (hayOtroDialogo()) return
      evento.preventDefault()
      ultimas.current.alternar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => { window.removeEventListener('keydown', alTeclear) }
  }, [])

  // Cerrar con Escape es lo que espera cualquiera que abra algo flotante; acá no lo da Radix.
  useEffect(() => {
    if (!abierto) return
    const alTeclado = (evento: KeyboardEvent): void => {
      if (evento.key !== 'Escape' || evento.defaultPrevented || hayOtroDialogo()) return
      ultimas.current.cerrar()
    }
    document.addEventListener('keydown', alTeclado)
    return () => { document.removeEventListener('keydown', alTeclado) }
  }, [abierto])

  // El foco va al campo, no al panel: quien abre el chat es para escribir. El campo no existe cuando
  // el panel se monta —el chat puede estar leyendo el hilo—, así que se espera a que aparezca.
  useEffect(() => {
    const caja = panel.current
    if (!abierto || caja === null) return
    const enfocar = (): boolean => {
      const campo = caja.querySelector('textarea')
      campo?.focus()
      return campo !== null
    }
    if (enfocar()) return
    const observador = new MutationObserver(() => { if (enfocar()) observador.disconnect() })
    observador.observe(caja, { childList: true, subtree: true })
    return () => { observador.disconnect() }
  }, [abierto, panel])

  return { abierto, montado, saliendo, alTerminarAnimacion, apertura, actaPedida, botonRef, alternar, cerrar }
}
