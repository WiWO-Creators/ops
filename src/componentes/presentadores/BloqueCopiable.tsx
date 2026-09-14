'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
 * tiene por qué entender y sí tiene que poder pegar en un reporte sin transcribir nada.
 *
 * `navigator.clipboard` no existe fuera de un contexto seguro y puede negarse aunque exista, así que
 * el fallo se traga y el botón simplemente no confirma —mismo criterio que `CodigoCopiable`—. El
 * texto queda seleccionable de todos modos, que es la salida de siempre.
 */
export function BloqueCopiable ({ titulo, texto, className }: PropsBloqueCopiable) {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<number | undefined>(undefined)

  // Sin este cierre, el temporizador sobrevive al desmontaje y escribe estado sobre un componente
  // que ya no existe.
  useEffect(() => () => { window.clearTimeout(temporizador.current) }, [])

  const copiar = useCallback(() => {
    navigator.clipboard?.writeText(texto)
      .then(() => {
        setCopiado(true)
        window.clearTimeout(temporizador.current)
        temporizador.current = window.setTimeout(() => { setCopiado(false) }, 1500)
      })
      .catch(() => { setCopiado(false) })
  }, [texto])

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
