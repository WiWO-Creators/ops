'use client'

import { useCopiarAlPortapapeles } from '@/componentes/datos/BotonCopiar'
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
 * Hermano de `BotonCopiar`, y aparte de el por la forma: aquel es un boton del sistema con icono;
 * este es un identificador inline que vive dentro de una frase, asi que usa el mismo
 * `useCopiarAlPortapapeles` —misma duracion, mismo aviso de error— sin dibujar el boton entero.
 */
export function CodigoCopiable ({ valor, className }: PropsCodigoCopiable) {
  const { copiado, copiar } = useCopiarAlPortapapeles(valor)

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
