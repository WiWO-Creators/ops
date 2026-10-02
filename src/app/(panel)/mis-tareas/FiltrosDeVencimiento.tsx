'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  conFiltroDeVencimiento, ETIQUETAS_DE_VENCIMIENTO, FILTROS_DE_VENCIMIENTO, filtroDeVencimiento,
  type FiltroDeVencimiento
} from '@/dominio/mis-tareas'

const OPCIONES = FILTROS_DE_VENCIMIENTO.map((filtro) => ({
  valor: filtro,
  etiqueta: ETIQUETAS_DE_VENCIMIENTO[filtro]
}))

/**
 * Hoy / Vencidas / Esta semana / Todas, arriba de las dos listas de la hoja.
 *
 * El estado vive en la URL (`?vence=`), como el de "Completadas": sobrevive al refresco, se
 * comparte con un enlace y el boton "Atras" no tiene que deshacerlo filtro por filtro (`replace`).
 *
 * Es el `Segmentado` del resto del panel y no pestañas: no cambia de panel, acota las mismas dos
 * listas.
 *
 * @returns el grupo de filtros
 */
export function FiltrosDeVencimiento () {
  const router = useRouter()
  const params = useSearchParams()

  return (
    <Segmentado
      etiqueta="Filtrar por vencimiento"
      opciones={OPCIONES}
      activo={filtroDeVencimiento(params)}
      tamano="medio"
      className="max-w-full overflow-x-auto"
      onElegir={(valor) => {
        const filtro = valor as FiltroDeVencimiento
        const siguientes = conFiltroDeVencimiento(new URLSearchParams(params.toString()), filtro)
        const texto = siguientes.toString()

        router.replace(texto === '' ? '?' : `?${texto}`, { scroll: false })
      }}
    />
  )
}
