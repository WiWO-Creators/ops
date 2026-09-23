'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/clases'
import {
  conFiltroDeVencimiento, ETIQUETAS_DE_VENCIMIENTO, FILTROS_DE_VENCIMIENTO, filtroDeVencimiento
} from '@/dominio/mis-tareas'

/**
 * Hoy / Vencidas / Esta semana / Todas, arriba de las dos listas de la hoja.
 *
 * El estado vive en la URL (`?vence=`), como el de "Ver completadas": sobrevive al refresco, se
 * comparte con un enlace y el boton "Atras" no tiene que deshacerlo filtro por filtro (`replace`).
 *
 * Es un grupo de botones con `aria-pressed` y no pestañas: no cambia de panel, acota las mismas dos
 * listas. La pastilla del filtro activo se desliza de un boton al otro —medida despues de pintar,
 * con `transform`—, que es lo que hace que el cambio se lea como "lo mismo, recortado distinto" y no
 * como otra pantalla.
 *
 * @returns el grupo de filtros
 */
export function FiltrosDeVencimiento () {
  const router = useRouter()
  const params = useSearchParams()
  const vigente = filtroDeVencimiento(params)
  const grupo = useRef<HTMLDivElement>(null)
  const pastilla = useRef<HTMLSpanElement>(null)

  // Se escribe el estilo de la pastilla y no un estado: es el DOM el que sigue al boton activo.
  useLayoutEffect(() => {
    const boton = grupo.current?.querySelector<HTMLElement>(`[data-filtro="${vigente}"]`)
    if (boton === null || boton === undefined || pastilla.current === null) return
    pastilla.current.style.transform = `translateX(${boton.offsetLeft}px)`
    pastilla.current.style.width = `${boton.offsetWidth}px`
    pastilla.current.style.opacity = '1'
  }, [vigente])

  return (
    <div
      ref={grupo}
      role="group"
      aria-label="Filtrar por vencimiento"
      className="border-linea bg-superficie-hundida rounded-control relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto border p-0.5"
    >
      <span
        ref={pastilla}
        aria-hidden="true"
        className="bg-superficie-elevada shadow-1 rounded-chico pointer-events-none absolute inset-y-0.5 left-0 opacity-0 transition-[transform,width] duration-200 ease-neo"
      />
      {FILTROS_DE_VENCIMIENTO.map((filtro) => (
        <button
          key={filtro}
          type="button"
          data-filtro={filtro}
          aria-pressed={filtro === vigente}
          onClick={() => {
            const siguientes = conFiltroDeVencimiento(new URLSearchParams(params.toString()), filtro)
            const texto = siguientes.toString()
            router.replace(texto === '' ? '?' : `?${texto}`, { scroll: false })
          }}
          className={cn(
            'rounded-chico relative h-8 shrink-0 px-3 text-sm transition-colors duration-150',
            filtro === vigente ? 'text-texto font-semibold' : 'text-texto-tenue hover:text-texto'
          )}
        >
          {ETIQUETAS_DE_VENCIMIENTO[filtro]}
        </button>
      ))}
    </div>
  )
}
