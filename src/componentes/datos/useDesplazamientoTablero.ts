'use client'

import { useEffect, useRef, useState } from 'react'
import { velocidadDeArrastre } from './desplazamientoTablero'

/**
 * Mantiene navegación horizontal y desplaza el tablero durante un arrastre local.
 * @param arrastrando si una tarjeta o columna de este tablero está siendo arrastrada
 * @param columnas cantidad de columnas que se observarán al cambiar el tablero
 * @returns referencia del contenedor, límites de navegación y acción de desplazamiento
 */
export function useDesplazamientoTablero (arrastrando: boolean, columnas: number) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [limites, setLimites] = useState({ izquierda: false, derecha: false })

  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return
    const actualizar = () => {
      const izquierda = elemento.scrollLeft > 1
      const derecha = elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 1
      setLimites((anterior) => anterior.izquierda === izquierda && anterior.derecha === derecha ? anterior : { izquierda, derecha })
    }
    const observador = new ResizeObserver(actualizar)
    observador.observe(elemento)
    for (const hijo of elemento.children) observador.observe(hijo)
    elemento.addEventListener('scroll', actualizar, { passive: true })
    actualizar()
    return () => {
      observador.disconnect()
      elemento.removeEventListener('scroll', actualizar)
    }
  }, [columnas])

  useEffect(() => {
    const elemento = contenedor.current
    if (!arrastrando || !elemento) return
    let velocidad = 0
    let cuadro = 0
    let anterior = 0
    const detener = () => { velocidad = 0 }
    const seguir = (evento: DragEvent) => {
      const rect = elemento.getBoundingClientRect()
      const dentro = evento.clientY >= Math.max(0, rect.top) && evento.clientY <= Math.min(window.innerHeight, rect.bottom)
      velocidad = dentro ? velocidadDeArrastre(evento.clientX, Math.max(0, rect.left), Math.min(window.innerWidth, rect.right)) : 0
    }
    const avanzar = (ahora: number) => {
      if (anterior !== 0 && velocidad !== 0) elemento.scrollLeft += velocidad * Math.min(ahora - anterior, 32) / 1000
      anterior = ahora
      cuadro = requestAnimationFrame(avanzar)
    }
    const salir = (evento: DragEvent) => { if (evento.relatedTarget === null) detener() }
    document.addEventListener('dragover', seguir)
    document.addEventListener('dragleave', salir)
    document.addEventListener('drop', detener, true)
    document.addEventListener('dragend', detener, true)
    window.addEventListener('blur', detener)
    cuadro = requestAnimationFrame(avanzar)
    return () => {
      cancelAnimationFrame(cuadro)
      document.removeEventListener('dragover', seguir)
      document.removeEventListener('dragleave', salir)
      document.removeEventListener('drop', detener, true)
      document.removeEventListener('dragend', detener, true)
      window.removeEventListener('blur', detener)
    }
  }, [arrastrando])

  /** Desplaza una pantalla conservando una parte de la columna anterior como referencia. */
  function desplazar (direccion: -1 | 1): void {
    const elemento = contenedor.current
    if (!elemento) return
    elemento.scrollBy({ left: direccion * elemento.clientWidth * 0.8, behavior: 'instant' })
  }

  return { contenedor, limites, desplazar }
}
