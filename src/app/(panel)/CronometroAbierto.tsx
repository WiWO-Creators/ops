'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TimerOff } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { leerError } from '@/datos/errores'
import { mensajeDeError } from '@/componentes/datos/tabla'

interface PropsCronometroAbierto {
  procesoId: number
  nombre: string
  /** Instante ISO en que arranco, tal como lo devuelve la API. */
  desde: string
}

/**
 * Aviso del cronometro que quedo corriendo, con el boton para detenerlo.
 *
 * Es lo primero que se ve al entrar porque es lo unico de la pantalla que cuesta dinero: un
 * cronometro olvidado factura horas que nadie trabajo, y el dueño se entera al cerrar el mes.
 *
 * El tiempo transcurrido se calcula en el cliente y se refresca cada segundo. Arranca en `null` y se
 * completa despues del montaje: el servidor y el navegador nunca coinciden al segundo, y pintarlo en
 * el HTML del servidor produce un error de hidratacion garantizado.
 */
export function CronometroAbierto ({ procesoId, nombre, desde }: PropsCronometroAbierto) {
  const router = useRouter()
  const [transcurrido, establecerTranscurrido] = useState<string | null>(null)
  const [deteniendo, establecerDeteniendo] = useState(false)
  const [error, establecerError] = useState<string | null>(null)

  useEffect(() => {
    const arranque = Date.parse(desde)

    // Una fecha que no se puede leer deja el contador en blanco, pero no rompe el aviso: lo que
    // importa —que hay un cronometro abierto y como detenerlo— sigue en pantalla.
    if (Number.isNaN(arranque)) return

    function refrescar () {
      establecerTranscurrido(comoReloj(Date.now() - arranque))
    }

    refrescar()
    const id = setInterval(refrescar, 1000)

    return () => clearInterval(id)
  }, [desde])

  async function detener () {
    establecerDeteniendo(true)
    establecerError(null)

    const respuesta = await fetch(`/api/bff/tasks/${procesoId}/timer`, { method: 'DELETE' })

    establecerDeteniendo(false)

    if (respuesta.ok) {
      // El backend es quien sabe como quedo: en vez de tocar el estado local, se vuelve a pedir.
      router.refresh()
      return
    }

    establecerError(mensajeDeError(await leerError(respuesta), []))
  }

  return (
    <div className="rounded-tarjeta border border-linea bg-superficie-elevada p-4 shadow-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-medio bg-texto-aviso/12 text-texto-aviso">
          <TimerOff size={20} strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">Tenés un cronómetro corriendo</p>
          <p className="truncate text-sm text-texto-tenue">{nombre}</p>
        </div>

        {transcurrido !== null && (
          <span
            data-numerico
            className="font-mono text-titulo font-semibold text-texto"
            aria-label={`Tiempo transcurrido: ${transcurrido}`}
          >
            {transcurrido}
          </span>
        )}

        <Boton variante="secundario" onClick={detener} cargando={deteniendo}>
          Detener
        </Boton>
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-texto-peligro">{error}</p>
      )}
    </div>
  )
}

/**
 * Formatea una duracion como `HH:MM:SS`.
 *
 * @param milisegundos duracion; una negativa (reloj del cliente atrasado respecto del servidor) se
 *   trata como cero en vez de mostrar un tiempo con signo
 * @returns el reloj con los tres tramos siempre en dos digitos
 */
function comoReloj (milisegundos: number): string {
  const total = Math.max(0, Math.floor(milisegundos / 1000))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segundos = total % 60

  return [horas, minutos, segundos].map((n) => String(n).padStart(2, '0')).join(':')
}
