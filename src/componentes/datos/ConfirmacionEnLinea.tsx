'use client'

import { type KeyboardEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { cn } from '@/lib/clases'

export interface PropsConfirmacionEnLinea {
  /** Que implica confirmar, dicho antes del par de botones. Sin esto cuando el boton ya lo dice todo. */
  advertencia?: string
  /** Texto del boton que confirma. Por defecto, "Confirmar". */
  etiquetaConfirmar?: string
  /** Texto del boton que cancela. Por defecto, "Cancelar". */
  etiquetaCancelar?: string
  onConfirmar: () => void
  onCancelar: () => void
  /**
   * Variante del boton de confirmar. Por defecto, `peligro`: la mayoria de estas confirmaciones son
   * un borrado o algo que no tiene vuelta atras. `primario` y `secundario` son para lo que confirma
   * sin destruir nada (ej. cerrar un ticket que se puede reabrir, o detener un cronometro).
   */
  varianteConfirmar?: 'peligro' | 'primario' | 'secundario'
  /** Deshabilita los dos botones; el de confirmar ademas muestra su spinner. */
  cargando?: boolean
  /** Error del ultimo intento fallido, mostrado con `AvisoEnLinea`. Solo aplica a la disposicion `bloque`. */
  error?: string | null
  tamano?: 'chico' | 'medio'
  /**
   * `bloque`: la advertencia arriba y los botones abajo a la derecha, para el pie de una ficha o un
   * paso de un modal. `linea`: todo en una sola fila, para vivir dentro de una fila de tabla o lista.
   */
  disposicion?: 'bloque' | 'linea'
  className?: string
}

/**
 * Confirmacion de dos clics para vivir dentro de un modal ya abierto o de una fila, donde anidar
 * `ConfirmarBorrado` encima de otro dialogo deja los dos peleando por el foco.
 *
 * Reemplaza el "confirmando" a mano que se repetia por pantalla —cada uno con su propio par de
 * botones, su propio orden y su propio texto—. El estado de "esta confirmando" sigue siendo de quien
 * la usa (`useState<boolean>` o una key por fila cuando hay muchas filas a la vez): este componente
 * solo dibuja el paso una vez que ya esta activo, igual que `ConfirmarBorrado` dibuja el dialogo una
 * vez que `abierto` es `true`.
 *
 * Accesible: el boton de confirmar recibe el foco al aparecer, y Escape cancela sin propagar la tecla
 * al dialogo que lo contiene.
 *
 * @param advertencia que se lleva por delante la confirmacion, antes de los botones
 * @param etiquetaConfirmar texto del boton que confirma
 * @param etiquetaCancelar texto del boton que cancela
 * @param onConfirmar dispara la accion; quien llama decide si limpia el estado de "confirmando" al terminar
 * @param onCancelar vuelve al estado sin confirmar
 * @param cargando desactiva los botones mientras la accion esta en curso
 * @param error mensaje del ultimo intento fallido
 * @param disposicion `bloque` (por defecto) o `linea`
 * @returns el par de botones, y la advertencia si viene
 */
export function ConfirmacionEnLinea ({
  advertencia,
  etiquetaConfirmar = 'Confirmar',
  etiquetaCancelar = 'Cancelar',
  onConfirmar,
  onCancelar,
  varianteConfirmar = 'peligro',
  cargando = false,
  error = null,
  tamano = 'chico',
  disposicion = 'bloque',
  className
}: PropsConfirmacionEnLinea): ReactElement {
  function alTecla (evento: KeyboardEvent): void {
    if (evento.key === 'Escape' && !cargando) {
      evento.stopPropagation()
      onCancelar()
    }
  }

  const botones = (
    <div className={cn('flex items-center gap-2', disposicion === 'bloque' && 'justify-end')}>
      <Boton variante="sutil" tamano={tamano} disabled={cargando} onClick={onCancelar}>
        {etiquetaCancelar}
      </Boton>
      <Boton variante={varianteConfirmar} tamano={tamano} cargando={cargando} autoFocus onClick={onConfirmar}>
        {etiquetaConfirmar}
      </Boton>
    </div>
  )

  if (disposicion === 'linea') {
    return (
      <span
        role="group"
        aria-label="Confirmar"
        onKeyDown={alTecla}
        className={cn('flex items-center gap-2', className)}
      >
        {advertencia !== undefined && <span className="text-texto-tenue text-xs">{advertencia}</span>}
        {botones}
      </span>
    )
  }

  return (
    <div role="group" aria-label="Confirmar" onKeyDown={alTecla} className={cn('flex flex-col gap-2', className)}>
      {advertencia !== undefined && <p className="text-texto-sutil text-xs">{advertencia}</p>}
      {error !== null && error !== undefined && <AvisoEnLinea variante="error" mensaje={error} />}
      {botones}
    </div>
  )
}
