'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

interface PropsBarraVerComoCliente {
  /** El contacto cuya sesion se esta usando. */
  contacto: string
  /** Quien del equipo abrio la sesion prestada. */
  suplantador: string
  /** El cliente del contacto, para volver a su ficha al terminar. */
  clienteId: number
}

/**
 * Franja fija del portal cuando alguien del equipo lo esta mirando como un contacto.
 *
 * Mismo criterio que `BarraSuplantacion` en el panel: va arriba de todo, en cada pantalla, porque lo
 * que se haga desde aca —aprobar, responder un ticket— queda hecho en nombre del contacto.
 *
 * Terminar sale del portal y nada mas: la sesion del panel nunca se toco, asi que se vuelve a la
 * ficha del cliente con la cuenta propia.
 */
export function BarraVerComoCliente ({ contacto, suplantador, clienteId }: PropsBarraVerComoCliente) {
  const router = useRouter()
  const [saliendo, setSaliendo] = useState(false)

  async function terminar (): Promise<void> {
    setSaliendo(true)

    try {
      await fetch('/api/sesion?portal=1', { method: 'DELETE' })
    } finally {
      router.replace(`/clientes/${clienteId}?tab=contactos`)
      router.refresh()
    }
  }

  return (
    <div className="bg-relleno-aviso text-relleno-aviso-contenido flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs font-semibold">
      <span>
        Estás viendo el portal como {contacto}. Lo que hagas queda en su nombre y registrado a nombre
        de {suplantador}.
      </span>
      <Boton variante="secundario" tamano="chico" cargando={saliendo} onClick={() => { void terminar() }}>
        Terminar
      </Boton>
    </div>
  )
}
