'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as EventoTeclado, type PointerEvent as EventoPuntero, type RefObject } from 'react'
import {
  acotarTamanoChat,
  almacenamientoDelNavegador,
  guardarTamanoChat,
  leerTamanoChatGuardado,
  PASO_TAMANO_CHAT,
  type TamanoChat,
  type VentanaVisible
} from '@/dominio/tamano-chat'

/** Los manejadores que van al tirador de la esquina. */
export interface PropsTirador {
  onPointerDown: (evento: EventoPuntero<HTMLButtonElement>) => void
  onPointerMove: (evento: EventoPuntero<HTMLButtonElement>) => void
  onPointerUp: (evento: EventoPuntero<HTMLButtonElement>) => void
  onPointerCancel: (evento: EventoPuntero<HTMLButtonElement>) => void
  onKeyDown: (evento: EventoTeclado<HTMLButtonElement>) => void
}

/** Lo que devuelve el hook. */
export interface PanelRedimensionable {
  /** El tamaño que se pinta: el elegido, acotado a la ventana de este momento. */
  tamanoVisible: TamanoChat
  propsTirador: PropsTirador
}

/** Escribe el tamaño en las variables del panel, sin pasar por React. */
function escribirTamano (caja: HTMLElement, tamano: TamanoChat): void {
  caja.style.setProperty('--ancho-chat', `${tamano.ancho}px`)
  caja.style.setProperty('--alto-chat', `${tamano.alto}px`)
}

/**
 * El tamaño del panel flotante y el tirador que lo cambia.
 *
 * === POR QUÉ EL ARRASTRE NO PASA POR REACT ===
 *
 * Un arrastre son cientos de `pointermove`. Con un `setState` por evento, cada uno re-renderizaba el
 * panel entero —chat incluido—. Aquí el tamaño se escribe directo en las variables CSS del panel,
 * una vez por fotograma (`requestAnimationFrame`), y `setTamano` se llama solo al soltar, que es
 * también cuando se guarda. El teclado, que es un paso por pulsación, sí pasa por el estado.
 *
 * El panel está anclado abajo a la derecha: la única esquina que puede moverse es la de arriba a la
 * izquierda, así que el delta se suma invertido (retroceder en X agranda). El arrastre usa
 * `setPointerCapture`, que sigue mandando eventos al tirador aunque el puntero salga de la ventana.
 *
 * @param panel Ref del panel, de donde se leen las medidas al empezar y donde se escribe el tamaño.
 * @returns El tamaño a pintar y los manejadores del tirador.
 */
export function usePanelRedimensionable (panel: RefObject<HTMLDivElement | null>): PanelRedimensionable {
  // Se lee en el inicializador perezoso: el panel solo existe con `abierto` en `true`, así que no hay
  // riesgo de hidratación, y un setState en un efecto encadenaría un render de más.
  const [tamano, setTamano] = useState<TamanoChat>(() => leerTamanoChatGuardado(almacenamientoDelNavegador(), null))
  // `null` hasta que haya un `window` que medir.
  const [ventana, setVentana] = useState<VentanaVisible | null>(null)
  const arrastre = useRef<{ x: number, y: number, ancho: number, alto: number } | null>(null)
  const pendiente = useRef<TamanoChat | null>(null)
  const fotograma = useRef(0)
  const tamanoVisible = acotarTamanoChat(tamano, ventana)

  useEffect(() => {
    const medir = (): void => { setVentana({ ancho: window.innerWidth, alto: window.innerHeight }) }
    medir()
    window.addEventListener('resize', medir)
    return () => { window.removeEventListener('resize', medir) }
  }, [])

  useEffect(() => () => { cancelAnimationFrame(fotograma.current) }, [])

  /** Escribe en el panel el último tamaño pedido, si hay uno sin pintar. */
  const volcar = useCallback((): void => {
    fotograma.current = 0
    const caja = panel.current
    if (caja !== null && pendiente.current !== null) escribirTamano(caja, pendiente.current)
  }, [panel])

  const alBajar = (evento: EventoPuntero<HTMLButtonElement>): void => {
    const caja = panel.current
    // Solo el botón principal: con el secundario el navegador abre su menú y el `pointerup` no llega.
    if (evento.button !== 0 || caja === null) return
    // Sin esto el gesto arranca una selección de texto.
    evento.preventDefault()
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrastre.current = { x: evento.clientX, y: evento.clientY, ancho: caja.offsetWidth, alto: caja.offsetHeight }
  }

  const alMover = (evento: EventoPuntero<HTMLButtonElement>): void => {
    const inicio = arrastre.current
    if (inicio === null) return
    pendiente.current = acotarTamanoChat({
      ancho: inicio.ancho + (inicio.x - evento.clientX),
      alto: inicio.alto + (inicio.y - evento.clientY)
    }, ventana)
    if (fotograma.current === 0) fotograma.current = requestAnimationFrame(volcar)
  }

  const alTerminar = (evento: EventoPuntero<HTMLButtonElement>): void => {
    if (arrastre.current === null) return
    arrastre.current = null
    cancelAnimationFrame(fotograma.current)
    volcar()
    const final = pendiente.current
    pendiente.current = null
    if (final !== null) {
      // Se guarda al soltar y no en cada movimiento: `localStorage` escribe síncrono.
      setTamano(final)
      guardarTamanoChat(almacenamientoDelNavegador(), final)
    }
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) evento.currentTarget.releasePointerCapture(evento.pointerId)
  }

  const alTeclado = (evento: EventoTeclado<HTMLButtonElement>): void => {
    // Arriba e izquierda agrandan: la misma regla que con el ratón.
    const pasos: Record<string, TamanoChat> = {
      ArrowLeft: { ancho: PASO_TAMANO_CHAT, alto: 0 },
      ArrowRight: { ancho: -PASO_TAMANO_CHAT, alto: 0 },
      ArrowUp: { ancho: 0, alto: PASO_TAMANO_CHAT },
      ArrowDown: { ancho: 0, alto: -PASO_TAMANO_CHAT }
    }
    const paso = pasos[evento.key]
    if (paso === undefined) return
    // Las flechas harían scroll de la página de atrás, que sigue viva porque el panel no es modal.
    evento.preventDefault()
    const aplicado = acotarTamanoChat({ ancho: tamanoVisible.ancho + paso.ancho, alto: tamanoVisible.alto + paso.alto }, ventana)
    setTamano(aplicado)
    guardarTamanoChat(almacenamientoDelNavegador(), aplicado)
  }

  return {
    tamanoVisible,
    propsTirador: { onPointerDown: alBajar, onPointerMove: alMover, onPointerUp: alTerminar, onPointerCancel: alTerminar, onKeyDown: alTeclado }
  }
}
