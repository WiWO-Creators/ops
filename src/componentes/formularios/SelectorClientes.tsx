'use client'

import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { SelectorBuscableMultiple } from '@/componentes/formularios/SelectorBuscableMultiple'
import { GLOSARIO } from '@/dominio/glosario'

/** Lo minimo que el selector necesita de un Cliente: como se llama y con que se lo dibuja. */
export interface ClienteElegible {
  id: number
  company: string
  image_url: string | null
}

interface PropsSelectorClientes {
  clientes: ClienteElegible[]
  elegidos: number[]
  onCambiar: (ids: number[]) => void
  id?: string
}

/**
 * Elige varios Clientes: hoy, de cuales es {@link GLOSARIO.focal} una persona.
 *
 * Es el gemelo de `SelectorPersonas` para el otro lado de la relacion, y se ve igual a proposito: la
 * misma pantalla se edita desde la ficha del Cliente con uno y desde la de la persona con el otro, y
 * dos controles distintos para la misma decision se leen como dos decisiones distintas.
 *
 * @param clientes catalogo completo entre el que se elige
 * @param elegidos ids ya elegidos
 * @param onCambiar recibe la lista entera de ids cada vez que se agrega o se saca uno
 * @param id para enlazar la etiqueta del campo con el disparador
 */
export function SelectorClientes ({ clientes, elegidos, onCambiar, id }: PropsSelectorClientes) {
  const opciones = useMemo(
    () => clientes.map((cliente) => ({ id: cliente.id, nombre: cliente.company, imagen: cliente.image_url })),
    [clientes]
  )

  const singular = GLOSARIO.cliente.singular.toLowerCase()
  const plural = GLOSARIO.cliente.plural.toLowerCase()

  return (
    <SelectorBuscableMultiple
      id={id}
      opciones={opciones}
      elegidos={elegidos}
      onCambiar={onCambiar}
      icono={Building2}
      resumen={(lista) => lista.length === 0
        ? `Agregar ${plural}`
        : `${lista.length} ${lista.length === 1 ? singular : plural}`}
      placeholder={`Buscar un ${singular}…`}
      sinResultados="Ninguno con ese nombre."
      etiquetaSacar={(nombre) => `Sacar a ${nombre}`}
    />
  )
}
