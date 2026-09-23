'use client'

import { useCallback, useRef, useState } from 'react'
import { hasta } from '@/lib/breakpoints'
import { bandaElastica, cierraLaHoja, curvaDeResorte } from '@/lib/resorte'
import { MENOS_MOVIMIENTO, cumpleConsulta } from '@/lib/useConsultaDeMedios'

/** Muestras del puntero que se guardan para medir la velocidad al soltar. */
const HISTORIAL = 5
/** Solo cuentan las muestras de los últimos milisegundos: un dedo que se detuvo no lanza nada. */
const VENTANA_MS = 100
/** El resorte de vuelta: rebote leve, como una hoja de iOS (amortiguación 0.8, respuesta 0.3). */
const VUELTA = curvaDeResorte(0.8, 0.3)

interface Muestra { y: number, t: number }

/**
 * Deja cerrar una hoja inferior arrastrándola hacia abajo, con resorte si no llega a cerrarse.
 *
 * El gesto se toma desde la cabecera de la hoja (y desde su asa): el cuerpo es una lista con scroll
 * propio, y disputarle el dedo terminaría con un cajón que se cierra cuando se quería bajar.
 *
 * Se mueve con la propiedad `translate` y no con `transform`: la entrada de la hoja es una animación
 * CSS con `fill-mode: both` sobre `transform`, que sigue aplicándose después de terminar y le
 * ganaría a cualquier estilo en línea. `translate` se compone aparte y no compite con ella.
 *
 * Solo por debajo de `sm`, donde el cajón es hoja inferior; desde `sm` es un panel lateral.
 *
 * @param cerrar cierra el cajón (el `onOpenChange(false)` de Radix)
 * @returns el manejador de `pointerdown` de la hoja, si el último cierre fue por gesto —en ese caso
 *   la animación de salida de Radix sobra: la hoja ya está abajo— y cómo reiniciar al reabrir
 */
export function useGestoDeHoja (cerrar: () => void) {
  const hoja = useRef<HTMLElement | null>(null)
  const [cerradaPorGesto, setCerradaPorGesto] = useState(false)

  const alPresionar = useCallback((evento: React.PointerEvent<HTMLElement>) => {
    // Se engancha en el `onPointerDown` de la hoja misma, así que la hoja es `currentTarget`: no
    // hace falta que el contenido del cajón exponga una referencia.
    const elemento = evento.currentTarget
    const objetivo = evento.target
    if (evento.button !== 0 || !cumpleConsulta(hasta('sm'))) return
    if (!(objetivo instanceof Element) || objetivo.closest('header, [data-asa-hoja]') === null) return
    // Un botón de la cabecera (cerrar) sigue siendo un botón.
    if (objetivo.closest('button, a, input') !== null) return

    hoja.current = elemento
    const inicio = evento.clientY
    const altura = elemento.getBoundingClientRect().height
    const muestras: Muestra[] = [{ y: inicio, t: evento.timeStamp }]
    // Interrumpible: si la hoja todavía está volviendo de un tirón anterior, se la toma desde
    // donde se la ve, no desde donde iba a terminar.
    const base = translateVisible(elemento)
    let desplazamiento = base
    for (const animacion of elemento.getAnimations()) {
      if (animacion.id === 'gesto-hoja') animacion.cancel()
    }
    elemento.style.translate = `0 ${base}px`
    elemento.setPointerCapture(evento.pointerId)

    const mover = (movimiento: PointerEvent) => {
      const delta = movimiento.clientY - inicio + base
      // Hacia abajo sigue al dedo 1:1; hacia arriba no hay adónde ir, y resiste como una goma.
      desplazamiento = delta >= 0 ? delta : bandaElastica(delta, altura)
      elemento.style.translate = `0 ${desplazamiento}px`
      muestras.push({ y: movimiento.clientY, t: movimiento.timeStamp })
      if (muestras.length > HISTORIAL) muestras.shift()
    }

    const soltar = () => {
      elemento.removeEventListener('pointermove', mover)
      elemento.removeEventListener('pointerup', soltar)
      elemento.removeEventListener('pointercancel', soltar)
      const velocidad = velocidadFinal(muestras)

      if (cierraLaHoja(desplazamiento, velocidad, altura)) {
        setCerradaPorGesto(true)
        animar(elemento, desplazamiento, altura, 'cubic-bezier(.2, 0, 0, 1)', 180, () => {
          cerrar()
        })
        return
      }
      animar(elemento, desplazamiento, 0, VUELTA.curva, VUELTA.duracionMs, () => {
        elemento.style.translate = ''
      })
    }

    elemento.addEventListener('pointermove', mover)
    elemento.addEventListener('pointerup', soltar)
    elemento.addEventListener('pointercancel', soltar)
  }, [cerrar])

  /** Al volver a abrir, la próxima salida vuelve a ser la animada. */
  const reiniciar = useCallback(() => {
    setCerradaPorGesto(false)
    if (hoja.current !== null) hoja.current.style.translate = ''
  }, [])

  return { alPresionar, cerradaPorGesto, reiniciar }
}

/**
 * Velocidad vertical al soltar, en píxeles por milisegundo, sobre las muestras recientes.
 *
 * @param muestras historial del puntero, de la más vieja a la más nueva
 * @returns la velocidad; 0 si no hay suficiente historia reciente
 */
function velocidadFinal (muestras: Muestra[]): number {
  const ultima = muestras[muestras.length - 1]
  const primera = muestras.find((m) => ultima !== undefined && ultima.t - m.t <= VENTANA_MS)
  if (ultima === undefined || primera === undefined || ultima.t === primera.t) return 0
  return (ultima.y - primera.y) / (ultima.t - primera.t)
}

/**
 * Lleva la hoja de una posición a otra y deja el valor final puesto.
 *
 * Con menos movimiento no hay viaje: se salta directo al final.
 */
function animar (elemento: HTMLElement, desde: number, destino: number, curva: string, duracion: number, alTerminar: () => void): void {
  elemento.style.translate = `0 ${destino}px`
  if (cumpleConsulta(MENOS_MOVIMIENTO) || typeof elemento.animate !== 'function') {
    alTerminar()
    return
  }
  const animacion = elemento.animate(
    [{ translate: `0 ${desde}px` }, { translate: `0 ${destino}px` }],
    { duration: duracion, easing: soportaLinear() ? curva : 'cubic-bezier(.2, .8, .2, 1)', id: 'gesto-hoja' }
  )
  // Cancelada = otro gesto la tomó en el aire; ese gesto ya dejó puesta su propia posición.
  animacion.onfinish = alTerminar
}

/** El desplazamiento vertical que se está pintando ahora, animación incluida. */
function translateVisible (elemento: HTMLElement): number {
  const partes = getComputedStyle(elemento).translate.split(' ')
  const y = Number.parseFloat(partes[1] ?? '0')
  return Number.isFinite(y) ? y : 0
}

/** `linear()` con puntos es de 2023; un navegador sin él recibe una curva de reemplazo. */
function soportaLinear (): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)')
}
