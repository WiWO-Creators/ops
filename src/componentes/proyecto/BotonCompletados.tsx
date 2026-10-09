'use client'

import { BotonFiltroEnUrl } from '@/componentes/datos/BotonFiltroEnUrl'
import { alternarCompletados, FILTRO_CERRADAS } from './tareas'

const verSoloCompletadas = (params: URLSearchParams) =>
  params.get('filter[status]') === FILTRO_CERRADAS

/** Alterna las tareas completadas conservando los demás filtros y reiniciando la página. */
export function BotonCompletados () {
  return <BotonFiltroEnUrl etiqueta='Completadas' activo={verSoloCompletadas} alternar={alternarCompletados} />
}
