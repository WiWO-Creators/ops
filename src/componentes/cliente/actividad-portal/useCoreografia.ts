'use client'

import { useLayoutEffect, type RefObject } from 'react'
import { createTimeline, stagger } from 'animejs'
import { formatearDuracion } from '@/dominio/actividad-portal'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/**
 * Como se escribe el numero de un contador mientras sube. `duracion` es la de `formatearDuracion`.
 */
type FormatoDeContador = 'entero' | 'duracion'

function escribir (elemento: HTMLElement, valor: number, formato: FormatoDeContador): void {
  elemento.textContent = formato === 'duracion'
    ? formatearDuracion(valor)
    : new Intl.NumberFormat('es-CL').format(Math.round(valor))
}

/**
 * La entrada del tablero de actividad, en cuatro tiempos que cuentan la lectura de arriba abajo:
 * primero las cifras suben hasta su valor, despues las columnas del ritmo diario crecen de izquierda
 * a derecha, despues las barras de lo mas y lo menos visto se estiran, y por ultimo entran las filas.
 *
 * El marcado ya es el estado final: sin JavaScript, o con `prefers-reduced-motion`, se ve completo y
 * quieto. Cuando si anima, corre en `useLayoutEffect` para esconder antes del primer pintado y no
 * dejar pasar un fotograma del tablero terminado. Solo anima `transform` y `opacity`.
 *
 * Marcas que busca dentro de `raiz`:
 *   - `data-contar="N"` y `data-formato="entero|duracion"`: cifra que sube hasta N;
 *   - `data-linea`: linea de tiempo que se dibuja de arriba hacia abajo;
 *   - `data-columna`: columna que crece desde la base;
 *   - `data-barra`: barra que se estira desde la izquierda;
 *   - `data-entrada="item"`: fila que entra.
 *
 * @param raiz contenedor del tablero
 * @param clave cambia cuando llegan datos nuevos; con `null` no hay nada que animar todavia
 */
export function useCoreografia (raiz: RefObject<HTMLElement | null>, clave: string | null): void {
  useLayoutEffect(() => {
    const contenedor = raiz.current

    if (contenedor === null || clave === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const contadores = Array.from(contenedor.querySelectorAll<HTMLElement>('[data-contar]'))
    const lineas = contenedor.querySelectorAll('[data-linea]')
    const columnas = contenedor.querySelectorAll('[data-columna]')
    const barras = contenedor.querySelectorAll('[data-barra]')
    const filas = contenedor.querySelectorAll('[data-entrada="item"]')
    const linea = createTimeline({ defaults: { ease: 'outQuad' } })

    contadores.forEach((elemento, i) => {
      const meta = Number(elemento.dataset.contar)
      const formato: FormatoDeContador = elemento.dataset.formato === 'duracion' ? 'duracion' : 'entero'
      const estado = { valor: 0 }

      if (!Number.isFinite(meta)) return

      escribir(elemento, 0, formato)
      linea.add(estado, {
        valor: meta,
        duration: 900,
        ease: 'outExpo',
        onUpdate: () => { escribir(elemento, estado.valor, formato) },
        onComplete: () => { escribir(elemento, meta, formato) }
      }, i * 70)
    })

    if (lineas.length > 0) {
      linea.add(lineas, { scaleY: [0, 1], duration: 700, ease: 'inOutQuad' }, 120)
    }

    if (columnas.length > 0) {
      linea.add(columnas, {
        scaleY: [0, 1],
        opacity: [0.2, 1],
        duration: 520,
        ease: 'outBack',
        delay: stagger(Math.max(6, Math.round(420 / columnas.length)))
      }, 240)
    }

    if (barras.length > 0) {
      linea.add(barras, {
        scaleX: [0, 1],
        duration: 560,
        ease: 'outQuart',
        delay: stagger(36)
      }, 520)
    }

    if (filas.length > 0) {
      linea.add(filas, {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 340,
        delay: stagger(40)
      }, 700)
    }

    return () => {
      linea.revert()

      for (const elemento of contadores) {
        const meta = Number(elemento.dataset.contar)

        if (Number.isFinite(meta)) escribir(elemento, meta, elemento.dataset.formato === 'duracion' ? 'duracion' : 'entero')
      }
    }
  }, [raiz, clave])
}
