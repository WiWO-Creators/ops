'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { alternarCompletados, ESTADO_COMPLETO } from './tareas'

/** Alterna las tareas completadas conservando los demás filtros y reiniciando la página. */
export function BotonCompletados () {
  const router = useRouter()
  const params = useSearchParams()
  const activo = params.get('filter[status]') === String(ESTADO_COMPLETO)

  return (
    <Boton
      aria-pressed={activo}
      variante={activo ? 'marca' : 'secundario'}
      onClick={() => {
        const siguientes = alternarCompletados(new URLSearchParams(params.toString()))
        router.replace(`?${siguientes.toString()}`, { scroll: false })
      }}
    >
      Completados
    </Boton>
  )
}
