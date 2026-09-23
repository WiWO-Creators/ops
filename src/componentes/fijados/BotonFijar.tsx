'use client'

import './fijados.css'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/clases'
import { alternarFijado, useFijados } from './almacen'
import { estaFijado, type ElementoPersonal } from './fijados'

/**
 * La estrella de la cabecera de una ficha: fija el Proyecto o el Cliente en el menu, o lo quita.
 *
 * Es un interruptor (`aria-pressed`) y no dos botones: el estado se lee en la misma forma, llena o
 * vacia, y el nombre accesible dice que va a pasar al tocarla. La lista se actualiza antes de que
 * conteste la API (ver `alternarFijado`), asi que el menu recibe la fila en el mismo toque.
 *
 * @param elemento lo que se fija, con el nombre con que aparecera en el menu
 * @returns el boton
 */
export function BotonFijar ({ elemento, className }: { elemento: ElementoPersonal, className?: string }) {
  const fijados = useFijados()
  const fijado = estaFijado(fijados, elemento.type, elemento.id)
  const [recien, setRecien] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const que = elemento.type === 'project' ? 'proyecto' : 'cliente'

  /** Alterna y dispara la animacion solo al fijar: quitar no celebra. */
  async function alternar (): Promise<void> {
    if (ocupado) return
    setRecien(!fijado)
    setOcupado(true)
    try {
      await alternarFijado(elemento)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <button
      type="button"
      aria-pressed={fijado}
      aria-label={fijado ? `Quitar este ${que} de fijados` : `Fijar este ${que} en el menú`}
      title={fijado ? 'Quitar de fijados' : 'Fijar en el menú'}
      onClick={() => { void alternar() }}
      onAnimationEnd={() => setRecien(false)}
      data-recien-fijado={recien}
      className={cn(
        'boton-fijar rounded-control inline-flex size-9 shrink-0 items-center justify-center transition-colors duration-150',
        fijado ? 'text-acento hover:bg-acento/10' : 'text-texto-tenue hover:bg-hover hover:text-texto',
        className
      )}
    >
      <Star
        size={18}
        strokeWidth={2}
        aria-hidden="true"
        className={cn('boton-fijar-estrella transition-[fill] duration-150', fijado ? 'fill-current' : 'fill-transparent')}
      />
    </button>
  )
}
