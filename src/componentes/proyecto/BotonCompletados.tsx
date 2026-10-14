'use client'

import { BotonFiltroEnUrl } from '@/componentes/datos/BotonFiltroEnUrl'
import { alternarCompletados, FILTRO_COMPLETADAS } from './tareas'

const verSoloCompletadas = (params: URLSearchParams) =>
  params.get('filter[status]') === FILTRO_COMPLETADAS

/** Alterna las tareas completadas conservando los demás filtros y reiniciando la página. */
export function BotonCompletados () {
  return <BotonFiltroEnUrl etiqueta='Completadas' activo={verSoloCompletadas} alternar={alternarCompletados} />
}
