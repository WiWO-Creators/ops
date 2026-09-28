'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Check, Copy } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'

/** Cuanto dura el estado "Copiado" antes de volver al texto normal. Igual en todo el producto. */
const DURACION_COPIADO_MS = 2000

/** Aviso por defecto cuando el portapapeles se niega. */
const MENSAJE_ERROR_POR_DEFECTO = 'No se pudo copiar. Selecciona el texto y cópialo a mano.'

export interface EstadoCopiar {
  copiado: boolean
  copiar: () => void
}

/**
 * El estado y la mecanica de "copiar al portapapeles", sin el boton.
 *
 * Separado de `BotonCopiar` para los pocos lugares que no dibujan un `Boton` del sistema —un
 * identificador inline dentro de una frase, un link subrayado en una tarjeta— pero igual necesitan la
 * misma duracion, el mismo aviso de error y el mismo cuidado con el temporizador al desmontar.
 *
 * `navigator.clipboard` no existe fuera de un contexto seguro y puede negarse aunque exista: ese
 * fallo ya no se traga en silencio, se avisa por el toast comun, igual que cualquier otra accion que
 * falla.
 *
 * @param valor lo que se copia. Funcion cuando depende del momento del clic (ej. `window.location.href`,
 *   que cambia) o cuando puede no existir todavia (`null`, y entonces el clic no hace nada).
 * @param mensajeError texto del toast si el portapapeles se niega
 * @returns `copiado` (para el texto/icono de quien llama) y `copiar` (el manejador del clic)
 */
export function useCopiarAlPortapapeles (
  valor: string | (() => string | null),
  mensajeError: string = MENSAJE_ERROR_POR_DEFECTO
): EstadoCopiar {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<number | undefined>(undefined)
  const aviso = useAviso()

  // Sin este cierre, el temporizador sobrevive al desmontaje y escribe estado sobre un componente
  // que ya no existe.
  useEffect(() => () => { window.clearTimeout(temporizador.current) }, [])

  const copiar = useCallback(() => {
    const texto = typeof valor === 'function' ? valor() : valor

    if (texto === null || texto === '') return

    navigator.clipboard?.writeText(texto)
      .then(() => {
        setCopiado(true)
        window.clearTimeout(temporizador.current)
        temporizador.current = window.setTimeout(() => { setCopiado(false) }, DURACION_COPIADO_MS)
      })
      .catch(() => { aviso.error(mensajeError) })
  }, [valor, mensajeError, aviso])

  return { copiado, copiar }
}

export interface PropsBotonCopiar {
  /** Lo que se copia. Funcion cuando depende del momento del clic o puede no existir todavia. */
  valor: string | (() => string | null)
  /** Texto mientras no se copio. Por defecto, "Copiar". */
  etiqueta?: string
  /** Texto una vez copiado. Por defecto, "Copiado". */
  etiquetaCopiado?: string
  /** Texto del toast si el portapapeles se niega. */
  mensajeError?: string
  variante?: 'secundario' | 'sutil'
  tamano?: 'chico' | 'medio'
  className?: string
}

/**
 * Boton "Copiar → Copiado" del sistema: mismo icono, mismo texto de respaldo y misma duracion en
 * toda la aplicacion.
 *
 * El icono cambia de `Copy` a `Check` y el texto lo acompaña; un `status` sin contenido visible en la
 * version sin copiar anuncia el cambio a quien usa lector de pantalla, porque el cambio de icono solo
 * no dice nada por si mismo.
 *
 * @param valor lo que se copia
 * @param etiqueta texto antes de copiar
 * @param etiquetaCopiado texto despues de copiar
 * @param mensajeError texto del toast si el portapapeles se niega
 * @param variante variante del boton del sistema
 * @param tamano tamano del boton del sistema
 * @returns el boton, con su propio estado de "copiado"
 */
export function BotonCopiar ({
  valor,
  etiqueta = 'Copiar',
  etiquetaCopiado = 'Copiado',
  mensajeError,
  variante = 'secundario',
  tamano = 'chico',
  className
}: PropsBotonCopiar): ReactElement {
  const { copiado, copiar } = useCopiarAlPortapapeles(valor, mensajeError)

  return (
    <Boton variante={variante} tamano={tamano} onClick={copiar} className={className}>
      {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copiado ? etiquetaCopiado : etiqueta}
      <span role="status" className="sr-only">{copiado ? etiquetaCopiado : ''}</span>
    </Boton>
  )
}
