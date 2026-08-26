'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

/**
 * Cierra la sesion del portal.
 *
 * El `?portal=1` no es decorativo: le dice a `/api/sesion` cual de las dos cookies borrar. Sin el,
 * salir del portal cerraria la sesion del panel y dejaria la del cliente abierta.
 */
export function BotonSalirPortal () {
  const router = useRouter()
  const [saliendo, setSaliendo] = useState(false)

  async function salir (): Promise<void> {
    setSaliendo(true)

    try {
      await fetch('/api/sesion?portal=1', { method: 'DELETE' })
    } finally {
      router.replace('/')
      router.refresh()
    }
  }

  return (
    <Boton variante="sutil" tamano="chico" onClick={() => { void salir() }} disabled={saliendo}>
      Salir
    </Boton>
  )
}
