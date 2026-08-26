'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

/** Cierra la sesion y vuelve a la pantalla de acceso. */
export function BotonSalir () {
  const router = useRouter()
  const [saliendo, establecerSaliendo] = useState(false)

  async function salir (): Promise<void> {
    establecerSaliendo(true)

    try {
      await fetch('/api/sesion', { method: 'DELETE' })
    } finally {
      // Pase lo que pase con la API, la cookie ya se borro del lado del servidor o la sesion quedo
      // inservible: en los dos casos corresponde ir a entrar.
      router.replace('/colab')
      router.refresh()
    }
  }

  return (
    <Boton variante="sutil" tamano="chico" cargando={saliendo} onClick={() => { void salir() }}>
      Salir
    </Boton>
  )
}
