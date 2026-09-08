'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { ESTADO_COMPLETO } from './tareas'

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
        const siguientes = new URLSearchParams(params.toString())
        if (activo) siguientes.delete('filter[status]')
        else siguientes.set('filter[status]', String(ESTADO_COMPLETO))
        siguientes.delete('page')
        router.replace(`?${siguientes.toString()}`, { scroll: false })
      }}
    >
      Completados
    </Boton>
  )
}
