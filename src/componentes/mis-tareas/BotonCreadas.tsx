'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { alternarCreadas, seVenCreadas } from '@/dominio/mis-tareas'

/**
 * Cambia la hoja entre "lo que tengo asignado" y "lo que cree yo".
 *
 * Mismo control que `BotonCompletadas` —`aria-pressed`, estado en la URL, `replace`—; lo que cambia
 * es el efecto: encendido reemplaza las dos listas de asignadas por la de Tareas creadas por quien
 * mira. Ver "Creadas por mi" en `dominio/mis-tareas`.
 *
 * @returns El interruptor, listo para el encabezado de la pantalla.
 */
export function BotonCreadas () {
  const router = useRouter()
  const params = useSearchParams()
  const activo = seVenCreadas(params)

  return (
    <Boton
      aria-pressed={activo}
      variante={activo ? 'marca' : 'secundario'}
      onClick={() => {
        const siguientes = alternarCreadas(new URLSearchParams(params.toString()))

        router.replace(`?${siguientes.toString()}`, { scroll: false })
      }}
    >
      Creadas por mí
    </Boton>
  )
}
