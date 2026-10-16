'use client'

import { Segmentado } from '@/componentes/formularios/Segmentado'
import type { ModalidadDeJornada } from '@/datos/live'
import { esModalidadDeJornada, OPCIONES_DE_MODALIDAD } from '@/dominio/live'

interface PropsSelectorDeModalidad {
  /** La modalidad puesta, o `null` si la persona no indicó ninguna. */
  valor: ModalidadDeJornada | null
  /** Se llama con la modalidad elegida, o con `null` al volver a pulsar la puesta (quitarla). */
  onElegir: (modalidad: ModalidadDeJornada | null) => void
  /** `true` mientras hay una escritura en vuelo: el control no responde a nuevos clics. */
  deshabilitado?: boolean
  className?: string
}

/**
 * Elige cómo se trabaja la jornada: «Oficina» o «Teletrabajo».
 *
 * Es opcional, y por eso el control no obliga: sin ninguna puesta la jornada queda «sin indicar», y
 * volver a pulsar la puesta la quita. Un campo que se puede dejar en blanco no puede ser un grupo de
 * dos botones donde uno siempre está marcado.
 *
 * Reutiliza `Segmentado`, el control de una elección entre pocas alternativas del producto, en vez
 * de dibujar un tercer estilo de «activo». Se usa en la ventana de apertura (la elección viaja con
 * el alta) y en el control de la cabecera (cambia la jornada ya abierta).
 *
 * @param valor la modalidad puesta, o `null`
 * @param onElegir se llama con la elegida, o con `null` al quitarla
 * @param deshabilitado ignora los clics mientras se guarda
 * @returns el grupo de dos opciones
 */
export function SelectorDeModalidad ({ valor, onElegir, deshabilitado = false, className }: PropsSelectorDeModalidad) {
  return (
    <Segmentado
      etiqueta="Modalidad de la jornada"
      opciones={OPCIONES_DE_MODALIDAD}
      activo={valor}
      className={className}
      onElegir={(elegida) => {
        if (deshabilitado || !esModalidadDeJornada(elegida)) return

        onElegir(elegida === valor ? null : elegida)
      }}
    />
  )
}
