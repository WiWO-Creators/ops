import { useState } from 'react'
import type { BorradorAlta } from './modelo'

/** Cambia un campo del borrador. */
export type CambiarCampo = <K extends keyof BorradorAlta>(campo: K, valor: BorradorAlta[K]) => void

/** El borrador del alta y las formas de modificarlo. */
export interface EstadoDelBorrador {
  borrador: BorradorAlta
  cambiar: CambiarCampo
  /** Cambia varios campos a la vez y deja el resto como estaba. */
  cambiarVarios: (parcial: Partial<BorradorAlta>) => void
  /** Deriva el borrador nuevo del último, para cambios que dependen de lo que ya hay. */
  actualizar: (derivar: (actual: BorradorAlta) => BorradorAlta) => void
  /** Reemplaza el borrador entero. */
  restablecer: (nuevo: BorradorAlta) => void
}

/**
 * Guarda todo lo que la persona escribe o elige en el alta, en un solo estado.
 *
 * Cada cambio se aplica sobre el último borrador y no sobre el del render: un mismo evento cambia
 * varios campos seguidos (volcar una interpretación, elegir un Espacio) y ninguno puede pisar al
 * anterior.
 *
 * @param inicial el borrador con que arranca el alta
 * @returns el borrador y sus modificadores
 */
export function useBorradorAlta (inicial: () => BorradorAlta): EstadoDelBorrador {
  const [borrador, setBorrador] = useState<BorradorAlta>(inicial)

  const cambiar: CambiarCampo = (campo, valor) => {
    setBorrador((actual) => ({ ...actual, [campo]: valor }))
  }

  return {
    borrador,
    cambiar,
    cambiarVarios: (parcial) => { setBorrador((actual) => ({ ...actual, ...parcial })) },
    actualizar: setBorrador,
    restablecer: setBorrador
  }
}
