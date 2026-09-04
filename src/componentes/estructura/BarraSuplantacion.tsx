'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

/**
 * Franja fija que avisa que el panel se está mirando con la sesión de otra persona.
 *
 * Va arriba de todo y con el relleno de aviso a propósito: quien suplanta tiene que saberlo en cada
 * pantalla, no sólo en la que apretó el botón. Una suplantación que se olvida termina en acciones
 * hechas a nombre de otro sin querer.
 *
 * El nombre que muestra es el de `GET /me`, o sea el de la cuenta prestada: el armazón ya lo tiene
 * resuelto y no hace falta ninguna llamada extra para pintar esto.
 */
export function BarraSuplantacion ({ nombre }: { nombre: string }) {
  const router = useRouter()
  const [volviendo, setVolviendo] = useState(false)

  async function volver (): Promise<void> {
    setVolviendo(true)

    try {
      await fetch('/api/sesion/suplantar', { method: 'DELETE' })
    } finally {
      // Pase lo que pase con la revocación, la cookie ya volvió a ser la propia o la sesión prestada
      // quedó inservible: en los dos casos corresponde recargar con la identidad de vuelta.
      router.replace('/inicio')
      router.refresh()
    }
  }

  return (
    <div className="bg-relleno-aviso text-relleno-aviso-contenido flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs font-semibold">
      <span>Estás viendo el panel como {nombre}. No sos vos.</span>
      <Boton variante="secundario" tamano="chico" cargando={volviendo} onClick={() => { void volver() }}>
        Volver a mi cuenta
      </Boton>
    </div>
  )
}
