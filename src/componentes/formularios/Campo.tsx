import { useId } from 'react'
import { cn } from '@/lib/clases'

interface PropsCampo {
  etiqueta: string
  /** Texto de ayuda bajo el control. Se oculta cuando hay error, para no competir con él. */
  ayuda?: string
  error?: string
  requerido?: boolean
  /** Recibe los identificadores ya cableados: el control no tiene que armarlos a mano. */
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': boolean | undefined
    'aria-required': boolean | undefined
  }) => React.ReactNode
  className?: string
}

/**
 * Envoltorio de un control de formulario: etiqueta, ayuda y error.
 *
 * Usa una función como hijo en vez de clonar el elemento: clonar obliga a adivinar qué props acepta
 * el control, y falla en silencio con cualquier componente que no las reenvíe. Así el cableado de
 * accesibilidad es explícito y el compilador lo verifica.
 *
 * El error se anuncia con `role="alert"`, así un lector de pantalla lo lee al aparecer sin que la
 * persona tenga que volver al campo.
 */
export function Campo ({ etiqueta, ayuda, error, requerido, children, className }: PropsCampo) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-texto text-sm font-medium">
        {etiqueta}
        {requerido === true && (
          <>
            <span aria-hidden="true" className="text-texto-peligro ml-0.5">*</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </label>

      {children({
        id,
        'aria-describedby': error !== undefined ? idError : ayuda !== undefined ? idAyuda : undefined,
        'aria-invalid': error !== undefined ? true : undefined,
        'aria-required': requerido === true ? true : undefined
      })}

      {error !== undefined
        ? (
          <p id={idError} role="alert" className="text-texto-peligro text-xs">
            {error}
          </p>
          )
        : ayuda !== undefined && (
          <p id={idAyuda} className="text-texto-sutil text-xs">
            {ayuda}
          </p>
        )}
    </div>
  )
}
