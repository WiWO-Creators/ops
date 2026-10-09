'use client'

import { useState, type ReactElement } from 'react'
import { GitMerge } from 'lucide-react'
import type { AccionDeFila } from '@/componentes/datos/MenuAccionesFila'
import type { EntidadFusionable, ReferenciaDeFusion } from '@/dominio/fusion'
import { DialogoFusion } from './DialogoFusion'
import { usePuedeFusionar } from './ProveedorFusion'

/** La fila que se esta fusionando y como refrescar su listado cuando termina. */
interface Pendiente {
  origen: ReferenciaDeFusion
  recargar: () => void
}

/** Lo que devuelve {@link useFusionDeFila}: las acciones del menu y el dialogo que hay que montar. */
export interface FusionDeFila<T> {
  /** Para `TablaRecurso.accionesDeFila`. Vacio si quien mira no puede fusionar. */
  acciones: (fila: T, recargar: () => void) => AccionDeFila[]
  /** El dialogo, montado una vez por tabla; `null` mientras no hay nada que fusionar. */
  dialogo: ReactElement | null
}

/**
 * La entrada "Fusionar con…" del menu "⋯" de un listado, con su dialogo.
 *
 * Un listado tiene muchas filas y un solo dialogo: el hook guarda cual fila se eligio y monta el
 * dialogo una vez. Al terminar recarga el listado, porque el origen acaba de irse a la Papelera.
 *
 * @param entidad cual de las tres entidades lista la tabla
 * @param referenciaDe saca el id y el nombre de una fila
 * @returns las acciones para el menu y el dialogo para renderizar junto a la tabla
 */
export function useFusionDeFila<T> (
  entidad: EntidadFusionable,
  referenciaDe: (fila: T) => ReferenciaDeFusion
): FusionDeFila<T> {
  const puede = usePuedeFusionar()
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)

  const acciones = (fila: T, recargar: () => void): AccionDeFila[] => {
    if (!puede) return []

    return [{
      clave: 'fusionar',
      etiqueta: 'Fusionar con…',
      icono: GitMerge,
      onSeleccionar: () => { setPendiente({ origen: referenciaDe(fila), recargar }) }
    }]
  }

  const dialogo = pendiente === null
    ? null
    : (
      <DialogoFusion
        entidad={entidad}
        origen={pendiente.origen}
        abierto
        onCerrar={() => { setPendiente(null) }}
        onFusionado={pendiente.recargar}
      />
      )

  return { acciones, dialogo }
}
