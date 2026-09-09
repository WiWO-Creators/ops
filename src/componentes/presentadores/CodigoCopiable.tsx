'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/clases'

interface PropsCodigoCopiable {
  /** El codigo tal como se muestra y se copia (`ACM-001`, `#123`). */
  valor: string
  className?: string
}

/**
 * Un identificador corto que se ve y se copia de un clic.
 *
 * Existe porque el codigo de un Espacio o de un Proceso se dicta por telefono y se pega en un
 * correo: leerlo de la pantalla y transcribirlo a mano es donde aparecen los digitos cambiados.
 *
 * `navigator.clipboard` no existe fuera de un contexto seguro y puede negarse aunque exista, asi
 * que el fallo se traga y el boton simplemente no confirma —mismo criterio que
 * `EstadoSolo.copiarEnlace()`. El codigo sigue visible y se puede copiar a mano; anunciar un error
 * de portapapeles no le sirve a nadie.
 */
export function CodigoCopiable ({ valor, className }: PropsCodigoCopiable) {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<number | undefined>(undefined)

  // Sin este cierre, el temporizador sobrevive al desmontaje y escribe estado sobre un componente
  // que ya no existe.
  useEffect(() => () => { window.clearTimeout(temporizador.current) }, [])

  const copiar = useCallback(() => {
    navigator.clipboard.writeText(valor)
      .then(() => {
        setCopiado(true)
        window.clearTimeout(temporizador.current)
        temporizador.current = window.setTimeout(() => { setCopiado(false) }, 1500)
      })
      .catch(() => { setCopiado(false) })
  }, [valor])

  return (
    <button
      type="button"
      onClick={copiar}
      title={copiado ? 'Copiado' : `Copiar ${valor}`}
      className={cn(
        'text-texto-tenue hover:text-texto hover:bg-superficie w-fit rounded px-1.5 py-0.5',
        'font-mono text-xs transition-colors',
        className
      )}
    >
      <span data-numerico>{valor}</span>
      <span role="status" className="sr-only">{copiado ? 'Copiado' : ''}</span>
    </button>
  )
}
