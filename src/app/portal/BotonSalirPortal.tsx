'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { conLimite, TIEMPO_ESCRITURA_MS } from '@/datos/red'

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
      await fetch('/api/sesion?portal=1', { method: 'DELETE', signal: conLimite(undefined, TIEMPO_ESCRITURA_MS) })
    } catch {
      // Sin respuesta la sesion se da por terminada igual: el destino la revalida.
    } finally {
      router.replace('/')
      router.refresh()
    }
  }

  return (
    <Boton variante="sutil" tamano="chico" data-rastreo="sesion.salir" onClick={() => { void salir() }} disabled={saliendo}>
      Salir
    </Boton>
  )
}
