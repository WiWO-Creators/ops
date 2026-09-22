'use client'

import { cn } from '@/lib/clases'

/**
 * El control de dos estados.
 *
 * Es un `<button role="switch">` y no una casilla porque no propone un valor a guardar después: lo
 * que hace es pedir el cambio, y quien lo recibe decide si lo confirma antes de escribirlo. Por eso
 * `aria-checked` muestra siempre el estado GUARDADO —no el que se está por elegir— y el componente
 * no guarda estado propio: en Interruptores hay un diálogo en el medio y en Personas se escribe al
 * toque, y las dos pantallas pintan lo mismo. En los adjuntos se escribe al toque, con el valor
 * nuevo pintado mientras se confirma.
 */
export function Interruptor ({
  encendido, etiqueta, deshabilitado, onPulsar
}: {
  encendido: boolean
  etiqueta: string
  deshabilitado: boolean
  onPulsar: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onPulsar}
      className={cn(
        'rounded-control relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors duration-150',
        'disabled:cursor-not-allowed',
        encendido ? 'bg-acento border-acento' : 'bg-control border-control-borde'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-control size-4 transition-transform duration-150',
          encendido ? 'bg-acento-contenido translate-x-6' : 'bg-texto-tenue translate-x-1'
        )}
      />
    </button>
  )
}
