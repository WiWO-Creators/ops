'use client'

import { useCopiarAlPortapapeles } from '@/componentes/datos/BotonCopiar'
import { cn } from '@/lib/clases'

interface PropsBloqueCopiable {
  /** Encabezado corto que dice para qué sirve lo que hay abajo. */
  titulo: string
  /** El texto tal como se muestra y se copia. Los saltos de línea se respetan. */
  texto: string
  className?: string
}

/**
 * Un bloque de texto técnico que se lee, se selecciona y se copia entero de un clic.
 *
 * Hermano de `CodigoCopiable`, y aparte de él por la forma de lo que muestra: aquel es un
 * identificador de una línea que vive dentro de una frase; este son varias líneas que la persona no
 * tiene por qué entender y sí tiene que poder pegar en un reporte sin transcribir nada. Los dos usan
 * el mismo `useCopiarAlPortapapeles` —misma duración, mismo aviso de error— sin dibujar el `Boton`
 * entero de `BotonCopiar`.
 */
export function BloqueCopiable ({ titulo, texto, className }: PropsBloqueCopiable) {
  const { copiado, copiar } = useCopiarAlPortapapeles(texto)

  return (
    <div className={cn('border-linea rounded-tarjeta bg-superficie flex flex-col gap-2 border p-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-texto-tenue text-xs font-semibold">{titulo}</p>
        <button
          type="button"
          onClick={copiar}
          className="text-acento text-xs font-semibold underline underline-offset-4"
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="text-texto-tenue max-h-64 overflow-auto text-left font-mono text-xs whitespace-pre-wrap">
        {texto}
      </pre>
      <span role="status" className="sr-only">{copiado ? 'Copiado' : ''}</span>
    </div>
  )
}
