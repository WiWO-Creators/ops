'use client'

import { useMemo } from 'react'
import { FolderPlus } from 'lucide-react'
import { SelectorBuscableMultiple } from '@/componentes/formularios/SelectorBuscableMultiple'
import { GLOSARIO } from '@/dominio/glosario'
import type { Referencia } from '@/datos/recursos'

/** Cuántos nombres se pintan como chip antes de resumir el resto en un contador. */
const CHIPS_VISIBLES = 8

interface PropsSelectorEspacios {
  espacios: readonly Referencia[]
  elegidos: readonly number[]
  onCambiar: (ids: number[]) => void
  id?: string
  disabled?: boolean
  /** Espacios que fallaron en el último intento de alta: se marcan para poder verlos y reintentar. */
  conFallo?: number[]
  /**
   * Cómo se llama lo que se elige: Proyecto, Licitación o Upsell. Por defecto, Proyecto.
   *
   * El alta ofrece cada clase por separado, así que el menú entero habla de la clase elegida.
   */
  nombres?: { singular: string, plural: string }
}

/**
 * Elige uno o varios Espacios destino.
 *
 * Reemplaza al `Selector` de una sola opción del alta: la misma tarea se pide muchas veces en varios
 * Espacios a la vez —la misma grilla para tres clientes de una campaña— y hacerlo hoy significa
 * repetir el formulario entero una vez por Espacio.
 *
 * Menú con marcas y no un `Select`: el de Radix es de una sola opción. Es el mismo control que
 * `SelectorPersonas`, así que se ve y se maneja igual que el de asignados que está tres campos más
 * abajo.
 *
 * **El buscador no es opcional**: el catálogo trae hasta quinientos Espacios y una lista de
 * quinientas filas sin filtrar no es un control. `BuscadorMenu` ya resuelve el foco y las teclas que
 * Radix se lleva puestas.
 *
 * **Los elegidos se ven como chips**, no como un "3 espacios": crear la misma tarea en el Espacio
 * equivocado es caro de deshacer —hay que borrarla en cada uno— y el resumen numérico obliga a abrir
 * el menú para saber dónde va a caer. Pasados `CHIPS_VISIBLES` se resume el excedente, porque una
 * alfombra de veinte chips empuja el botón de crear fuera de la pantalla.
 */
export function SelectorEspacios ({
  espacios, elegidos, onCambiar, id, disabled = false, conFallo = [], nombres = GLOSARIO.espacio
}: PropsSelectorEspacios) {
  const opciones = useMemo(
    () => espacios.map((espacio) => ({ id: espacio.id, nombre: espacio.name, patente: espacio.patente })),
    [espacios]
  )

  const singular = nombres.singular.toLowerCase()
  const plural = nombres.plural.toLowerCase()

  return (
    <SelectorBuscableMultiple
      id={id}
      disabled={disabled}
      opciones={opciones}
      elegidos={elegidos}
      onCambiar={onCambiar}
      conFallo={conFallo}
      chipsVisibles={CHIPS_VISIBLES}
      icono={FolderPlus}
      resumen={(lista) => lista.length === 0
        ? `Sin ${singular}`
        : lista.length === 1
          ? lista[0]?.nombre ?? `1 ${singular}`
          : `${lista.length} ${plural}`}
      placeholder={`Buscar ${singular}…`}
      sinResultados="Nada con ese nombre o patente."
    />
  )
}
