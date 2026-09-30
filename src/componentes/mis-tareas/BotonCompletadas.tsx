'use client'

import { BotonFiltroEnUrl } from '@/componentes/datos/BotonFiltroEnUrl'
import { alternarCompletadas, seVenCompletadas } from '@/dominio/mis-tareas'

/**
 * Suma las Tareas ya completadas a las dos listas de la hoja, o las vuelve a esconder.
 *
 * Es el hermano de `BotonCompletados` de `/procesos` —mismo control y misma etiqueta—, con la
 * diferencia que le da sentido aca: alla el boton deja ver SOLO las completadas, y aca las agrega a
 * las abiertas. Una Tarea cerrada por error se corrige en la fila donde estaba, que es lo que el
 * interruptor vino a resolver; separarlas en dos vistas obligaria a saber de antemano en cual quedo.
 *
 * @returns El interruptor, listo para el encabezado de la pantalla.
 */
export function BotonCompletadas () {
  return <BotonFiltroEnUrl etiqueta='Completadas' activo={seVenCompletadas} alternar={alternarCompletadas} />
}
