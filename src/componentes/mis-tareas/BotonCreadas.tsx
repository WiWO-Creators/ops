'use client'

import { BotonFiltroEnUrl } from '@/componentes/datos/BotonFiltroEnUrl'
import { alternarCreadas, seVenCreadas } from '@/dominio/mis-tareas'

/**
 * Cambia la hoja entre "lo que tengo asignado" y "lo que cree yo".
 *
 * Mismo control que `BotonCompletadas`; lo que cambia es el efecto: encendido reemplaza las dos
 * listas de asignadas por la de Tareas creadas por quien mira. Ver "Creadas por mi" en
 * `dominio/mis-tareas`.
 *
 * @returns El interruptor, listo para el encabezado de la pantalla.
 */
export function BotonCreadas () {
  return <BotonFiltroEnUrl etiqueta='Creadas por mí' activo={seVenCreadas} alternar={alternarCreadas} />
}
